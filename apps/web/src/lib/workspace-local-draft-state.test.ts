import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GeneratedArticleDraft } from "@bytecamp-aigc/shared";

import {
  WORKSPACE_LOCAL_DRAFT_KEY,
  clearWorkspaceLocalDraftState,
  createWorkspaceLocalDraftState,
  readWorkspaceLocalDraftState,
  writeWorkspaceLocalDraftState,
} from "./workspace-local-draft-state.ts";

const generated: GeneratedArticleDraft = {
  model: "mock-model",
  title: "本地标题",
  outline: ["一", "二"],
  bodyText: "本地正文",
  body: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "本地正文" }] }],
  },
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

describe("workspace local draft state helpers", () => {
  it("writes and reads a workspace local draft", () => {
    const storage = createStorage();
    const state = createWorkspaceLocalDraftState({
      topic: "AI 创作",
      audience: "内容创作者",
      style: "科普",
      selectedPromptId: "prompt-1",
      draftTitle: "本地标题",
      generated,
      localUpdatedAt: "2026-06-09T03:00:00.000Z",
    });

    writeWorkspaceLocalDraftState(storage, state);

    assert.deepEqual(readWorkspaceLocalDraftState(storage), state);
  });

  it("clears a workspace local draft", () => {
    const storage = createStorage();

    writeWorkspaceLocalDraftState(
      storage,
      createWorkspaceLocalDraftState({
        topic: "AI 创作",
        audience: "内容创作者",
        style: "科普",
        selectedPromptId: "",
        draftTitle: "",
        generated: null,
        localUpdatedAt: "2026-06-09T03:00:00.000Z",
      }),
    );
    clearWorkspaceLocalDraftState(storage);

    assert.equal(storage.getItem(WORKSPACE_LOCAL_DRAFT_KEY), null);
  });

  it("ignores malformed JSON and invalid payloads", () => {
    const storage = createStorage();
    storage.setItem(WORKSPACE_LOCAL_DRAFT_KEY, "{broken");
    assert.equal(readWorkspaceLocalDraftState(storage), null);

    storage.setItem(WORKSPACE_LOCAL_DRAFT_KEY, JSON.stringify({ topic: "missing fields" }));
    assert.equal(readWorkspaceLocalDraftState(storage), null);
  });

  it("fails safely when storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw new Error("disabled");
      },
      setItem: () => {
        throw new Error("disabled");
      },
      removeItem: () => {
        throw new Error("disabled");
      },
    };

    assert.doesNotThrow(() =>
      writeWorkspaceLocalDraftState(
        storage,
        createWorkspaceLocalDraftState({
          topic: "AI 创作",
          audience: "内容创作者",
          style: "科普",
          selectedPromptId: "",
          draftTitle: "",
          generated: null,
          localUpdatedAt: "2026-06-09T03:00:00.000Z",
        }),
      ),
    );
    assert.equal(readWorkspaceLocalDraftState(storage), null);
    assert.doesNotThrow(() => clearWorkspaceLocalDraftState(storage));
  });
});
