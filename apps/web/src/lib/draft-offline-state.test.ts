import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RichTextDocument } from "@bytecamp-aigc/shared";
import {
  buildDraftOfflineKey,
  clearDraftOfflineState,
  createDraftOfflineState,
  getDraftOfflineStatusText,
  isDraftOfflineConflict,
  readDraftOfflineState,
  writeDraftOfflineState,
} from "./draft-offline-state.ts";

const body: RichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "本地暂存正文。" }] }],
};

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("draft offline state helpers", () => {
  it("builds stable local keys per draft", () => {
    assert.equal(buildDraftOfflineKey("draft-1"), "aigc_draft_offline_draft-1");
  });

  it("writes and reads a draft snapshot", () => {
    const storage = createStorage();

    writeDraftOfflineState(
      storage,
      "draft-1",
      createDraftOfflineState({
        draftId: "draft-1",
        title: "本地标题",
        body,
        baseVersion: 3,
        serverUpdatedAt: "2026-06-07T10:00:00.000Z",
        localUpdatedAt: "2026-06-07T10:01:00.000Z",
        reason: "offline",
      }),
    );

    assert.deepEqual(readDraftOfflineState(storage, "draft-1"), {
      draftId: "draft-1",
      title: "本地标题",
      body,
      baseVersion: 3,
      serverUpdatedAt: "2026-06-07T10:00:00.000Z",
      localUpdatedAt: "2026-06-07T10:01:00.000Z",
      reason: "offline",
    });
  });

  it("clears a draft snapshot", () => {
    const storage = createStorage();

    writeDraftOfflineState(
      storage,
      "draft-1",
      createDraftOfflineState({
        draftId: "draft-1",
        title: "本地标题",
        body,
        baseVersion: 1,
        serverUpdatedAt: "2026-06-07T10:00:00.000Z",
        localUpdatedAt: "2026-06-07T10:01:00.000Z",
        reason: "save_failed",
      }),
    );
    clearDraftOfflineState(storage, "draft-1");

    assert.equal(readDraftOfflineState(storage, "draft-1"), null);
  });

  it("fails safely when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
      removeItem: () => {
        throw new Error("storage disabled");
      },
    };

    assert.doesNotThrow(() =>
      writeDraftOfflineState(
        storage,
        "draft-1",
        createDraftOfflineState({
          draftId: "draft-1",
          title: "本地标题",
          body,
          baseVersion: 1,
          serverUpdatedAt: "2026-06-07T10:00:00.000Z",
          localUpdatedAt: "2026-06-07T10:01:00.000Z",
          reason: "sync_failed",
        }),
      ),
    );
    assert.equal(readDraftOfflineState(storage, "draft-1"), null);
    assert.doesNotThrow(() => clearDraftOfflineState(storage, "draft-1"));
  });

  it("ignores malformed stored JSON", () => {
    const storage = createStorage();
    storage.setItem(buildDraftOfflineKey("draft-1"), "{broken");

    assert.equal(readDraftOfflineState(storage, "draft-1"), null);
  });

  it("normalizes legacy snapshots without version metadata", () => {
    const storage = createStorage();
    storage.setItem(buildDraftOfflineKey("draft-1"), JSON.stringify({ title: "旧标题", body }));

    assert.deepEqual(readDraftOfflineState(storage, "draft-1"), {
      draftId: "draft-1",
      title: "旧标题",
      body,
      baseVersion: null,
      serverUpdatedAt: null,
      localUpdatedAt: "",
      reason: "save_failed",
    });
  });

  it("detects conflict when local snapshot is based on an older server version", () => {
    const state = createDraftOfflineState({
      draftId: "draft-1",
      title: "本地标题",
      body,
      baseVersion: 2,
      serverUpdatedAt: "2026-06-07T10:00:00.000Z",
      localUpdatedAt: "2026-06-07T10:02:00.000Z",
      reason: "offline",
    });

    assert.equal(isDraftOfflineConflict(state, { version: 3, updatedAt: "2026-06-07T10:03:00.000Z" }), true);
    assert.equal(isDraftOfflineConflict(state, { version: 2, updatedAt: "2026-06-07T10:00:00.000Z" }), false);
  });

  it("treats legacy snapshots as requiring confirmation before sync", () => {
    const storage = createStorage();
    storage.setItem(buildDraftOfflineKey("draft-1"), JSON.stringify({ title: "旧标题", body }));
    const state = readDraftOfflineState(storage, "draft-1");

    assert.ok(state);
    assert.equal(isDraftOfflineConflict(state, { version: 1, updatedAt: "2026-06-07T10:00:00.000Z" }), true);
  });

  it("summarizes why a local snapshot is pending", () => {
    const state = createDraftOfflineState({
      draftId: "draft-1",
      title: "本地标题",
      body,
      baseVersion: 1,
      serverUpdatedAt: "2026-06-07T10:00:00.000Z",
      localUpdatedAt: "2026-06-07T10:02:00.000Z",
      reason: "offline",
    });

    assert.equal(getDraftOfflineStatusText(state), "离线编辑内容已暂存到本地，恢复网络后会尝试同步。");
  });

  it("supports local edit snapshots for immediate browser refresh recovery", () => {
    const storage = createStorage();
    const state = createDraftOfflineState({
      draftId: "draft-1",
      title: "刚输入的标题",
      body,
      baseVersion: 1,
      serverUpdatedAt: "2026-06-07T10:00:00.000Z",
      localUpdatedAt: "2026-06-07T10:02:00.000Z",
      reason: "local_edit",
    });

    writeDraftOfflineState(storage, "draft-1", state);

    assert.deepEqual(readDraftOfflineState(storage, "draft-1"), state);
    assert.equal(
      getDraftOfflineStatusText(state),
      "编辑内容已实时保存到本地，停止输入后会自动同步到服务器。",
    );
  });
});
