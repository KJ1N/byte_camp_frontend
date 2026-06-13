import type {
  GeneratedImageResult,
  MultimodalGenerationProgress,
  MultimodalGenerationTaskResponse,
  MultimodalImageResult,
} from "@bytecamp-aigc/shared";

export type MultimodalTaskWorkbenchStatus =
  | "queued"
  | "planning"
  | "text_ready"
  | "generating_images"
  | "completed"
  | "failed"
  | "idle";

export const defaultMultimodalTaskPollIntervalMs = 1500;

export function shouldPollMultimodalTask(task: MultimodalGenerationTaskResponse) {
  return task.status === "queued" || task.status === "active";
}

export function getWorkbenchStatusFromMultimodalTask(
  task: MultimodalGenerationTaskResponse,
): MultimodalTaskWorkbenchStatus {
  if (task.status === "completed") return "completed";
  if (task.status === "failed" || task.status === "cancelled" || task.status === "not_found") return "failed";

  if (
    task.progress.stage === "planning" ||
    task.progress.stage === "text_ready" ||
    task.progress.stage === "generating_images"
  ) {
    return task.progress.stage;
  }

  return "queued";
}

export function getMultimodalTaskMessage(task: MultimodalGenerationTaskResponse) {
  if (task.status === "not_found") return "任务不存在或结果已过期，请重新生成。";
  if (task.status === "cancelled") return "任务已取消。";
  if (task.status === "failed") return task.failedReason || "多模态生成任务失败，请稍后重试。";
  return "";
}

export function multimodalImagesFromProgress(
  progress: MultimodalGenerationProgress,
): MultimodalImageResult[] {
  return progress.images.map((image) => {
    if (image.status === "completed" && image.url && image.model) {
      return {
        index: image.index,
        prompt: image.prompt,
        caption: image.caption,
        alt: image.alt,
        status: "completed",
        url: image.url,
        model: image.model,
      } satisfies GeneratedImageResult;
    }

    return {
      index: image.index,
      prompt: image.prompt,
      caption: image.caption,
      alt: image.alt,
      status: "failed",
      model: image.model || "unknown-image-model",
      message: image.message || "图片尚未生成完成。",
    };
  });
}
