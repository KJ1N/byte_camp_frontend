import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CreatorDailyNewsResponse, DailyNewsItem, DailyNewsProviderSource } from "@bytecamp-aigc/shared";

type NewsProviderMode = "auto" | "live" | "mock";

interface DailyNewsRequest {
  date?: string;
}

interface AiNewsPayload {
  code?: unknown;
  data?: {
    date?: unknown;
    news?: unknown;
  };
}

interface HotNewsPayload {
  code?: unknown;
  data?: {
    date?: unknown;
    news?: unknown;
    link?: unknown;
  };
}

const providerSource: DailyNewsProviderSource = "60s.viki.moe";
const defaultBaseUrl = "https://60s.viki.moe";
const defaultTimeoutMs = 12_000;

@Injectable()
export class NewsService {
  private cachedResponse: CreatorDailyNewsResponse | null = null;

  constructor(private readonly config: ConfigService) {}

  async getCreatorDailyNews(request: DailyNewsRequest = {}): Promise<CreatorDailyNewsResponse> {
    const mode = this.getProviderMode();
    if (mode === "mock") return this.createMockResponse(request.date);

    try {
      const liveResponse = await this.fetchLiveDailyNews(request);
      if (liveResponse.aiNews.length || liveResponse.hotNews.length) {
        this.cachedResponse = liveResponse;
      }
      return liveResponse;
    } catch (error) {
      if (mode === "live") {
        throw new ServiceUnavailableException(
          error instanceof Error ? error.message : "Daily news provider is unavailable",
        );
      }

      if (this.cachedResponse) {
        return {
          ...this.cachedResponse,
          source: "cache",
          aiNews: this.cachedResponse.aiNews.map((item) => ({ ...item })),
          hotNews: this.cachedResponse.hotNews.map((item) => ({ ...item })),
        };
      }

      return this.createMockResponse(request.date);
    }
  }

  private async fetchLiveDailyNews(request: DailyNewsRequest): Promise<CreatorDailyNewsResponse> {
    const [aiResult, hotResult] = await Promise.allSettled([
      this.fetchAiNews(request.date),
      this.fetchHotNews(request.date),
    ]);

    if (aiResult.status === "rejected" && hotResult.status === "rejected") {
      throw new Error("Daily AI and hot news providers are unavailable");
    }

    const aiNews = aiResult.status === "fulfilled" ? aiResult.value.items : [];
    const hotNews = hotResult.status === "fulfilled" ? hotResult.value.items : [];
    const date =
      request.date ??
      (aiResult.status === "fulfilled" ? aiResult.value.date : undefined) ??
      (hotResult.status === "fulfilled" ? hotResult.value.date : undefined) ??
      this.today();

    return {
      source: providerSource,
      date,
      aiNews,
      hotNews,
    };
  }

  private async fetchAiNews(date?: string) {
    const url = this.createProviderUrl("/v2/ai-news", date);
    const payload = await this.fetchProviderJson(url);
    const parsed = this.assertRecord(payload) as AiNewsPayload;
    this.assertSuccessCode(parsed.code);

    const data = this.assertRecord(parsed.data);
    const newsDate = typeof data.date === "string" && data.date.trim() ? data.date.trim() : date ?? this.today();
    const news = Array.isArray(data.news) ? data.news : [];

    return {
      date: newsDate,
      items: news.flatMap((item, index) => this.normalizeAiNewsItem(item, newsDate, index)),
    };
  }

  private async fetchHotNews(date?: string) {
    const url = this.createProviderUrl("/v2/60s", date);
    const payload = await this.fetchProviderJson(url);
    const parsed = this.assertRecord(payload) as HotNewsPayload;
    this.assertSuccessCode(parsed.code);

    const data = this.assertRecord(parsed.data);
    const newsDate = typeof data.date === "string" && data.date.trim() ? data.date.trim() : date ?? this.today();
    const news = Array.isArray(data.news) ? data.news : [];
    const link = typeof data.link === "string" && data.link.trim() ? data.link.trim() : undefined;

    return {
      date: newsDate,
      items: news.flatMap((item, index) => this.normalizeHotNewsItem(item, newsDate, index, link)),
    };
  }

  protected async fetchProviderJson(url: URL): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Daily news provider returned HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private normalizeAiNewsItem(value: unknown, date: string, index: number): DailyNewsItem[] {
    const record = this.toRecord(value);
    if (!record) return [];

    const title = this.normalizeText(record.title);
    if (!title) return [];

    const detail = this.normalizeText(record.detail);
    const source = this.normalizeText(record.source) || "AI 资讯";
    const itemDate = this.normalizeText(record.date) || date;
    const url = this.normalizeUrl(record.link);
    const content = this.joinBlocks([
      title,
      `来源：${source}`,
      `日期：${itemDate}`,
      detail,
      url ? `原文链接：${url}` : "",
    ]);

    return [
      {
        id: `ai-${itemDate}-${index + 1}`,
        kind: "AI",
        title,
        summary: this.truncate(detail || source, 120),
        content,
        source,
        date: itemDate,
        url,
      },
    ];
  }

