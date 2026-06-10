import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import type { DailyNewsItem } from "@bytecamp-aigc/shared";
import type { DailyNewsSnapshot, DailyNewsSnapshotKind } from "./news-cache.service";
import { NewsService } from "./news.service";

class TestNewsCacheService {
  readonly calls = {
    getDailySnapshot: [] as Array<{ kind: DailyNewsSnapshotKind; date: string }>,
    setDailySnapshot: [] as Array<{ kind: DailyNewsSnapshotKind; snapshot: DailyNewsSnapshot }>,
    getLatestSnapshot: [] as DailyNewsSnapshotKind[],
    setLatestSnapshot: [] as Array<{ kind: DailyNewsSnapshotKind; snapshot: DailyNewsSnapshot }>,
  };

  readonly dailySnapshots = new Map<string, DailyNewsSnapshot>();
  readonly latestSnapshots = new Map<DailyNewsSnapshotKind, DailyNewsSnapshot>();

  constructor(private readonly options: { fail?: boolean } = {}) {}

  async getDailySnapshot(kind: DailyNewsSnapshotKind, date: string) {
    this.calls.getDailySnapshot.push({ kind, date });
    if (this.options.fail) return null;
    return this.cloneSnapshot(this.dailySnapshots.get(this.getDailyKey(kind, date)));
  }

  async setDailySnapshot(kind: DailyNewsSnapshotKind, snapshot: DailyNewsSnapshot) {
    this.calls.setDailySnapshot.push({ kind, snapshot: this.cloneSnapshot(snapshot)! });
    if (this.options.fail) return false;
    this.dailySnapshots.set(this.getDailyKey(kind, snapshot.requestedDate), this.cloneSnapshot(snapshot)!);
    return true;
  }

  async getLatestSnapshot(kind: DailyNewsSnapshotKind) {
    this.calls.getLatestSnapshot.push(kind);
    if (this.options.fail) return null;
    return this.cloneSnapshot(this.latestSnapshots.get(kind));
  }

  async setLatestSnapshot(kind: DailyNewsSnapshotKind, snapshot: DailyNewsSnapshot) {
    this.calls.setLatestSnapshot.push({ kind, snapshot: this.cloneSnapshot(snapshot)! });
    if (this.options.fail) return false;
    this.latestSnapshots.set(kind, this.cloneSnapshot(snapshot)!);
    return true;
  }

  private getDailyKey(kind: DailyNewsSnapshotKind, date: string) {
    return `${kind}:${date}`;
  }

  private cloneSnapshot(snapshot?: DailyNewsSnapshot): DailyNewsSnapshot | null {
    if (!snapshot) return null;
    return {
      ...snapshot,
      items: snapshot.items.map((item) => ({ ...item })),
    };
  }
}

class TestNewsService extends NewsService {
  readonly requestedUrls: string[] = [];
  failRequests = false;

  constructor(
    config: Record<string, string | undefined>,
    private readonly payloads: unknown[] = [],
    readonly cache = new TestNewsCacheService(),
  ) {
    super(
      {
        get: (key: string) => config[key],
      } as never,
      cache as never,
    );
  }

  queuePayloads(...payloads: unknown[]) {
    this.payloads.push(...payloads);
  }

  protected override async fetchProviderJson(url: URL): Promise<unknown> {
    this.requestedUrls.push(url.toString());
    if (this.failRequests) throw new Error("provider unavailable");
    const payload = this.payloads.shift();
    if (payload instanceof Error) throw payload;
    if (!payload) throw new Error("missing test payload");
    return payload;
  }
}

const aiPayload = {
  code: 200,
  data: {
    date: "2026-06-10",
    news: [
      {
        title: "字节发布 AI 编程模型",
        detail: "模型支持长上下文，适合复杂编程任务。",
        link: "https://example.com/ai",
        source: "火山引擎",
        date: "2026-06-10",
      },
    ],
  },
};

const hotPayload = {
  code: 200,
  data: {
    date: "2026-06-10",
    news: ["1、数字化服务继续进入民生场景", "2、暑期消费与文旅活动升温"],
    link: "https://example.com/60s",
  },
};

const emptyAiPayload = {
  code: 200,
  data: {
    date: "2026-06-10",
    news: [],
  },
};

