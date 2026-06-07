import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EngagementEventType } from "@bytecamp-aigc/shared";
import type { RankingCacheService } from "../ranking/ranking-cache.service";
import { AnalyticsService } from "./analytics.service";

function createService(options?: { articleExists?: boolean; initialEvents?: Array<{ type: string; value: number }> }) {
  const calls = {
    createdEvents: [] as Array<{ articleId: string; type: string; userKey?: string | null; value: number }>,
    rankingInvalidations: 0,
  };
  const events = [...(options?.initialEvents ?? [])];

  const prisma = {
    article: {
      findFirst: async () => (options?.articleExists === false ? null : { id: "article-1" }),
    },
    engagementEvent: {
      create: async ({ data }: { data: { articleId: string; type: string; userKey?: string | null; value: number } }) => {
        calls.createdEvents.push(data);
        events.push({ type: data.type, value: data.value });
        return { id: `event-${events.length}`, createdAt: new Date("2026-06-05T12:00:00.000Z"), ...data };
      },
      findMany: async () => events,
    },
  };
  const rankingCache = {
    invalidateRankings: async () => {
      calls.rankingInvalidations += 1;
      return true;
    },
  };

  return {
    service: new AnalyticsService(prisma as never, rankingCache as unknown as RankingCacheService),
    calls,
  };
}

describe("AnalyticsService", () => {
  it("records an engagement event for a published article and returns updated stats", async () => {
    const { service, calls } = createService({
      initialEvents: [
        { type: EngagementEventType.View, value: 3 },
        { type: EngagementEventType.Like, value: 1 },
      ],
    });

    const result = await service.recordEvent("article-1", {
      type: EngagementEventType.Favorite,
      userKey: "browser-1",
    });

    assert.equal(result.articleId, "article-1");
    assert.equal(result.type, EngagementEventType.Favorite);
    assert.deepEqual(result.stats, {
      views: 3,
      likes: 1,
      favorites: 1,
    });
    assert.deepEqual(calls.createdEvents, [
      {
        articleId: "article-1",
        type: EngagementEventType.Favorite,
        userKey: "browser-1",
        value: 1,
      },
    ]);
    assert.equal(calls.rankingInvalidations, 1);
  });

  it("rejects engagement events for missing or unpublished articles", async () => {
    const { service } = createService({ articleExists: false });

    await assert.rejects(
      () => service.recordEvent("missing-article", { type: EngagementEventType.View }),
      NotFoundException,
    );
  });

  it("rejects unsupported engagement event types", async () => {
    const { service } = createService();

    await assert.rejects(
      () => service.recordEvent("article-1", { type: "SHARE" as EngagementEventType }),
      BadRequestException,
    );
  });
});
