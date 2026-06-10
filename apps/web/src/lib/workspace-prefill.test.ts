import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DailyNewsItem } from "@bytecamp-aigc/shared";
import {
  clearWorkspacePrefillState,
  createWorkspacePrefillFromDailyNews,
  readWorkspacePrefillState,
  WORKSPACE_PREFILL_KEY,
  writeWorkspacePrefillState,
} from "./workspace-prefill.ts";

function createStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const item: DailyNewsItem = {
  id: "ai-2026-06-10-1",
  kind: "AI",
  title: "  AI 搜索进入内容创作工作流  ",
  summary: "AI 搜索工具开始服务选题、检索和写作。",
  content: "AI 搜索进入内容创作工作流\n\n工具开始服务选题、检索和写作。",
  source: "AI 工具集",
  date: "2026-06-10",
  url: "https://example.com/news",
};

describe("workspace prefill helpers", () => {
  it("creates a workspace draft prefill from a daily news item", () => {
    const state = createWorkspacePrefillFromDailyNews(item, "2026-06-10T10:00:00.000Z");

    assert.equal(state.source, "creator-news");
    assert.equal(state.topic, "AI 搜索进入内容创作工作流");
    assert.equal(state.draftTitle, "AI 搜索进入内容创作工作流");
    assert.equal(state.style, "新闻");
    assert.equal(state.audience, "内容创作者");
    assert.equal(state.generated.title, "AI 搜索进入内容创作工作流");
    assert.match(state.generated.bodyText, /AI 工具集/);
    assert.match(state.generated.bodyText, /https:\/\/example.com\/news/);
    assert.equal(state.generated.body.type, "doc");
  });

  it("writes, reads and clears a one-time prefill state", () => {
    const storage = createStorage();
    const state = createWorkspacePrefillFromDailyNews(item, "2026-06-10T10:00:00.000Z");

    assert.equal(writeWorkspacePrefillState(storage, state), true);
    assert.ok(storage.getItem(WORKSPACE_PREFILL_KEY));

    const restored = readWorkspacePrefillState(storage);
    assert.deepEqual(restored, state);

    clearWorkspacePrefillState(storage);
    assert.equal(readWorkspacePrefillState(storage), null);
  });

  it("ignores invalid stored prefill payloads", () => {
    const storage = createStorage();
    storage.setItem(WORKSPACE_PREFILL_KEY, JSON.stringify({ source: "other" }));

    assert.equal(readWorkspacePrefillState(storage), null);
  });
});