const emptyHotPayload = {
  code: 200,
  data: {
    date: "2026-06-10",
    news: [],
    link: "https://example.com/60s",
  },
};

const previousAiItem: DailyNewsItem = {
  id: "ai-2026-06-09-1",
  kind: "AI",
  title: "上一日 AI 资讯仍可用于选题",
  summary: "当今日 AI 资讯为空时，系统返回最近有消息的一天。",
  content: "上一日 AI 资讯仍可用于选题\n\n当今日 AI 资讯为空时，系统返回最近有消息的一天。",
  source: "火山引擎",
  date: "2026-06-09",
  url: "https://example.com/ai-previous",
};

const previousHotItem: DailyNewsItem = {
  id: "hot-2026-06-09-1",
  kind: "HOT",
  title: "上一日热点资讯仍可用于选题",
  summary: "当今日热点资讯为空时，系统返回最近有消息的一天。",
  content: "上一日热点资讯仍可用于选题\n\n当今日热点资讯为空时，系统返回最近有消息的一天。",
  source: "每天 60 秒读懂世界",
  date: "2026-06-09",
  url: "https://example.com/60s-previous",
};

function createSnapshot(
  kind: DailyNewsSnapshotKind,
  requestedDate: string,
  contentDate: string,
  items: DailyNewsItem[],
  emptyDate?: string,
): DailyNewsSnapshot {
  return {
    requestedDate,
    contentDate,
    ...(emptyDate ? { emptyDate } : {}),
    items: items.map((item) => ({ ...item, kind: kind === "ai" ? "AI" : "HOT" })),
    updatedAt: "2026-06-10T08:00:00.000Z",
  };
}

