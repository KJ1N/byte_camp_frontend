import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MultimodalGenerationQueueService } from "./multimodal-generation-queue.service";

type JobState = "waiting" | "active" | "completed" | "failed";

interface MockJob {
  id: string;
  data: {
    userId: string;
    input: {
      topic: string;
      audience: string;
      style: string;
      imageCount?: number;
    };
    createdAt: string;
    cancelRequested?: boolean;
  };
  progress: unknown;
  returnvalue?: unknown;
  failedReason?: string;
  timestamp: number;
  finishedOn?: number;
  state: JobState;
  getState: () => Promise<JobState>;
  updateProgress: (progress: unknown) => Promise<void>;
  updateData: (data: MockJob["data"]) => Promise<void>;
}

const ServiceCtor = MultimodalGenerationQueueService as unknown as new (...args: unknown[]) => MultimodalGenerationQueueService;

function createConfig(values: Record<string, string | undefined> = {}) {
  return {
    get: (key: string) => values[key],
  };
}

function createMockJob(overrides: Partial<MockJob> = {}): MockJob {
  const job: MockJob = {
    id: "task-1",
    data: {
      userId: "user-1",
      input: {
        topic: "AI writing",
        audience: "creators",
        style: "科普",
        imageCount: 2,
      },
      createdAt: "2026-06-13T00:00:00.000Z",
    },
    progress: {
      stage: "queued",
      percent: 0,
      images: [],
      updatedAt: "2026-06-13T00:00:00.000Z",
    },
    timestamp: Date.parse("2026-06-13T00:00:00.000Z"),
    state: "waiting",
    async getState() {
      return job.state;
    },
    async updateProgress(progress: unknown) {
      job.progress = progress;
    },
    async updateData(data: MockJob["data"]) {
      job.data = data;
    },
    ...overrides,
  };

  return job;
}

function createMockQueue(seedJobs: MockJob[] = []) {
  const jobs = new Map(seedJobs.map((job) => [job.id, job]));
  let nextId = 1;

  return {
    jobs,
    async add(_name: string, data: MockJob["data"]) {
      const job = createMockJob({
        id: `task-${nextId++}`,
        data,
      });
      jobs.set(job.id, job);
      return job;
    },
    async getJob(id: string) {
      return jobs.get(id) ?? null;
    },
    async close() {
      return undefined;
    },
  };
}

describe("MultimodalGenerationQueueService", () => {
  it("creates a queued multimodal generation task", async () => {
    const queue = createMockQueue();
    const service = new ServiceCtor(createConfig(), queue);

    const response = await service.createTask("user-1", {
      topic: "AI writing",
      audience: "creators",
      style: "科普",
      imageCount: 2,
    });

    assert.equal(response.status, "queued");
    assert.equal(response.taskId, "task-1");
    assert.equal(response.pollUrl, "/ai/multimodal-generations/task-1");
    assert.equal(queue.jobs.get("task-1")?.data.userId, "user-1");
    const progress = queue.jobs.get("task-1")?.progress as { updatedAt: string };
    assert.deepEqual(progress, {
      stage: "queued",
      percent: 0,
      images: [],
      updatedAt: progress.updatedAt,
    });
  });

  it("maps completed jobs to task responses with results", async () => {
    const completedAt = Date.parse("2026-06-13T00:01:00.000Z");
    const job = createMockJob({
      state: "completed",
      progress: {
        stage: "completed",
        percent: 100,
        title: "上海租界掠影",
        images: [],
        updatedAt: "2026-06-13T00:01:00.000Z",
      },
      returnvalue: {
        completedAt: "2026-06-13T00:01:00.000Z",
        result: {
          textModel: "text-model",
          imageModel: "image-model",
          title: "上海租界掠影",
          outline: ["历史背景"],
          bodyText: "正文",
          body: { type: "doc", content: [] },
          images: [],
        },
      },
      finishedOn: completedAt,
    });
    const service = new ServiceCtor(createConfig(), createMockQueue([job]));

    const response = await service.getTask("user-1", "task-1");

    assert.equal(response.status, "completed");
    assert.equal(response.result?.title, "上海租界掠影");
    assert.equal(response.finishedAt, "2026-06-13T00:01:00.000Z");
  });

  it("marks an active task as cancellation requested", async () => {
    const job = createMockJob({ state: "active" });
    const service = new ServiceCtor(createConfig(), createMockQueue([job]));

    const response = await service.cancelTask("user-1", "task-1");

    assert.equal(response.status, "cancelled");
    assert.equal(job.data.cancelRequested, true);
    assert.equal((job.progress as { stage: string }).stage, "cancelled");
    assert.equal(await service.isTaskCancellationRequested("task-1"), true);
  });

  it("does not expose another user's task", async () => {
    const service = new ServiceCtor(createConfig(), createMockQueue([createMockJob()]));

    await assert.rejects(
      () => service.getTask("user-2", "task-1"),
      (error: unknown) => {
        assert.equal((error as { getStatus?: () => number }).getStatus?.(), 404);
        return true;
      },
    );
  });

  it("returns a service unavailable error when Redis queue is not configured", async () => {
    const service = new ServiceCtor(createConfig());

    await assert.rejects(
      () =>
        service.createTask("user-1", {
          topic: "AI writing",
          audience: "creators",
          style: "科普",
        }),
      (error: unknown) => {
        assert.equal((error as { getStatus?: () => number }).getStatus?.(), 503);
        return true;
      },
    );
  });
});
