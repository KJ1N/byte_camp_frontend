import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { DailyNewsItem, DailyNewsKind } from "@bytecamp-aigc/shared";

export type DailyNewsSnapshotKind = "ai" | "hot";

export interface DailyNewsSnapshot {
  requestedDate: string;
  contentDate: string;
  emptyDate?: string;
  items: DailyNewsItem[];
  updatedAt: string;
}

export interface NewsCacheRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  quit(): Promise<unknown>;
}

export const NEWS_CACHE_REDIS_CLIENT = "NEWS_CACHE_REDIS_CLIENT";

const defaultDailySnapshotTtlSeconds = 7 * 24 * 60 * 60;
const keyPrefix = "news:creator-daily";

@Injectable()
export class NewsCacheService implements OnModuleDestroy {
  private readonly redis: NewsCacheRedisClient | null;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(NEWS_CACHE_REDIS_CLIENT)
    redisClient?: NewsCacheRedisClient,
  ) {
    const redisUrl = this.configService.get<string>("REDIS_URL");
    this.redis =
      redisClient ??
      (redisUrl
        ? (new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 }) as unknown as NewsCacheRedisClient)
        : null);
  }

  isAvailable() {
    return Boolean(this.redis);
  }

  async getDailySnapshot(kind: DailyNewsSnapshotKind, date: string) {
    return this.getSnapshot(this.getDailyKey(kind, date));
  }

  async setDailySnapshot(kind: DailyNewsSnapshotKind, snapshot: DailyNewsSnapshot) {
    if (!this.redis) return false;

    try {
      await this.redis.set(
        this.getDailyKey(kind, snapshot.requestedDate),
        JSON.stringify(snapshot),
        "EX",
        this.getDailySnapshotTtlSeconds(),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getLatestSnapshot(kind: DailyNewsSnapshotKind) {
    return this.getSnapshot(this.getLatestKey(kind));
  }

  async setLatestSnapshot(kind: DailyNewsSnapshotKind, snapshot: DailyNewsSnapshot) {
    if (!this.redis) return false;

    try {
      await this.redis.set(this.getLatestKey(kind), JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    try {
      await this.redis?.quit();
    } catch {
      // Redis is optional; shutdown should not fail when the cache is already gone.
    }
  }

  private async getSnapshot(key: string) {
    if (!this.redis) return null;

    try {
      const payload = await this.redis.get(key);
      if (!payload) return null;
      return this.parseSnapshot(payload);
    } catch {
      return null;
    }
  }

  private parseSnapshot(payload: string): DailyNewsSnapshot | null {
    try {
      const record = this.toRecord(JSON.parse(payload));
      if (!record) return null;

      const requestedDate = this.normalizeText(record.requestedDate);
      const contentDate = this.normalizeText(record.contentDate);
      const emptyDate = this.normalizeText(record.emptyDate);
      const updatedAt = this.normalizeText(record.updatedAt);
      const items = this.normalizeItems(record.items);

      if (!requestedDate || !contentDate || !updatedAt || !items) return null;

      return {
        requestedDate,
        contentDate,
        ...(emptyDate ? { emptyDate } : {}),
        items,
        updatedAt,
      };
    } catch {
      return null;
    }
  }

  private normalizeItems(value: unknown): DailyNewsItem[] | null {
    if (!Array.isArray(value)) return null;

    const items: DailyNewsItem[] = [];
    for (const item of value) {
      const record = this.toRecord(item);
      if (!record) return null;

      const id = this.normalizeText(record.id);
      const kind = this.normalizeKind(record.kind);
      const title = this.normalizeText(record.title);
      const summary = this.normalizeText(record.summary);
      const content = this.normalizeText(record.content);
      const source = this.normalizeText(record.source);
      const date = this.normalizeText(record.date);
      const url = this.normalizeText(record.url);

      if (!id || !kind || !title || !summary || !content || !source || !date) return null;

      items.push({
        id,
        kind,
        title,
        summary,
        content,
        source,
        date,
        ...(url ? { url } : {}),
      });
    }

    return items;
  }

  private normalizeKind(value: unknown): DailyNewsKind | null {
    return value === "AI" || value === "HOT" ? value : null;
  }

  private normalizeText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  }

  private getDailySnapshotTtlSeconds() {
    const configured = Number(this.configService.get<string>("NEWS_DAILY_SNAPSHOT_TTL_SECONDS"));
    return Number.isFinite(configured) && configured >= 60
      ? Math.floor(configured)
      : defaultDailySnapshotTtlSeconds;
  }

  private getDailyKey(kind: DailyNewsSnapshotKind, date: string) {
    return `${keyPrefix}:${kind}:${date}`;
  }

  private getLatestKey(kind: DailyNewsSnapshotKind) {
    return `${keyPrefix}:${kind}:latest`;
  }
}
