import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NewsService } from "./news.service";

class TestNewsService extends NewsService {
  readonly requestedUrls: string[] = [];
  failRequests = false;

  constructor(
    config: Record<string, string | undefined>,
    private readonly payloads: unknown[] = [],
  ) {
    super({
      get: (key: string) => config[key],
    } as never);
  }

  protected override async fetchProviderJson(url: URL): Promise<unknown> {
    this.requestedUrls.push(url.toString());
    if (this.failRequests) throw new Error("provider unavailable");
    const payload = this.payloads.shift();
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
    assert.ok(service.requestedUrls.every((url) => url.includes("encoding=json")));
    assert.ok(service.requestedUrls.every((url) => url.includes("date=2026-06-10")));
  });

  it("returns cached data when provider requests fail after a successful load", async () => {
    const service = new TestNewsService({}, [aiPayload, hotPayload]);
    await service.getCreatorDailyNews({ date: "2026-06-10" });

    service.failRequests = true;
    const response = await service.getCreatorDailyNews({ date: "2026-06-10" });

    assert.equal(response.source, "cache");
    assert.equal(response.aiNews[0].title, "字节发布 AI 编程模型");
    assert.equal(response.hotNews[0].title, "数字化服务继续进入民生场景");
  });

  it("uses mock data when mock mode is configured", async () => {
    const service = new TestNewsService({ NEWS_PROVIDER_MODE: "mock" });

    const response = await service.getCreatorDailyNews({ date: "2026-06-10" });

    assert.equal(response.source, "mock");
    assert.ok(response.aiNews.length > 0);
    assert.ok(response.hotNews.length > 0);
    assert.deepEqual(service.requestedUrls, []);
  });

  it("falls back to mock data when provider fails without cache in auto mode", async () => {
    const service = new TestNewsService({});
    service.failRequests = true;

    const response = await service.getCreatorDailyNews({ date: "2026-06-10" });

    assert.equal(response.source, "mock");
    assert.ok(response.aiNews.length > 0);
    assert.ok(response.hotNews.length > 0);
  });
});
