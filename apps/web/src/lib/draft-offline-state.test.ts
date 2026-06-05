import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RichTextDocument } from "@bytecamp-aigc/shared";
import { buildDraftOfflineKey, clearDraftOfflineState, readDraftOfflineState, writeDraftOfflineState } from "./draft-offline-state.ts";

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

    writeDraftOfflineState(storage, "draft-1", { title: "本地标题", body });

    assert.deepEqual(readDraftOfflineState(storage, "draft-1"), {
      title: "本地标题",
      body,
    });
  });

  it("clears a draft snapshot", () => {
    const storage = createStorage();

    writeDraftOfflineState(storage, "draft-1", { title: "本地标题", body });
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

    assert.doesNotThrow(() => writeDraftOfflineState(storage, "draft-1", { title: "本地标题", body }));
    assert.equal(readDraftOfflineState(storage, "draft-1"), null);
    assert.doesNotThrow(() => clearDraftOfflineState(storage, "draft-1"));
  });

  it("ignores malformed stored JSON", () => {
    const storage = createStorage();
    storage.setItem(buildDraftOfflineKey("draft-1"), "{broken");

    assert.equal(readDraftOfflineState(storage, "draft-1"), null);
  });
});
