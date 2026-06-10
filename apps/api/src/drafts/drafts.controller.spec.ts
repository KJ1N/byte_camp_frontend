import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DraftsController } from "./drafts.controller";

function createController() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const draftsService = {
    createDraft: async (...args: unknown[]) => {
      calls.push({ method: "createDraft", args });
      return { id: "draft-1" };
    },
    listMine: async (...args: unknown[]) => {
      calls.push({ method: "listMine", args });
      return [{ id: "draft-1" }];
    },
    getMineById: async (...args: unknown[]) => {
      calls.push({ method: "getMineById", args });
      return { id: "draft-1" };
    },
    updateDraft: async (...args: unknown[]) => {
      calls.push({ method: "updateDraft", args });
      return { id: "draft-1", version: 2 };
    },
    deleteDraft: async (...args: unknown[]) => {
      calls.push({ method: "deleteDraft", args });
      return { deleted: true };
    },
    listVersions: async (...args: unknown[]) => {
      calls.push({ method: "listVersions", args });
      return [{ id: "version-1" }];
    },
    restoreVersion: async (...args: unknown[]) => {
      calls.push({ method: "restoreVersion", args });
      return { id: "draft-1", version: 3 };
    },
  };

  return { controller: new DraftsController(draftsService as never), calls };
}

describe("DraftsController", () => {
  it("routes create and list requests to the current user's drafts", async () => {
    const { controller, calls } = createController();
    const body = { title: "AI 写作", body: { type: "doc", content: [] }, mode: "FAST" };

    assert.deepEqual(await controller.create("user-1", body as never), { id: "draft-1" });
    assert.deepEqual(await controller.listMine("user-1"), [{ id: "draft-1" }]);

    assert.deepEqual(calls, [
      { method: "createDraft", args: ["user-1", body] },
      { method: "listMine", args: ["user-1"] },
    ]);
  });

  it("routes read, update, delete, version, and restore requests with draft ids", async () => {
    const { controller, calls } = createController();
    const updateBody = { title: "AI 写作更新", version: 1 };
    const restoreBody = { versionId: "version-1" };

    assert.deepEqual(await controller.getDraft("user-1", "draft-1"), { id: "draft-1" });
    assert.deepEqual(await controller.update("user-1", "draft-1", updateBody as never), { id: "draft-1", version: 2 });
    assert.deepEqual(await controller.deleteDraft("user-1", "draft-1"), { deleted: true });
    assert.deepEqual(await controller.listVersions("user-1", "draft-1"), [{ id: "version-1" }]);
    assert.deepEqual(await controller.restoreVersion("user-1", "draft-1", restoreBody as never), {
      id: "draft-1",
      version: 3,
    });

    assert.deepEqual(calls, [
      { method: "getMineById", args: ["user-1", "draft-1"] },
      { method: "updateDraft", args: ["user-1", "draft-1", updateBody] },
      { method: "deleteDraft", args: ["user-1", "draft-1"] },
      { method: "listVersions", args: ["user-1", "draft-1"] },
      { method: "restoreVersion", args: ["user-1", "draft-1", restoreBody] },
    ]);
  });
});
