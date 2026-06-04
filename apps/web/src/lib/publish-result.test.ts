import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPublishedArticleHref, isPublishArticleResponse, normalizePublishDraftId } from "./publish-result.ts";

describe("publish result helpers", () => {
  it("returns the article detail href for a published result", () => {
    assert.equal(getPublishedArticleHref({ status: "PUBLISHED", articleId: "article-123" }), "/articles/article-123");
  });

  it("accepts successful publish payloads that include a message", () => {
    assert.equal(
      isPublishArticleResponse({
        status: "PUBLISHED",
        articleId: "article-123",
        message: "文章发布成功。",
      }),
      true,
    );
  });

  it("rejects generic API error payloads as publish results", () => {
    assert.equal(isPublishArticleResponse({ message: "Unauthorized" }), false);
  });

  it("returns null when the publish result still needs edits", () => {
    assert.equal(getPublishedArticleHref({ status: "NEEDS_REVISION" }), null);
    assert.equal(getPublishedArticleHref({ status: "BLOCKED" }), null);
  });

  it("rejects placeholder publish route ids", () => {
    assert.equal(normalizePublishDraftId(":id"), null);
    assert.equal(normalizePublishDraftId("[id]"), null);
    assert.equal(normalizePublishDraftId("undefined"), null);
    assert.equal(normalizePublishDraftId(" draft-123 "), "draft-123");
  });
});
