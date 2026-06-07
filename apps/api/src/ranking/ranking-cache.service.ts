import { Inject, Injectable, OnModuleDestroy, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

export type RankingKind = "hot" | "top";

export interface RankingCacheEntry {
  articleId: string;
  score: number;
}

export interface RankingCacheRedisClient {
  zadd(key: string, ...args: Array<string | number>): Promise<number>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  del(...keys: string[]): Promise<number>;
  zrem(key: string, member: string): Promise<number>;
  set(key: string, value: string): Promise<unknown>;
  quit(): Promise<unknown>;
}

const rankingKeys: Record<RankingKind, string> = {
  hot: "rank:hot",
  top: "rank:top",
};

export const RANKING_CACHE_REDIS_CLIENT = "RANKING_CACHE_REDIS_CLIENT";

@Injectable()
export class RankingCacheService implements OnModuleDestroy {
  private readonly redis: RankingCacheRedisClient | null;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(RANKING_CACHE_REDIS_CLIENT)
    redisClient?: RankingCacheRedisClient,
  ) {
    const redisUrl = this.configService.get<string>("REDIS_URL");
    this.redis = redisClient ?? (redisUrl ? new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null);
  }

  isAvailable() {
    return Boolean(this.redis);
  }

  async getRankedArticleIds(kind: RankingKind, offset: number, limit: number): Promise<string[] | null> {
    if (!this.redis) return null;

    try {
      const ids = await this.redis.zrevrange(this.getKey(kind), offset, offset + limit - 1);
      return ids.length ? ids : null;
    } catch {
      return null;
    }
  }

  async replaceRanking(kind: RankingKind, entries: RankingCacheEntry[]) {
    if (!this.redis) return false;

    try {
      const key = this.getKey(kind);
      await this.redis.del(key, this.getUpdatedAtKey(kind));

      if (entries.length) {
        await this.redis.zadd(
          key,
          ...entries.flatMap((entry) => [entry.score, entry.articleId] as [number, string]),
        );
      }

      await this.redis.set(this.getUpdatedAtKey(kind), new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  async invalidateRankings() {
    if (!this.redis) return false;

    try {
      await this.redis.del("rank:hot", "rank:top", "rank:hot:updated_at", "rank:top:updated_at");
      return true;
    } catch {
      return false;
    }
  }

  async removeArticle(articleId: string) {
    if (!this.redis) return false;

    try {
      await this.redis.zrem("rank:hot", articleId);
      await this.redis.zrem("rank:top", articleId);
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

  private getKey(kind: RankingKind) {
    return rankingKeys[kind];
  }

  private getUpdatedAtKey(kind: RankingKind) {
    return `${this.getKey(kind)}:updated_at`;
  }
}
