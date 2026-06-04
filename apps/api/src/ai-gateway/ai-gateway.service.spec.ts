import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiGatewayService } from "./ai-gateway.service";

describe("AiGatewayService", () => {
  it("returns creator inspirations with topics that can prefill the workspace", async () => {
    const service = new AiGatewayService({
      get: (key: string) => (key === "AI_MODEL" ? "mock-model" : undefined),
    } as never);

    const response = await (service as unknown as {
      generateCreatorInspirations: () => Promise<{
        model: string;
        items: Array<{ id: string; topic: string; reason: string; category: string }>;
      }>;
    }).generateCreatorInspirations();

    assert.equal(response.model, "mock-model");
    assert.ok(response.items.length >= 5);

    for (const item of response.items) {
      assert.ok(item.id.trim());
      assert.ok(item.topic.trim());
      assert.ok(item.reason.trim());
      assert.ok(item.category.trim());
    }
  });
});
