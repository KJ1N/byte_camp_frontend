import { Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CreatorDailyNewsResponse, DailyNewsItem, DailyNewsProviderSource } from "@bytecamp-aigc/shared";
import {
  NewsCacheService,
  type DailyNewsSnapshot,
  type DailyNewsSnapshotKind,
} from "./news-cache.service";

type NewsProviderMode = "auto" | "live" | "mock";

interface DailyNewsRequest {
  date?: string;
  refresh?: boolean;
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

interface DailyNewsResult {
  date: string;
  items: DailyNewsItem[];
  emptyDate?: string;
  fromCache?: boolean;
}

const providerSource: DailyNewsProviderSource = "60s.viki.moe";
const defaultBaseUrl = "https://60s.viki.moe";
const defaultTimeoutMs = 12_000;

@Injectable()
export class NewsService {
  private readonly cachedResponses = new Map<string, CreatorDailyNewsResponse>();
  private readonly cachedDailySnapshots = new Map<string, DailyNewsSnapshot>();
  private readonly cachedLatestSnapshots = new Map<DailyNewsSnapshotKind, DailyNewsSnapshot>();

  constructor(
    private readonly config: ConfigService,
    @Optional()
    private readonly newsCache?: NewsCacheService,
  ) {}

  async getCreatorDailyNews(request: DailyNewsRequest = {}): Promise<CreatorDailyNewsResponse> {
    const mode = this.getProviderMode();
    const requestDate = request.date ?? this.today();
    if (mode === "mock") return this.createMockResponse(requestDate);

    try {
      const liveResponse = await this.fetchLiveDailyNews({ date: requestDate, refresh: request.refresh });
      this.cacheLiveResponse(liveResponse);
      return liveResponse;
    } catch (error) {
      if (mode === "live") {
        throw new ServiceUnavailableException(
          error instanceof Error ? error.message : "Daily news provider is unavailable",
        );
      }

      const cachedResponse = this.getCachedResponse(requestDate);
      if (cachedResponse) {
        return this.cloneResponse(cachedResponse, "cache");
      }

      throw new ServiceUnavailableException(
        error instanceof Error ? error.message : "Daily news provider is unavailable",
      );
    }
  }

  private async fetchLiveDailyNews(request: DailyNewsRequest): Promise<CreatorDailyNewsResponse> {
    const requestDate = request.date ?? this.today();
    const [aiResult, hotResult] = await Promise.allSettled([
      this.resolveNewsKind("ai", requestDate, Boolean(request.refresh), () => this.fetchAiNews(requestDate)),
      this.resolveNewsKind("hot", requestDate, Boolean(request.refresh), () => this.fetchHotNews(requestDate)),
    ]);

    if (aiResult.status === "rejected" || hotResult.status === "rejected") {
      throw new Error("Daily news provider returned incomplete data");
    }

    const aiNews = aiResult.value.items;
    const hotNews = hotResult.value.items;

    return {
      source: aiResult.value.fromCache || hotResult.value.fromCache ? "cache" : providerSource,
      date: requestDate,
      aiNewsDate: aiResult.value.date,
      aiNewsEmptyDate: aiResult.value.emptyDate,
      hotNewsDate: hotResult.value.date,
      hotNewsEmptyDate: hotResult.value.emptyDate,
      aiNews,
      hotNews,
    };
  }

  private async resolveNewsKind(
    kind: DailyNewsSnapshotKind,
    requestDate: string,
    refresh: boolean,
    fetcher: () => Promise<DailyNewsResult>,
  ): Promise<DailyNewsResult> {
    if (!refresh) {
      const cachedDaily = await this.getDailySnapshot(kind, requestDate);
      if (cachedDaily) return this.resultFromSnapshot(cachedDaily);
    }

    try {
      const current = await fetcher();
      if (current.items.length) {
        await this.writeNonEmptySnapshot(kind, requestDate, current);
        return current;
      }

      const latestSnapshot = await this.getLatestSnapshot(kind);
      const fallback = latestSnapshot
        ? { ...this.resultFromSnapshot(latestSnapshot), emptyDate: current.date, fromCache: true }
        : { date: current.date, emptyDate: current.date, items: [] };
      await this.setDailySnapshot(
        kind,
        this.createSnapshot(requestDate, fallback.date, fallback.items, fallback.emptyDate),
      );
      return fallback;
    } catch (error) {
      const fallbackSnapshot = (await this.getDailySnapshot(kind, requestDate)) ?? (await this.getLatestSnapshot(kind));
      if (fallbackSnapshot) return this.resultFromSnapshot(fallbackSnapshot);
      throw error;
    }
  }

  private async fetchAiNews(date?: string): Promise<DailyNewsResult> {
    const url = this.createProviderUrl("/v2/ai-news", date);
    const payload = await this.fetchProviderJson(url);
    const parsed = this.assertRecord(payload) as AiNewsPayload;
    this.assertSuccessCode(parsed.code);

    const data = this.assertRecord(parsed.data);
    const newsDate = typeof data.date === "string" && data.date.trim() ? data.date.trim() : date ?? this.today();
    const news = this.assertNewsArray(data.news);

    return {
      date: newsDate,
      items: news.flatMap((item, index) => this.normalizeAiNewsItem(item, newsDate, index)),
    };
  }

