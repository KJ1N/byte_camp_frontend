import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MultimodalGenerationTaskResponse } from "@bytecamp-aigc/shared";
import {
  getMultimodalTaskMessage,
  getWorkbenchStatusFromMultimodalTask,
  multimodalImagesFromProgress,
  shouldPollMultimodalTask,
} from "./multimodal-task.ts";

function createTask(
  overrides: Partial<MultimodalGenerationTaskResponse> = {},
): MultimodalGenerationTaskResponse {
  return {
    taskId: "task-1",
    status: "queued",
    progress: {
      stage: "queued",
      percent: 0,
      images: [],
      updatedAt: "2026-06-13T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("multimodal task helpers", () => {
  it("keeps polling only for queued and active tasks", () => {
    assert.equal(shouldPollMultimodalTask(createTask({ status: "queued" })), true);
    assert.equal(shouldPollMultimodalTask(createTask({ status: "active" })), true);
    assert.equal(shouldPollMultimodalTask(createTask({ status: "completed" })), false);
    assert.equal(shouldPollMultimodalTask(createTask({ status: "failed" })), false);
  });

  it("maps task and progress states to workbench states", () => {
    assert.equal(
      getWorkbenchStatusFromMultimodalTask(
        createTask({ status: "active", progress: { ...createTask().progress, stage: "planning" } }),
      ),
      "planning",
    );
    assert.equal(
      getWorkbenchStatusFromMultimodalTask(
        createTask({ status: "active", progress: { ...createTask().progress, stage: "generating_images" } }),
      ),
      "generating_images",
    );
    assert.equal(getWorkbenchStatusFromMultimodalTask(createTask({ status: "completed" })), "completed");
    assert.equal(getWorkbenchStatusFromMultimodalTask(createTask({ status: "cancelled" })), "failed");
  });

  it("normalizes completed and pending progress images for draft assembly", () => {
    const images = multimodalImagesFromProgress({
      stage: "generating_images",
      percent: 70,
      updatedAt: "2026-06-13T00:00:00.000Z",
      images: [
        {
          index: 0,
          prompt: "city",
          caption: "city caption",
          alt: "city alt",
          status: "completed",
          url: "https://example.test/city.png",
          model: "image-model",
        },
        {
          index: 1,
          prompt: "street",
          caption: "street caption",
          alt: "street alt",
          status: "generating",
        },
      ],
    });

    assert.deepEqual(images[0], {
      index: 0,
      prompt: "city",
      caption: "city caption",
      alt: "city alt",
      status: "completed",
      url: "https://example.test/city.png",
      model: "image-model",
    });
    assert.deepEqual(images[1], {
      index: 1,
      prompt: "street",
      caption: "street caption",
      alt: "street alt",
      status: "failed",
      model: "unknown-image-model",
      message: "图片尚未生成完成。",
    });
  });

  it("returns user-facing messages for terminal error states", () => {
    assert.equal(getMultimodalTaskMessage(createTask({ status: "cancelled" })), "任务已取消。");
    assert.equal(
      getMultimodalTaskMessage(createTask({ status: "not_found" })),
      "任务不存在或结果已过期，请重新生成。",
    );
    assert.equal(
      getMultimodalTaskMessage(createTask({ status: "failed", failedReason: "model timeout" })),
      "model timeout",
    );
  });
});
