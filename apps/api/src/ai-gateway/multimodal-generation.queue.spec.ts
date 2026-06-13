import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMultimodalGenerationRedisConnection,
  MULTIMODAL_GENERATION_QUEUE_NAME,
} from "./multimodal-generation.queue";

describe("multimodal generation queue config", () => {
  it("uses a BullMQ queue name without colon separators", () => {
    assert.equal(MULTIMODAL_GENERATION_QUEUE_NAME.includes(":"), false);
  });

  it("parses Redis URLs into BullMQ connection options", () => {
    assert.deepEqual(createMultimodalGenerationRedisConnection("redis://user:pass@localhost:6380/2"), {
      host: "localhost",
      port: 6380,
      username: "user",
      password: "pass",
      db: 2,
      maxRetriesPerRequest: null,
    });
  });
});