  private async fetchHotNews(date?: string): Promise<DailyNewsResult> {
    const url = this.createProviderUrl("/v2/60s", date);
    const payload = await this.fetchProviderJson(url);
    const parsed = this.assertRecord(payload) as HotNewsPayload;
    this.assertSuccessCode(parsed.code);

    const data = this.assertRecord(parsed.data);
    const newsDate = typeof data.date === "string" && data.date.trim() ? data.date.trim() : date ?? this.today();
    const news = this.assertNewsArray(data.news);
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

  private assertNewsArray(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
      throw new Error("Daily news provider returned invalid news field");
    }
    return value;
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
    const parts = new Intl.DateTimeFormat("zh-CN", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Shanghai",
      year: "numeric",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  private cacheLiveResponse(response: CreatorDailyNewsResponse) {
    this.cachedResponses.set(response.date, this.cloneResponse(response));
  }

  private getCachedResponse(date: string) {
    const exactMatch = this.cachedResponses.get(date);
    if (exactMatch) return exactMatch;

    let latestResponse: CreatorDailyNewsResponse | null = null;
    for (const response of this.cachedResponses.values()) {
      if (!latestResponse || response.date > latestResponse.date) {
        latestResponse = response;
      }
    }
    return latestResponse;
  }

  private cloneResponse(
    response: CreatorDailyNewsResponse,
    source: DailyNewsProviderSource = response.source,
  ): CreatorDailyNewsResponse {
    return {
      ...response,
      source,
      aiNews: response.aiNews.map((item) => ({ ...item })),
      hotNews: response.hotNews.map((item) => ({ ...item })),
    };
  }

  private async writeNonEmptySnapshot(kind: DailyNewsSnapshotKind, requestDate: string, result: DailyNewsResult) {
    const snapshot = this.createSnapshot(requestDate, result.date, result.items);
    await Promise.all([this.setDailySnapshot(kind, snapshot), this.setLatestSnapshot(kind, snapshot)]);
  }

  private async getDailySnapshot(kind: DailyNewsSnapshotKind, date: string) {
    const redisSnapshot = await this.newsCache?.getDailySnapshot(kind, date);
    if (redisSnapshot) {
      this.rememberDailySnapshot(kind, redisSnapshot);
      return this.cloneSnapshot(redisSnapshot);
    }

    const memorySnapshot = this.cachedDailySnapshots.get(this.getMemorySnapshotKey(kind, date));
    return memorySnapshot ? this.cloneSnapshot(memorySnapshot) : null;
  }

  private async setDailySnapshot(kind: DailyNewsSnapshotKind, snapshot: DailyNewsSnapshot) {
    this.rememberDailySnapshot(kind, snapshot);
    await this.newsCache?.setDailySnapshot(kind, snapshot);
  }

  private async getLatestSnapshot(kind: DailyNewsSnapshotKind) {
    const redisSnapshot = await this.newsCache?.getLatestSnapshot(kind);
    if (redisSnapshot) {
      this.rememberLatestSnapshot(kind, redisSnapshot);
      return this.cloneSnapshot(redisSnapshot);
    }

    const memorySnapshot = this.cachedLatestSnapshots.get(kind);
    return memorySnapshot ? this.cloneSnapshot(memorySnapshot) : null;
  }

  private async setLatestSnapshot(kind: DailyNewsSnapshotKind, snapshot: DailyNewsSnapshot) {
    this.rememberLatestSnapshot(kind, snapshot);
    await this.newsCache?.setLatestSnapshot(kind, snapshot);
  }

  private rememberDailySnapshot(kind: DailyNewsSnapshotKind, snapshot: DailyNewsSnapshot) {
    this.cachedDailySnapshots.set(this.getMemorySnapshotKey(kind, snapshot.requestedDate), this.cloneSnapshot(snapshot));
  }

  private rememberLatestSnapshot(kind: DailyNewsSnapshotKind, snapshot: DailyNewsSnapshot) {
    this.cachedLatestSnapshots.set(kind, this.cloneSnapshot(snapshot));
  }

  private resultFromSnapshot(snapshot: DailyNewsSnapshot): DailyNewsResult {
    return {
      date: snapshot.contentDate,
      emptyDate: snapshot.emptyDate,
      fromCache: true,
      items: snapshot.items.map((item) => ({ ...item })),
    };
  }

  private createSnapshot(
    requestedDate: string,
    contentDate: string,
    items: DailyNewsItem[],
    emptyDate?: string,
  ): DailyNewsSnapshot {
    return {
      requestedDate,
      contentDate,
      ...(emptyDate ? { emptyDate } : {}),
      items: items.map((item) => ({ ...item })),
      updatedAt: new Date().toISOString(),
    };
  }

  private cloneSnapshot(snapshot: DailyNewsSnapshot): DailyNewsSnapshot {
    return {
      ...snapshot,
      items: snapshot.items.map((item) => ({ ...item })),
    };
  }

  private getMemorySnapshotKey(kind: DailyNewsSnapshotKind, date: string) {
    return `${kind}:${date}`;
  }

  private createMockResponse(date = this.today()): CreatorDailyNewsResponse {
    return {
      source: "mock",
      date,
      aiNewsDate: date,
      hotNewsDate: date,
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
