import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ArticleStatus, EngagementEventType } from "@bytecamp-aigc/shared";
import type { RankingCacheEntry, RankingKind } from "../ranking/ranking-cache.service";
import { RankingService } from "../ranking/ranking.service";
import { FeedService } from "./feed.service";

const articles = [
  {
    id: "article-quality",
    title: "高质量深度文章",
    summary: "质量分高但互动较少。",
    status: ArticleStatus.Published,
    publishedAt: new Date("2026-06-05T10:00:00.000Z"),
    author: { id: "user-1", nickname: "训练营创作者" },
    scores: [{ overall: 95 }],
    events: [
      { type: EngagementEventType.View, value: 20 },
      { type: EngagementEventType.Like, value: 3 },
      { type: EngagementEventType.Favorite, value: 1 },
    ],
  },
  {
    id: "article-hot",
    title: "高热度热点文章",
    summary: "阅读和互动更多。",
    status: ArticleStatus.Published,
    publishedAt: new Date("2026-06-05T09:00:00.000Z"),
    author: { id: "user-1", nickname: "训练营创作者" },
    scores: [{ overall: 80 }],
    events: [
      { type: EngagementEventType.View, value: 180 },
      { type: EngagementEventType.Like, value: 18 },
      { type: EngagementEventType.Favorite, value: 6 },
    ],
  },
  {
    id: "article-low",
    title: "较低热度文章",
    summary: "用于测试分页。",
    status: ArticleStatus.Published,
    publishedAt: new Date("2026-06-05T08:00:00.000Z"),
    author: { id: "user-2", nickname: "内容运营" },
    scores: [],
    events: [{ type: EngagementEventType.View, value: 5 }],
  },
];

function createRankingCache(options: { ids?: string[] | null; failGet?: boolean } = {}) {
  const calls = {
    getRankedArticleIds: [] as Array<{ kind: RankingKind; offset: number; limit: number }>,
    replaceRanking: [] as Array<{ kind: RankingKind; entries: RankingCacheEntry[] }>,
  };

  return {
    cache: {
      getRankedArticleIds: async (kind: RankingKind, offset: number, limit: number) => {
        calls.getRankedArticleIds.push({ kind, offset, limit });
        if (options.failGet) throw new Error("redis down");
        return options.ids ?? null;
      },
      replaceRanking: async (kind: RankingKind, entries: RankingCacheEntry[]) => {
        calls.replaceRanking.push({ kind, entries });
        return true;
      },
    },
    calls,
  };
}

function createService(cache?: ReturnType<typeof createRankingCache>["cache"]) {
  const calls = {
    articleQueries: [] as Array<{ where?: unknown }>,
    snapshots: [] as Array<{ name: string; payload: unknown }>,
  };

  const prisma = {
    article: {
      findMany: async (query: { where?: { id?: { in?: string[] } } }) => {
        calls.articleQueries.push(query);
        if (query.where?.id?.in) {
          return articles.filter((article) => query.where?.id?.in?.includes(article.id));
        }
        return articles;
      },
    },
    rankingSnapshot: {
      create: async ({ data }: { data: { name: string; payload: unknown } }) => {
        calls.snapshots.push(data);
        return { id: `snapshot-${calls.snapshots.length}`, createdAt: new Date(), ...data };
      },
    },
  };

  return {
    service: new FeedService(prisma as never, new RankingService(), cache as never),
    calls,
  };
}

describe("FeedService", () => {
  it("returns a paginated feed of published articles sorted by composite rank", async () => {
    const { service, calls } = createService();

    const result = await service.listFeed({
      limit: 2,
      cursor: "0",
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.deepEqual(result.items.map((item) => item.id), ["article-hot", "article-quality"]);
    assert.equal(result.nextCursor, "2");
    assert.equal(result.items[0].qualityScore, 80);
    assert.deepEqual(result.items[0].engagement, {
      views: 180,
      likes: 18,
      favorites: 6,
    });
    assert.deepEqual(calls.articleQueries[0].where, { status: ArticleStatus.Published });
  });

  it("returns hot ranking ordered by heat and records a snapshot", async () => {
    const { service, calls } = createService();

    const result = await service.listRanking("hot", {
      limit: 3,
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.deepEqual(result.items.map((item) => item.id), ["article-hot", "article-quality", "article-low"]);
    assert.equal(calls.snapshots.length, 1);
    assert.equal(calls.snapshots[0].name, "hot");
  });

  it("returns top ranking ordered by the PRD composite score", async () => {
    const { service } = createService();

    const result = await service.listRanking("top", {
      limit: 3,
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.deepEqual(result.items.map((item) => item.id), ["article-hot", "article-quality", "article-low"]);
    assert.ok(result.items[0].ranking.rankScore > result.items[1].ranking.rankScore);
  });

  it("uses cached article ids for ranking order and still loads published article details from PostgreSQL", async () => {
    const { cache, calls: cacheCalls } = createRankingCache({ ids: ["article-quality", "article-hot"] });
    const { service, calls } = createService(cache);

    const result = await service.listRanking("hot", {
      limit: 2,
      cursor: "0",
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.deepEqual(result.items.map((item) => item.id), ["article-quality", "article-hot"]);
    assert.deepEqual(cacheCalls.getRankedArticleIds, [{ kind: "hot", offset: 0, limit: 2 }]);
    assert.deepEqual(cacheCalls.replaceRanking, []);
    assert.deepEqual(calls.articleQueries[0].where, {
      status: ArticleStatus.Published,
      id: { in: ["article-quality", "article-hot"] },
    });
  });

  it("writes fallback ranking results into Redis when the cache is empty", async () => {
    const { cache, calls: cacheCalls } = createRankingCache({ ids: null });
    const { service } = createService(cache);

    await service.listRanking("top", {
      limit: 3,
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.equal(cacheCalls.replaceRanking.length, 1);
    assert.equal(cacheCalls.replaceRanking[0].kind, "top");
    assert.deepEqual(cacheCalls.replaceRanking[0].entries.map((entry) => entry.articleId), [
      "article-hot",
      "article-quality",
      "article-low",
    ]);
    assert.ok(cacheCalls.replaceRanking[0].entries[0].score > cacheCalls.replaceRanking[0].entries[1].score);
  });

  it("falls back to PostgreSQL ranking when Redis read fails", async () => {
    const { cache, calls: cacheCalls } = createRankingCache({ failGet: true });
    const { service } = createService(cache);

    const result = await service.listRanking("hot", {
      limit: 3,
      now: new Date("2026-06-05T12:00:00.000Z"),
    });

    assert.deepEqual(result.items.map((item) => item.id), ["article-hot", "article-quality", "article-low"]);
    assert.equal(cacheCalls.replaceRanking.length, 1);
  });
});