  private normalizeHotNewsItem(value: unknown, date: string, index: number, url?: string): DailyNewsItem[] {
    if (typeof value !== "string") return [];

    const title = this.stripNewsIndex(value);
    if (!title) return [];

    const source = "每天 60 秒读懂世界";
    const content = this.joinBlocks([
      title,
      `来源：${source}`,
      `日期：${date}`,
      "写作提示：可以围绕事件背景、影响范围、读者关切和理性观点展开，形成适合图文发布的选题。",
      url ? `原始链接：${url}` : "",
    ]);

    return [
      {
        id: `hot-${date}-${index + 1}`,
        kind: "HOT",
        title,
        summary: this.truncate(title, 120),
        content,
        source,
        date,
        url,
      },
    ];
  }

  private createProviderUrl(pathname: string, date?: string) {
    const url = new URL(pathname, this.getBaseUrl());
    url.searchParams.set("encoding", "json");
    if (date) url.searchParams.set("date", date);
    return url;
  }

  private getProviderMode(): NewsProviderMode {
    const mode = this.config.get<string>("NEWS_PROVIDER_MODE")?.trim().toLowerCase();
    if (mode === "live" || mode === "mock") return mode;
    return "auto";
  }

  private getBaseUrl() {
    return this.config.get<string>("NEWS_BASE_URL")?.trim() || defaultBaseUrl;
  }

  private getTimeoutMs() {
    const configured = Number(this.config.get<string>("NEWS_FETCH_TIMEOUT_MS"));
    return Number.isFinite(configured) && configured >= 1_000 ? configured : defaultTimeoutMs;
  }

  private assertSuccessCode(code: unknown) {
    if (typeof code === "number" && code !== 200) {
      throw new Error(`Daily news provider returned code ${code}`);
    }
  }

  private assertRecord(value: unknown): Record<string, unknown> {
    const record = this.toRecord(value);
    if (!record) throw new Error("Daily news provider returned invalid payload");
    return record;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  }

  private normalizeText(value: unknown) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  private normalizeUrl(value: unknown) {
    const url = this.normalizeText(value);
    return /^https?:\/\//i.test(url) ? url : undefined;
  }

  private stripNewsIndex(value: string) {
    return value.replace(/^\s*(?:\d+[\.\u3001\uff0e\uff09\)]\s*)?/, "").replace(/\s+/g, " ").trim();
  }

  private truncate(value: string, maxLength: number) {
    const text = value.trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}…`;
  }

  private joinBlocks(blocks: string[]) {
    return blocks.map((block) => block.trim()).filter(Boolean).join("\n\n");
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private createMockResponse(date = this.today()): CreatorDailyNewsResponse {
    return {
      source: "mock",
      date,
      aiNews: [
        {
          id: `mock-ai-${date}-1`,
          kind: "AI",
          title: "AI 搜索与内容创作工具进入工作流竞争阶段",
          summary: "多类 AI 工具开始从单点问答走向选题、检索、写作和复盘的一体化流程。",
          content: this.joinBlocks([
            "AI 搜索与内容创作工具进入工作流竞争阶段",
            "来源：文舟演示数据",
            `日期：${date}`,
            "多类 AI 工具开始从单点问答走向选题、检索、写作和复盘的一体化流程。创作者可以关注工具如何降低资料整理成本、提升标题和正文的迭代效率，也要说明事实核验和人工编辑仍然是发布前的必要环节。",
          ]),
          source: "文舟演示数据",
          date,
        },
        {
          id: `mock-ai-${date}-2`,
          kind: "AI",
          title: "多模态模型推动图文内容生产提速",
          summary: "图像理解、文生图和长文改写能力正在改变图文创作者的素材处理方式。",
          content: this.joinBlocks([
            "多模态模型推动图文内容生产提速",
            "来源：文舟演示数据",
            `日期：${date}`,
            "图像理解、文生图和长文改写能力正在改变图文创作者的素材处理方式。文章可以从效率提升、版权边界、审核要求和人机协同四个角度展开。",
          ]),
          source: "文舟演示数据",
          date,
        },
      ],
      hotNews: [
        {
          id: `mock-hot-${date}-1`,
          kind: "HOT",
          title: "多地推进数字化服务，公共事务办理更强调线上协同",
          summary: "数字化服务继续进入民生场景，适合写成效率、体验和安全并重的观察文章。",
          content: this.joinBlocks([
            "多地推进数字化服务，公共事务办理更强调线上协同",
            "来源：文舟演示数据",
            `日期：${date}`,
            "数字化服务继续进入民生场景，适合从办理效率、老年人使用门槛、数据安全和线下兜底服务等角度展开，形成兼顾便利性与公共责任的图文内容。",
          ]),
          source: "文舟演示数据",
          date,
        },
        {
          id: `mock-hot-${date}-2`,
          kind: "HOT",
          title: "暑期消费与文旅活动升温，本地生活内容关注度上升",
          summary: "文旅、消费和城市服务话题适合转化为攻略、观察或避坑类图文。",
          content: this.joinBlocks([
            "暑期消费与文旅活动升温，本地生活内容关注度上升",
            "来源：文舟演示数据",
            `日期：${date}`,
            "文旅、消费和城市服务话题适合转化为攻略、观察或避坑类图文。创作者可以结合预算、交通、服务体验和安全提示，提供更有实用价值的内容。",
          ]),
          source: "文舟演示数据",
          date,
        },
      ],
    };
  }
}
