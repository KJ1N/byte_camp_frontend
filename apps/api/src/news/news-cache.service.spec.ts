import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NewsCacheService,
  type DailyNewsSnapshot,
  type NewsCacheRedisClient,
} from "./news-cache.service";

const snapshot: DailyNewsSnapshot = {
  requestedDate: "2026-06-10",
  contentDate: "2026-06-10",
  items: [
    {
      id: "ai-2026-06-10-1",
      kind: "AI",
      title: "字节发布 AI 编程模型",
      summary: "模型支持长上下文。",
      content: "字节发布 AI 编程模型\n\n模型支持长上下文。",
      source: "火山引擎",
      date: "2026-06-10",
      url: "https://example.com/ai",
    },
  ],
  updatedAt: "2026-06-10T08:00:00.000Z",
};

function createRedis(options: { fail?: boolean } = {}) {
  const values = new Map<string, string>();
  const calls = {
    get: [] as string[],
    set: [] as Array<{ key: string; value: string; args: Array<string | number> }>,
    quit: 0,
  };

  const redis: NewsCacheRedisClient = {
    get: async (key) => {
      if (options.fail) throw new Error("redis down");
      calls.get.push(key);
      return values.get(key) ?? null;
    },
    set: async (key, value, ...args) => {
      if (options.fail) throw new Error("redis down");
      calls.set.push({ key, value, args });
      values.set(key, value);
      return "OK";
    },
    quit: async () => {
      calls.quit += 1;
      return "OK";
    },
  };

  return { calls, redis, values };
}

describe("NewsCacheService", () => {
  it("stays disabled when no redis url or client is configured", async () => {
    const service = new NewsCacheService({ get: () => undefined } as never);

    assert.equal(service.isAvailable(), false);
    assert.equal(await service.getDailySnapshot("ai", "2026-06-10"), null);
    assert.equal(await service.setDailySnapshot("ai", snapshot), false);
    assert.equal(await service.getLatestSnapshot("hot"), null);
    assert.equal(await service.setLatestSnapshot("hot", snapshot), false);
  });

  it("writes and reads daily snapshots with ttl", async () => {
    const { calls, redis } = createRedis();
    const service = new NewsCacheService(
      { get: (key: string) => (key === "NEWS_DAILY_SNAPSHOT_TTL_SECONDS" ? "120" : undefined) } as never,
      redis,
    );

    const wrote = await service.setDailySnapshot("ai", snapshot);
    const cached = await service.getDailySnapshot("ai", "2026-06-10");

    assert.equal(wrote, true);
    assert.equal(cached?.contentDate, "2026-06-10");
    assert.equal(cached?.items[0].title, "字节发布 AI 编程模型");
    assert.deepEqual(calls.set[0].args, ["EX", 120]);
    assert.equal(calls.set[0].key, "news:creator-daily:ai:2026-06-10");
    assert.equal(calls.get[0], "news:creator-daily:ai:2026-06-10");
  });

  it("writes and reads latest snapshots without ttl", async () => {
    const { calls, redis } = createRedis();
    const service = new NewsCacheService({ get: () => undefined } as never, redis);

    const wrote = await service.setLatestSnapshot("hot", { ...snapshot, items: [{ ...snapshot.items[0], kind: "HOT" }] });
    const cached = await service.getLatestSnapshot("hot");

    assert.equal(wrote, true);
    assert.equal(cached?.items[0].kind, "HOT");
    assert.deepEqual(calls.set[0].args, []);
    assert.equal(calls.set[0].key, "news:creator-daily:hot:latest");
    assert.equal(calls.get[0], "news:creator-daily:hot:latest");
  });

  it("returns null for broken or invalid snapshot payloads", async () => {
    const { redis, values } = createRedis();
    const service = new NewsCacheService({ get: () => undefined } as never, redis);

    values.set("news:creator-daily:ai:2026-06-10", "{bad json");
    assert.equal(await service.getDailySnapshot("ai", "2026-06-10"), null);

    values.set(
      "news:creator-daily:hot:2026-06-10",
      JSON.stringify({ requestedDate: "2026-06-10", contentDate: "2026-06-10", items: [{}], updatedAt: "x" }),
    );
    assert.equal(await service.getDailySnapshot("hot", "2026-06-10"), null);
  });

  it("returns safe fallback values when redis commands fail", async () => {
    const { redis } = createRedis({ fail: true });
    const service = new NewsCacheService({ get: () => undefined } as never, redis);

    assert.equal(service.isAvailable(), true);
    assert.equal(await service.getDailySnapshot("ai", "2026-06-10"), null);
    assert.equal(await service.setDailySnapshot("ai", snapshot), false);
    assert.equal(await service.getLatestSnapshot("ai"), null);
    assert.equal(await service.setLatestSnapshot("ai", snapshot), false);
  });
});
