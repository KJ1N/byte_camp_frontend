import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ScoringController } from "./scoring.controller";

describe("ScoringController", () => {
  it("scores the requested draft for the current user", async () => {
    const calls: Array<{ userId: string; draftId: string }> = [];
    const publishService = {
      scoreDraft: async (userId: string, draftId: string) => {
        calls.push({ userId, draftId });
        return { overall: 88 };
      },
    };
    const controller = new ScoringController(publishService as never);

    const result = await controller.score("user-1", { draftId: "draft-1" });

    assert.deepEqual(calls, [{ userId: "user-1", draftId: "draft-1" }]);
    assert.deepEqual(result, { overall: 88 });
  });
});
