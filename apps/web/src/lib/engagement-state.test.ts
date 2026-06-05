import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EngagementEventType } from "@bytecamp-aigc/shared";
import {
  buildEngagementKey,
  consumeArticleViewIntent,
  hasRecordedEngagement,
  markEngagementRecorded,
  markArticleViewIntent,
  shouldRecordArticleView,
} from "./engagement-state.ts";

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

describe("engagement state helpers", () => {
  it("builds stable local keys per article and event type", () => {
    assert.equal(buildEngagementKey("article-1", EngagementEventType.Like), "aigc_creator_engagement_article-1_LIKE");
  });

  it("marks and reads recorded engagement state", () => {
    const storage = createStorage();

    assert.equal(hasRecordedEngagement(storage, "article-1", EngagementEventType.Favorite), false);
    markEngagementRecorded(storage, "article-1", EngagementEventType.Favorite);
    assert.equal(hasRecordedEngagement(storage, "article-1", EngagementEventType.Favorite), true);
  });

  it("fails safely when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
    };

    assert.equal(hasRecordedEngagement(storage, "article-1", EngagementEventType.Like), false);
    assert.doesNotThrow(() => markEngagementRecorded(storage, "article-1", EngagementEventType.Like));
  });

  it("allows one view event per article mount guard", () => {
    assert.equal(shouldRecordArticleView(null, "article-1"), true);
    assert.equal(shouldRecordArticleView("article-1", "article-1"), false);
    assert.equal(shouldRecordArticleView("article-1", "article-2"), true);
  });

  it("consumes article view intent once so refresh does not count", () => {
    const storage = createStorage();

    assert.equal(consumeArticleViewIntent(storage, "article-1"), false);
    markArticleViewIntent(storage, "article-1");
    assert.equal(consumeArticleViewIntent(storage, "article-1"), true);
    assert.equal(consumeArticleViewIntent(storage, "article-1"), false);
  });

  it("does not consume a view intent for another article", () => {
    const storage = createStorage();

    markArticleViewIntent(storage, "article-1");

    assert.equal(consumeArticleViewIntent(storage, "article-2"), false);
    assert.equal(consumeArticleViewIntent(storage, "article-1"), true);
  });
});
