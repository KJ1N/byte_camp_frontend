import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RankingCacheService, type RankingCacheEntry, type RankingCacheRedisClient } from "./ranking-cache.service";

function createRedis(options: { fail?: boolean } = {}) {
  const calls = {
    zadd: [] as Array<{ key: string; args: Array<string | number> }>,
    zrevrange: [] as Array<{ key: string; start: number; stop: number }>,
    del: [] as string[][],
    zrem: [] as Array<{ key: string; member: string }>,
    set: [] as Array<{ key: string; value: string }>,
    quit: 0,
  };
  const sets = new Map<string, RankingCacheEntry[]>();

  const redis: RankingCacheRedisClient = {
    zadd: async (key, ...args) => {
      if (options.fail) throw new Error("redis down");
      calls.zadd.push({ key, args });
      const entries: RankingCacheEntry[] = [];
      for (let index = 0; index < args.length; index += 2) {
        entries.push({ articleId: String(args[index + 1]), score: Number(args[index]) });
      }
      sets.set(key, entries);
      return entries.length;
    },
    zrevrange: async (key, start, stop) => {
      if (options.fail) throw new Error("redis down");
      calls.zrevrange.push({ key, start, stop });
      const ranked = [...(sets.get(key) ?? [])].sort((left, right) => right.score - left.score);
      return ranked.slice(start, stop + 1).map((entry) => entry.articleId);
    },
    del: async (...keys) => {
      if (options.fail) throw new Error("redis down");
      calls.del.push(keys);
      keys.forEach((key) => sets.delete(key));
      return keys.length;
    },
    zrem: async (key, member) => {
      if (options.fail) throw new Error("redis down");
      calls.zrem.push({ key, member });
      sets.set(
        key,
        (sets.get(key) ?? []).filter((entry) => entry.articleId !== member),
      );
      return 1;
    },
    set: async (key, value) => {
      if (options.fail) throw new Error("redis down");
      calls.set.push({ key, value });
      return "OK";
    },
    quit: async () => {
      calls.quit += 1;
      return "OK";
    },
  };

  return { redis, calls };
}

describe("RankingCacheService", () => {
  it("stays disabled when no redis url or client is configured", async () => {
    const service = new RankingCacheService({ get: () => undefined } as never);

    assert.equal(service.isAvailable(), false);
    assert.deepEqual(await service.getRankedArticleIds("hot", 0, 10), null);
    assert.equal(await service.replaceRanking("top", [{ articleId: "article-1", score: 88 }]), false);
  });

  it("writes and reads sorted article ids for a ranking kind", async () => {
    const { redis, calls } = createRedis();
    const service = new RankingCacheService({ get: () => undefined } as never, redis);

    const wrote = await service.replaceRanking("hot", [
      { articleId: "article-low", score: 10 },
      { articleId: "article-high", score: 50 },
    ]);
    const ids = await service.getRankedArticleIds("hot", 0, 2);

    assert.equal(wrote, true);
    assert.deepEqual(ids, ["article-high", "article-low"]);
    assert.equal(calls.zadd[0].key, "rank:hot");
    assert.equal(calls.set[0].key, "rank:hot:updated_at");
  });

  it("invalidates both ranking keys", async () => {
    const { redis, calls } = createRedis();
    const service = new RankingCacheService({ get: () => undefined } as never, redis);

    assert.equal(await service.invalidateRankings(), true);
    assert.deepEqual(calls.del[0], ["rank:hot", "rank:top", "rank:hot:updated_at", "rank:top:updated_at"]);
  });

  it("removes an article from both rankings", async () => {
    const { redis, calls } = createRedis();
    const service = new RankingCacheService({ get: () => undefined } as never, redis);

    assert.equal(await service.removeArticle("article-1"), true);
    assert.deepEqual(calls.zrem, [
      { key: "rank:hot", member: "article-1" },
      { key: "rank:top", member: "article-1" },
    ]);
  });

  it("returns safe fallback values when redis commands fail", async () => {
    const { redis } = createRedis({ fail: true });
    const service = new RankingCacheService({ get: () => undefined } as never, redis);

    assert.equal(service.isAvailable(), true);
    assert.deepEqual(await service.getRankedArticleIds("hot", 0, 10), null);
    assert.equal(await service.replaceRanking("hot", [{ articleId: "article-1", score: 10 }]), false);
    assert.equal(await service.invalidateRankings(), false);
    assert.equal(await service.removeArticle("article-1"), false);
  });
});