describe("NewsService", () => {
  it("normalizes daily AI and hot news from the provider", async () => {
    const service = new TestNewsService({}, [aiPayload, hotPayload]);

    const response = await service.getCreatorDailyNews({ date: "2026-06-10" });

    assert.equal(response.source, "60s.viki.moe");
    assert.equal(response.date, "2026-06-10");
    assert.equal(response.aiNews.length, 1);
    assert.equal(response.hotNews.length, 2);
    assert.equal(response.aiNews[0].title, "字节发布 AI 编程模型");
    assert.equal(response.aiNews[0].source, "火山引擎");
    assert.match(response.aiNews[0].content, /原文链接/);
    assert.equal(response.hotNews[0].title, "数字化服务继续进入民生场景");
    assert.equal(response.aiNewsDate, "2026-06-10");
    assert.equal(response.hotNewsDate, "2026-06-10");
    assert.ok(service.requestedUrls.every((url) => url.includes("encoding=json")));
    assert.ok(service.requestedUrls.every((url) => url.includes("date=2026-06-10")));
    assert.equal(service.cache.calls.setDailySnapshot.length, 2);
    assert.equal(service.cache.calls.setLatestSnapshot.length, 2);
  });

  it("uses daily Redis snapshots by default without calling the provider", async () => {
    const cache = new TestNewsCacheService();
    cache.dailySnapshots.set("ai:2026-06-10", createSnapshot("ai", "2026-06-10", "2026-06-10", [previousAiItem]));
    cache.dailySnapshots.set("hot:2026-06-10", createSnapshot("hot", "2026-06-10", "2026-06-10", [previousHotItem]));
    const service = new TestNewsService({}, [], cache);

    const response = await service.getCreatorDailyNews({ date: "2026-06-10" });

    assert.equal(response.source, "cache");
    assert.equal(response.aiNews[0].title, "上一日 AI 资讯仍可用于选题");
    assert.equal(response.hotNews[0].title, "上一日热点资讯仍可用于选题");
    assert.deepEqual(service.requestedUrls, []);
  });

  it("refreshes from the provider even when daily Redis snapshots exist", async () => {
    const cache = new TestNewsCacheService();
    cache.dailySnapshots.set("ai:2026-06-10", createSnapshot("ai", "2026-06-10", "2026-06-10", [previousAiItem]));
    cache.dailySnapshots.set("hot:2026-06-10", createSnapshot("hot", "2026-06-10", "2026-06-10", [previousHotItem]));
    const service = new TestNewsService({}, [aiPayload, hotPayload], cache);

    const response = await service.getCreatorDailyNews({ date: "2026-06-10", refresh: true });

    assert.equal(response.source, "60s.viki.moe");
    assert.equal(response.aiNews[0].title, "字节发布 AI 编程模型");
    assert.equal(response.hotNews[0].title, "数字化服务继续进入民生场景");
    assert.equal(service.requestedUrls.length, 2);
  });

  it("returns cached data when provider requests fail after a successful load", async () => {
    const service = new TestNewsService({}, [aiPayload, hotPayload]);
    await service.getCreatorDailyNews({ date: "2026-06-10" });

    service.failRequests = true;
    const response = await service.getCreatorDailyNews({ date: "2026-06-10", refresh: true });

    assert.equal(response.source, "cache");
    assert.equal(response.aiNews[0].title, "字节发布 AI 编程模型");
    assert.equal(response.hotNews[0].title, "数字化服务继续进入民生场景");
  });

  it("rejects instead of returning an empty AI news section when the AI provider is slow", async () => {
    const service = new TestNewsService({}, [new Error("ai provider timeout"), hotPayload]);

    await assert.rejects(
      () => service.getCreatorDailyNews({ date: "2026-06-10", refresh: true }),
      ServiceUnavailableException,
    );
  });

  it("returns an empty AI news section only when the provider news field is empty and no latest snapshot exists", async () => {
    const service = new TestNewsService({}, [emptyAiPayload, hotPayload]);

    const response = await service.getCreatorDailyNews({ date: "2026-06-10", refresh: true });

    assert.equal(response.source, "60s.viki.moe");
    assert.equal(response.aiNewsEmptyDate, "2026-06-10");
    assert.equal(response.aiNews.length, 0);
    assert.equal(response.hotNews.length, 2);
  });

  it("marks today as empty and returns the latest AI news snapshot when today's news field is empty", async () => {
    const cache = new TestNewsCacheService();
    cache.latestSnapshots.set("ai", createSnapshot("ai", "2026-06-09", "2026-06-09", [previousAiItem]));
    const service = new TestNewsService({}, [emptyAiPayload, hotPayload], cache);

    const response = await service.getCreatorDailyNews({ date: "2026-06-10", refresh: true });

    assert.equal(response.date, "2026-06-10");
    assert.equal(response.source, "cache");
    assert.equal(response.aiNewsEmptyDate, "2026-06-10");
    assert.equal(response.aiNewsDate, "2026-06-09");
    assert.equal(response.aiNews[0].title, "上一日 AI 资讯仍可用于选题");
    assert.equal(response.hotNewsDate, "2026-06-10");
    assert.equal(cache.calls.setDailySnapshot.some((call) => call.kind === "ai" && call.snapshot.emptyDate === "2026-06-10"), true);
  });

  it("marks today as empty and returns the latest hot news snapshot when today's news field is empty", async () => {
    const cache = new TestNewsCacheService();
    cache.latestSnapshots.set("hot", createSnapshot("hot", "2026-06-09", "2026-06-09", [previousHotItem]));
    const service = new TestNewsService({}, [aiPayload, emptyHotPayload], cache);

    const response = await service.getCreatorDailyNews({ date: "2026-06-10", refresh: true });

    assert.equal(response.date, "2026-06-10");
    assert.equal(response.source, "cache");
    assert.equal(response.hotNewsEmptyDate, "2026-06-10");
    assert.equal(response.hotNewsDate, "2026-06-09");
    assert.equal(response.hotNews[0].title, "上一日热点资讯仍可用于选题");
    assert.equal(response.aiNewsDate, "2026-06-10");
    assert.equal(cache.calls.setDailySnapshot.some((call) => call.kind === "hot" && call.snapshot.emptyDate === "2026-06-10"), true);
  });

  it("uses mock data when mock mode is configured", async () => {
    const service = new TestNewsService({ NEWS_PROVIDER_MODE: "mock" });

    const response = await service.getCreatorDailyNews({ date: "2026-06-10", refresh: true });

    assert.equal(response.source, "mock");
    assert.ok(response.aiNews.length > 0);
    assert.ok(response.hotNews.length > 0);
    assert.deepEqual(service.requestedUrls, []);
  });

  it("rejects when provider fails without cache in auto mode", async () => {
    const service = new TestNewsService({});
    service.failRequests = true;

    await assert.rejects(
      () => service.getCreatorDailyNews({ date: "2026-06-10", refresh: true }),
      ServiceUnavailableException,
    );
  });
});
