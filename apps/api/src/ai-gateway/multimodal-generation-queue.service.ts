import {
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import type {
  CancelMultimodalGenerationTaskResponse,
  CreateMultimodalGenerationTaskResponse,
  GeneratedMultimodalDraft,
  GenerateMultimodalInput,
  MultimodalGenerationProgress,
  MultimodalGenerationProgressImage,
  MultimodalGenerationTaskResponse,
  MultimodalGenerationTaskStatus,
} from "@bytecamp-aigc/shared";
import {
  createMultimodalGenerationDefaultJobOptions,
  createMultimodalGenerationQueue,
  MULTIMODAL_GENERATION_JOB_NAME,
  MULTIMODAL_GENERATION_QUEUE_CLIENT,
  type MultimodalGenerationQueue,
} from "./multimodal-generation.queue";
import type {
  MultimodalGenerationJobData,
  MultimodalGenerationReturnValue,
} from "./multimodal-generation.types";

type MultimodalGenerationJob = Job<
  MultimodalGenerationJobData,
  MultimodalGenerationReturnValue,
  typeof MULTIMODAL_GENERATION_JOB_NAME
>;

@Injectable()
export class MultimodalGenerationQueueService implements OnModuleDestroy {
  private readonly queue: MultimodalGenerationQueue | null;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(MULTIMODAL_GENERATION_QUEUE_CLIENT)
    queueClient?: MultimodalGenerationQueue,
  ) {
    const redisUrl = this.readConfig("REDIS_URL");
    this.queue =
      queueClient ??
      (redisUrl
        ? createMultimodalGenerationQueue(redisUrl, {
            ...createMultimodalGenerationDefaultJobOptions({
              removeOnCompleteAgeSeconds: this.readPositiveInt(
                "MULTIMODAL_TASK_REMOVE_ON_COMPLETE_SECONDS",
                24 * 60 * 60,
              ),
              removeOnFailAgeSeconds: this.readPositiveInt(
                "MULTIMODAL_TASK_REMOVE_ON_FAIL_SECONDS",
                7 * 24 * 60 * 60,
              ),
            }),
          })
        : null);
  }

  async createTask(
    userId: string,
    input: GenerateMultimodalInput,
  ): Promise<CreateMultimodalGenerationTaskResponse> {
    const queue = this.getQueueOrThrow();
    const job = await queue.add(MULTIMODAL_GENERATION_JOB_NAME, {
      userId,
      input,
      createdAt: new Date().toISOString(),
    });
    const taskId = String(job.id);

    await job.updateProgress(this.createQueuedProgress());

    return {
      taskId,
      status: "queued",
      pollUrl: `/ai/multimodal-generations/${taskId}`,
    };
  }

  async getTask(userId: string, taskId: string): Promise<MultimodalGenerationTaskResponse> {
    const queue = this.getQueueOrThrow();
    const job = await queue.getJob(taskId);

    if (!job) {
      return {
        taskId,
        status: "not_found",
        progress: this.createQueuedProgress(),
      };
    }

    this.assertOwnsJob(job, userId);
    return this.responseFromJob(job);
  }

  async cancelTask(userId: string, taskId: string): Promise<CancelMultimodalGenerationTaskResponse> {
    const queue = this.getQueueOrThrow();
    const job = await queue.getJob(taskId);

    if (!job) {
      return {
        taskId,
        status: "not_found",
        message: "任务不存在或结果已过期。",
      };
    }

    this.assertOwnsJob(job, userId);

    const response = await this.responseFromJob(job);
    if (response.status === "completed") {
      return {
        taskId,
        status: "completed",
        message: "任务已完成，结果已可使用。",
      };
    }
    if (response.status === "failed") {
      return {
        taskId,
        status: "failed",
        message: "任务已失败，无需取消。",
      };
    }
    if (response.status === "cancelled") {
      return {
        taskId,
        status: "cancelled",
        message: "任务已取消。",
      };
    }

    await job.updateData({
      ...job.data,
      cancelRequested: true,
    });
    await job.updateProgress({
      ...response.progress,
      stage: "cancelled",
      updatedAt: new Date().toISOString(),
    });

    return {
      taskId,
      status: "cancelled",
      message: "已请求取消任务，正在停止后续生成步骤。",
    };
  }

  async isTaskCancellationRequested(taskId: string): Promise<boolean> {
    if (!this.queue) return false;

    try {
      const job = await this.queue.getJob(taskId);
      if (!job) return false;
      const progress = this.normalizeProgress(job.progress);
      return Boolean(job.data.cancelRequested || progress.stage === "cancelled");
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    try {
      await this.queue?.close();
    } catch {
      // Redis is optional for the API; shutdown should not fail if the queue is already closed.
    }
  }

  private async responseFromJob(job: MultimodalGenerationJob): Promise<MultimodalGenerationTaskResponse> {
    const state = await job.getState();
    const progress = this.normalizeProgress(job.progress);
    const status = this.mapJobStatus(state, progress);
    const returnValue = this.normalizeReturnValue(job.returnvalue);

    return {
      taskId: String(job.id),
      status,
      progress,
      ...(status === "completed" && returnValue ? { result: returnValue.result } : {}),
      ...(job.failedReason ? { failedReason: job.failedReason } : {}),
      ...(Number.isFinite(job.timestamp) ? { createdAt: new Date(job.timestamp).toISOString() } : {}),
      ...(Number.isFinite(job.finishedOn) && job.finishedOn
        ? { finishedAt: new Date(job.finishedOn).toISOString() }
        : {}),
    };
  }

  private mapJobStatus(state: string, progress: MultimodalGenerationProgress): MultimodalGenerationTaskStatus {
    if (progress.stage === "cancelled") return "cancelled";
    if (state === "completed") return "completed";
    if (state === "failed") return "failed";
    if (state === "active") return "active";
    return "queued";
  }

  private normalizeProgress(value: unknown): MultimodalGenerationProgress {
    if (!this.isRecord(value)) return this.createQueuedProgress();

    const stage = this.normalizeStage(value.stage);
    const percent = this.normalizePercent(value.percent);
    const images = this.normalizeImages(value.images);
    const updatedAt = this.normalizeText(value.updatedAt) || new Date().toISOString();
    const textModel = this.normalizeText(value.textModel);
    const imageModel = this.normalizeText(value.imageModel);
    const title = this.normalizeText(value.title);
    const bodyText = this.normalizeText(value.bodyText);
    const outline = Array.isArray(value.outline)
      ? value.outline.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined;

    return {
      stage,
      percent,
      ...(textModel ? { textModel } : {}),
      ...(imageModel ? { imageModel } : {}),
      ...(title ? { title } : {}),
      ...(outline?.length ? { outline } : {}),
      ...(bodyText ? { bodyText } : {}),
      images,
      updatedAt,
    };
  }

  private normalizeStage(value: unknown): MultimodalGenerationProgress["stage"] {
    if (
      value === "queued" ||
      value === "planning" ||
      value === "text_ready" ||
      value === "generating_images" ||
      value === "completed" ||
      value === "failed" ||
      value === "cancelled"
    ) {
      return value;
    }

    return "queued";
  }

  private normalizePercent(value: unknown) {
    const numberValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numberValue)) return 0;
    return Math.max(0, Math.min(100, Math.round(numberValue)));
  }

  private normalizeImages(value: unknown): MultimodalGenerationProgressImage[] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item) => {
        if (!this.isRecord(item)) return undefined;
        const index = typeof item.index === "number" && Number.isInteger(item.index) ? item.index : -1;
        const prompt = this.normalizeText(item.prompt);
        const caption = this.normalizeText(item.caption);
        const alt = this.normalizeText(item.alt);
        const status = this.normalizeImageStatus(item.status);
        const url = this.normalizeText(item.url);
        const model = this.normalizeText(item.model);
        const message = this.normalizeText(item.message);

        if (index < 0 || !prompt || !caption || !alt) return undefined;

        return {
          index,
          prompt,
          caption,
          alt,
          status,
          ...(url ? { url } : {}),
          ...(model ? { model } : {}),
          ...(message ? { message } : {}),
        };
      })
      .filter((item): item is MultimodalGenerationProgressImage => Boolean(item));
  }

  private normalizeImageStatus(value: unknown): MultimodalGenerationProgressImage["status"] {
    if (value === "pending" || value === "generating" || value === "completed" || value === "failed") {
      return value;
    }

    return "pending";
  }

  private normalizeReturnValue(value: unknown): MultimodalGenerationReturnValue | null {
    if (!this.isRecord(value) || !this.isGeneratedMultimodalDraft(value.result)) return null;

    return {
      result: value.result,
      completedAt: this.normalizeText(value.completedAt) || new Date().toISOString(),
    };
  }

  private isGeneratedMultimodalDraft(value: unknown): value is GeneratedMultimodalDraft {
    return (
      this.isRecord(value) &&
      typeof value.textModel === "string" &&
      typeof value.imageModel === "string" &&
      typeof value.title === "string" &&
      Array.isArray(value.outline) &&
      typeof value.bodyText === "string" &&
      this.isRecord(value.body) &&
      value.body.type === "doc" &&
      Array.isArray(value.images)
    );
  }

  private createQueuedProgress(): MultimodalGenerationProgress {
    return {
      stage: "queued",
      percent: 0,
      images: [],
      updatedAt: new Date().toISOString(),
    };
  }

  private assertOwnsJob(job: MultimodalGenerationJob, userId: string) {
    if (job.data.userId === userId) return;
    throw new NotFoundException("Task not found");
  }

  private getQueueOrThrow() {
    if (!this.queue) {
      throw new ServiceUnavailableException("多模态队列服务未启用，请配置 REDIS_URL。");
    }

    return this.queue;
  }

  private readConfig(key: string) {
    const value = this.configService.get<string>(key);
    return typeof value === "string" ? value.trim() : undefined;
  }

  private readPositiveInt(key: string, fallback: number) {
    const value = Number.parseInt(this.readConfig(key) ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private normalizeText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
  }
}
