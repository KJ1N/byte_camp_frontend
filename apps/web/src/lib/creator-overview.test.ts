import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ArticleStatus } from "@bytecamp-aigc/shared";
import {
  formatCreatorMetric,
  getCreatorWorkStatusLabel,
  getEmptyCreatorStats,
  sortCreatorWorksByPublishedTime,
} from "./creator-overview.ts";

describe("creator overview helpers", () => {
  it("formats compact creator metrics", () => {
    assert.equal(formatCreatorMetric(0), "0");
    assert.equal(formatCreatorMetric(9999), "9999");
    assert.equal(formatCreatorMetric(12000), "1.2万");
    assert.equal(formatCreatorMetric(105000), "10.5万");
  });

  it("returns stable zero stats for empty creator data", () => {
    assert.deepEqual(getEmptyCreatorStats(), {
      followers: 0,
      publishedArticles: 0,
      draftCount: 0,
      totalViews: 0,
      totalLikes: 0,
      totalFavorites: 0,
      averageQualityScore: 0,
    });
  });

  it("maps creator work statuses to readable labels", () => {
    assert.equal(getCreatorWorkStatusLabel(ArticleStatus.Published), "已发布");
    assert.equal(getCreatorWorkStatusLabel(ArticleStatus.Withdrawn), "已撤回");
  });

  it("sorts works by publish time without mutating the original list", () => {
    const works = [
      { id: "old", publishedAt: "2026-06-05T10:00:00.000Z" },
      { id: "new", publishedAt: "2026-06-06T10:00:00.000Z" },
    ];

    const sorted = sortCreatorWorksByPublishedTime(works);

    assert.deepEqual(sorted.map((work) => work.id), ["new", "old"]);
    assert.deepEqual(works.map((work) => work.id), ["old", "new"]);
  });
});
