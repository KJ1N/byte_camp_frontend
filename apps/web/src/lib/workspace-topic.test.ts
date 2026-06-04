import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorkspaceTopicHref, normalizeWorkspaceTopic } from "./workspace-topic.ts";

describe("workspace topic helpers", () => {
  it("trims and limits topic text for workspace prefill", () => {
    const longTopic = `  ${"AI".repeat(60)}  `;

    assert.equal(normalizeWorkspaceTopic("  AI 写作流程  "), "AI 写作流程");
    assert.equal(normalizeWorkspaceTopic("   "), null);
    assert.equal(normalizeWorkspaceTopic(longTopic)?.length, 80);
  });

  it("builds an encoded workspace href from an inspiration topic", () => {
    assert.equal(
      buildWorkspaceTopicHref("普通人如何用 AI 建立稳定的写作流程"),
      "/workspace?topic=%E6%99%AE%E9%80%9A%E4%BA%BA%E5%A6%82%E4%BD%95%E7%94%A8+AI+%E5%BB%BA%E7%AB%8B%E7%A8%B3%E5%AE%9A%E7%9A%84%E5%86%99%E4%BD%9C%E6%B5%81%E7%A8%8B",
    );
    assert.equal(buildWorkspaceTopicHref("   "), "/workspace");
  });
});
