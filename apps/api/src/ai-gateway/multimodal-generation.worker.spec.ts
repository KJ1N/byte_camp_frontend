import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MultimodalGenerationCancelledError } from "./ai-gateway.service";
import { MultimodalGenerationWorker } from "./multimodal-generation.worker";
import type { MultimodalGenerationProgress } from "@bytecamp-aigc/shared";

const WorkerCtor = MultimodalGenerationWorker as unknown as new (...args: unknown[]) => MultimodalGenerationWorker;

function createConfig(values: Record<string, string | undefined> = {}) {
  return {
    get: (key: string) => values[key],
  };
}

function createAiGatewayService() {
  const calls: Array<{ userId: string; topic: string }> = [];

  return {
    calls,
    generateMultimodalDraftWithProgress: async (
      input: { topic: string; audience: string; style: string },
      userId: string,
      options: {
        reportProgress?: (progress: MultimodalGenerationProgress) => Promise<void> | void;
      },
    ) => {
      calls.push({ userId, topic: input.topic });
      await options.reportProgress?.({
        stage: "planning",
        percent: 10,
        images: [],
        updatedAt: "2026-06-13T00:00:00.000Z",
      });
      await options.reportProgress?.({
        stage: "completed",
        percent: 100,
        title: "AI writing",
        images: [],
        updatedAt: "2026-06-13T00:00:01.000Z",
      });

      return {
        textModel: "text-model",
        imageModel: "image-model",
        title: "AI writing",
        outline: ["Intro"],
        bodyText: "Body",
        body: { type: "doc", content: [] },
        images: [],
      };
    },
  };
}

function createQueueService(cancelled = false) {
  return {
    isTaskCancellationRequested: async () => cancelled,
  };
}

function createJob() {
  const progressEvents: unknown[] = [];

  return {
    progressEvents,
    job: {
      id: "task-1",
      data: {
        userId: "user-1",
        input: {
          topic: "AI writing",
          audience: "creators",
          style: "科普",
        },
        createdAt: "2026-06-13T00:00:00.000Z",
      },
      updateProgress: async (progress: unknown) => {
        progressEvents.push(progress);
      },
    },
  };
}

describe("MultimodalGenerationWorker", () => {
  it("executes a multimodal generation job and returns the generated draft", async () => {
    const aiGateway = createAiGatewayService();
    const worker = new WorkerCtor(createConfig(), aiGateway, createQueueService(false));
    const { job, progressEvents } = createJob();

    const response = await worker.processJob(job);

    assert.equal(aiGateway.calls.length, 1);
    assert.deepEqual(aiGateway.calls[0], { userId: "user-1", topic: "AI writing" });
    assert.equal(response.result.title, "AI writing");
    assert.equal(progressEvents.length, 2);
    assert.equal((progressEvents[0] as { stage: string }).stage, "planning");
    assert.equal((progressEvents[1] as { stage: string }).stage, "completed");
  });

  it("throws a cancellation error when the task was cancelled before execution", async () => {
    const worker = new WorkerCtor(createConfig(), createAiGatewayService(), createQueueService(true));
    const { job, progressEvents } = createJob();

    await assert.rejects(
      () => worker.processJob(job),
      (error: unknown) => error instanceof MultimodalGenerationCancelledError,
    );
    assert.equal((progressEvents[0] as { stage: string }).stage, "cancelled");
  });
});
