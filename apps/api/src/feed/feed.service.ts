import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ArticleStatus,
  EngagementEventType,
  type ArticleEngagementStats,
  type ArticleListItem,
  type CursorPageResponse,
} from "@bytecamp-aigc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

export type RankingKind = "hot" | "top";

export interface ListArticlesOptions {
  limit?: number;
  cursor?: string;
  now?: Date;
}

interface PublishedArticleRecord {
  id: string;
  title: string;
  summary: string;
  publishedAt: Date;
  author: {
    id: string;
    nickname: string;
  };
  scores: Array<{ overall: number }>;
  events: Array<{ type: string; value: number }>;
}

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingService: RankingService,
  ) {}

  async listFeed(options: ListArticlesOptions = {}): Promise<CursorPageResponse<ArticleListItem>> {
    const now = options.now ?? new Date();
    const candidates = await this.getPublishedArticleCandidates();
    const ranked = this.rankingService.sortForFeed(candidates, now).map(({ article, ranking }) =>
      this.toListItem(article, ranking),
    );

    return this.paginate(ranked, options);
  }

  async listRanking(kind: RankingKind, options: ListArticlesOptions = {}): Promise<CursorPageResponse<ArticleListItem>> {
    const now = options.now ?? new Date();
    const candidates = await this.getPublishedArticleCandidates();
    const sorted =
      kind === "hot"
        ? this.rankingService.sortForHot(candidates, now)
        : this.rankingService.sortForTop(candidates, now);
    const items = sorted.map(({ article, ranking }) => this.toListItem(article, ranking));
    const page = this.paginate(items, options);

    await this.recordSnapshot(kind, page.items, now);

    return page;
  }

  private async getPublishedArticleCandidates() {
    const articles = (await this.prisma.article.findMany({
      where: { status: ArticleStatus.Published },
      include: {
        author: { select: { id: true, nickname: true } },
        scores: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { overall: true },
        },
        events: { select: { type: true, value: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 100,
    })) as PublishedArticleRecord[];

    return articles.map((article) => {
      const engagement = this.statsFromEvents(article.events);
      const qualityScore = article.scores[0]?.overall ?? 0;

      return {
        id: article.id,
        article,
        qualityScore,
        views: engagement.views,
        likes: engagement.likes,
        favorites: engagement.favorites,
        publishedAt: article.publishedAt,
      };
    });
  }

  private toListItem(
    article: PublishedArticleRecord,
    ranking: ArticleListItem["ranking"],
  ): ArticleListItem {
    const engagement = this.statsFromEvents(article.events);

    return {
      id: article.id,
      title: article.title,
      summary: article.summary,
      author: article.author,
      publishedAt: article.publishedAt.toISOString(),
      qualityScore: article.scores[0]?.overall ?? 0,
      engagement,
      ranking,
    };
  }

  private statsFromEvents(events: Array<{ type: string; value: number }>): ArticleEngagementStats {
    return events.reduce<ArticleEngagementStats>(
      (stats, event) => {
        if (event.type === EngagementEventType.View) stats.views += event.value;
        if (event.type === EngagementEventType.Like) stats.likes += event.value;
        if (event.type === EngagementEventType.Favorite) stats.favorites += event.value;
        return stats;
      },
      { views: 0, likes: 0, favorites: 0 },
    );
  }

  private paginate<T>(items: T[], options: ListArticlesOptions): CursorPageResponse<T> {
    const limit = this.normalizeLimit(options.limit);
    const offset = this.normalizeCursor(options.cursor);
    const pageItems = items.slice(offset, offset + limit);
    const nextOffset = offset + pageItems.length;

    return {
      items: pageItems,
      nextCursor: nextOffset < items.length ? String(nextOffset) : undefined,
    };
  }

  private normalizeLimit(limit?: number) {
    if (typeof limit !== "number" || !Number.isFinite(limit)) return 10;
    return Math.min(Math.max(Math.trunc(limit), 1), 20);
  }

  private normalizeCursor(cursor?: string) {
    const parsed = Number.parseInt(cursor ?? "0", 10);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  }

  private async recordSnapshot(kind: RankingKind, items: ArticleListItem[], now: Date) {
    await this.prisma.rankingSnapshot.create({
      data: {
        name: kind,
        payload: {
          generatedAt: now.toISOString(),
          items: items.map((item, index) => ({
            rank: index + 1,
            articleId: item.id,
            rankScore: item.ranking.rankScore,
          })),
        } as Prisma.InputJsonValue,
      },
    });
  }
}
