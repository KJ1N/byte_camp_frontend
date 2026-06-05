import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RankingService } from "./ranking.service";

const basePublishedAt = new Date("2026-06-05T00:00:00.000Z");

describe("RankingService", () => {
  it("calculates an explainable ranking breakdown", () => {
    const service = new RankingService();

    const breakdown = service.calculateBreakdown({
      qualityScore: 80,
      views: 100,
      likes: 10,
      favorites: 5,
      publishedAt: basePublishedAt,
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.deepEqual(breakdown, {
      qualityScore: 80,
      hotScore: 170,
      freshnessScore: 50,
      feedbackScore: 15,
      rankScore: 104,
    });
  });

  it("sorts the hot ranking by heat and freshness", () => {
    const service = new RankingService();

    const sorted = service.sortForHot([
      {
        id: "older-popular",
        qualityScore: 70,
        views: 260,
        likes: 20,
        favorites: 8,
        publishedAt: new Date("2026-06-04T00:00:00.000Z"),
      },
      {
        id: "fresh-low",
        qualityScore: 95,
        views: 20,
        likes: 2,
        favorites: 1,
        publishedAt: new Date("2026-06-05T11:00:00.000Z"),
      },
    ], new Date("2026-06-05T12:00:00.000Z"));

    assert.deepEqual(sorted.map((item) => item.id), ["older-popular", "fresh-low"]);
    assert.ok(sorted[0].ranking.rankScore > sorted[1].ranking.rankScore);
  });

  it("sorts the top ranking by the PRD composite score", () => {
    const service = new RankingService();

    const sorted = service.sortForTop([
      {
        id: "high-heat",
        qualityScore: 60,
        views: 200,
        likes: 12,
        favorites: 4,
        publishedAt: new Date("2026-06-05T10:00:00.000Z"),
      },
      {
        id: "high-quality",
        qualityScore: 95,
        views: 50,
        likes: 6,
        favorites: 3,
        publishedAt: new Date("2026-06-05T10:00:00.000Z"),
      },
    ], new Date("2026-06-05T12:00:00.000Z"));

    assert.deepEqual(sorted.map((item) => item.id), ["high-heat", "high-quality"]);
    assert.ok(sorted[0].ranking.rankScore > sorted[1].ranking.rankScore);
  });
});
