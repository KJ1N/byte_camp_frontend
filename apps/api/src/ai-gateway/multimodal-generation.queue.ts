import { Queue, type ConnectionOptions, type JobsOptions, type QueueOptions } from "bullmq";

import type {
  MultimodalGenerationJobData,
  MultimodalGenerationReturnValue,
} from "./multimodal-generation.types";

export const MULTIMODAL_GENERATION_QUEUE_NAME = "ai-multimodal-generation";
export const MULTIMODAL_GENERATION_JOB_NAME = "generate";
export const MULTIMODAL_GENERATION_QUEUE_CLIENT = "MULTIMODAL_GENERATION_QUEUE_CLIENT";

export type MultimodalGenerationQueue = Queue<
  MultimodalGenerationJobData,
  MultimodalGenerationReturnValue,
  typeof MULTIMODAL_GENERATION_JOB_NAME
>;

export function createMultimodalGenerationRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const db = Number.parseInt(url.pathname.replace(/^\//, ""), 10);

  return {
    host: url.hostname,
    port: url.port ? Number.parseInt(url.port, 10) : 6379,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(Number.isFinite(db) ? { db } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}

export function createMultimodalGenerationQueue(
  redisUrl: string,
  defaultJobOptions: JobsOptions,
): MultimodalGenerationQueue {
  return new Queue(MULTIMODAL_GENERATION_QUEUE_NAME, {
    connection: createMultimodalGenerationRedisConnection(redisUrl),
    defaultJobOptions,
  } satisfies QueueOptions) as MultimodalGenerationQueue;
}

export function createMultimodalGenerationDefaultJobOptions(input: {
  removeOnCompleteAgeSeconds: number;
  removeOnFailAgeSeconds: number;
}): JobsOptions {
  return {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
    removeOnComplete: {
      age: input.removeOnCompleteAgeSeconds,
    },
    removeOnFail: {
      age: input.removeOnFailAgeSeconds,
    },
  };
}
