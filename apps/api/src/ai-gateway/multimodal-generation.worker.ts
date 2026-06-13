import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, type JobProgress } from "bullmq";
import { AiGatewayService, MultimodalGenerationCancelledError } from "./ai-gateway.service";
import {
  createMultimodalGenerationRedisConnection,
  MULTIMODAL_GENERATION_QUEUE_NAME,
} from "./multimodal-generation.queue";
import { MultimodalGenerationQueueService } from "./multimodal-generation-queue.service";
import type {
  MultimodalGenerationJobData,
  MultimodalGenerationReturnValue,
} from "./multimodal-generation.types";

@Injectable()
export class MultimodalGenerationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MultimodalGenerationWorker.name);
  private worker: Worker<MultimodalGenerationJobData, MultimodalGenerationReturnValue> | null = null;
  private connection: ReturnType<typeof createMultimodalGenerationRedisConnection> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly queueService: MultimodalGenerationQueueService,
  ) {}

  onModuleInit() {
    const redisUrl = this.readConfig("REDIS_URL");
    if (!redisUrl) return;

    this.connection = createMultimodalGenerationRedisConnection(redisUrl);
    this.worker = new Worker<MultimodalGenerationJobData, MultimodalGenerationReturnValue>(
      MULTIMODAL_GENERATION_QUEUE_NAME,
      async (job) => this.processJob(job),
      {
        connection: this.connection,
        concurrency: this.readPositiveInt("MULTIMODAL_QUEUE_CONCURRENCY", 1),
      },
    );

    this.worker.on("failed", (job, error) => {
      const jobId = job?.id ?? "unknown";
      this.logger.warn(`多模态生成任务 ${jobId} 失败：${error.message}`);
    });
  }

  async onModuleDestroy() {
    try {
      await this.worker?.close();
    } catch {
      // The worker is optional; shutdown should continue when Redis is unavailable.
    }
  }

  async processJob(job: {
    id?: string | number;
    data: MultimodalGenerationJobData;
    updateProgress: (progress: JobProgress) => Promise<void>;
  }): Promise<MultimodalGenerationReturnValue> {
    const taskId = String(job.id);

    if (await this.queueService.isTaskCancellationRequested(taskId)) {
      await job.updateProgress({
        stage: "cancelled",
        percent: 0,
        images: [],
        updatedAt: new Date().toISOString(),
      });
      throw new MultimodalGenerationCancelledError();
    }

    const result = await this.aiGatewayService.generateMultimodalDraftWithProgress(
      job.data.input,
      job.data.userId,
      {
        reportProgress: (progress) => job.updateProgress(progress),
        shouldCancel: () => this.queueService.isTaskCancellationRequested(taskId),
      },
    );

    return {
      result,
      completedAt: new Date().toISOString(),
    };
  }

  private readConfig(key: string) {
    const value = this.configService.get<string>(key);
    return typeof value === "string" ? value.trim() : undefined;
  }

  private readPositiveInt(key: string, fallback: number) {
    const value = Number.parseInt(this.readConfig(key) ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
