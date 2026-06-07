import { Injectable, NotFoundException } from "@nestjs/common";
import {
  ArticleStatus,
  CreatorContentStatus,
  CreatorContentType,
  EngagementEventType,
  type ArticleEngagementStats,
  type CreatorContentItem,
  type CreatorOverviewResponse,
  type CreatorWorkItem,
  type DraftSummary,
} from "@bytecamp-aigc/shared";
import { PrismaService } from "../prisma/prisma.service";

interface DraftRecord {
  id: string;
  title: string;
  status: string;
  mode: string;
  version: number;
  updatedAt: Date;
  createdAt: Date;
}

interface ArticleRecord {
  id: string;
  draftId: string;
  title: string;
  summary: string;
  status: string;
  publishedAt: Date;
  updatedAt: Date;
  scores: Array<{ overall: number }>;
  events: Array<{ type: string; value: number }>;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCreatorOverview(userId: string): Promise<CreatorOverviewResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, avatarUrl: true },
    });

    if (!user) throw new NotFoundException("User not found");

    const [draftCount, recentDrafts, articles] = await Promise.all([
      this.prisma.draft.count({ where: { authorId: userId } }),
      this.prisma.draft.findMany({
        where: { authorId: userId },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }) as Promise<DraftRecord[]>,
      this.prisma.article.findMany({
        where: { authorId: userId },
        include: {
          scores: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { overall: true },
          },
          events: { select: { type: true, value: true } },
        },
        orderBy: { publishedAt: "desc" },
        take: 20,
      }) as Promise<ArticleRecord[]>,
    ]);

    const works = articles.map((article) => this.mapWork(article));
    const totals = works.reduce(
      (stats, work) => {
        stats.views += work.engagement.views;
        stats.likes += work.engagement.likes;
        stats.favorites += work.engagement.favorites;
        if (work.qualityScore > 0) {
          stats.qualitySum += work.qualityScore;
          stats.scoredWorks += 1;
        }
        return stats;
      },
      { views: 0, likes: 0, favorites: 0, qualitySum: 0, scoredWorks: 0 },
    );

    return {
      user,
      stats: {
        followers: 0,
        publishedArticles: works.filter((work) => work.status === ArticleStatus.Published).length,
        draftCount,
        totalViews: totals.views,
        totalLikes: totals.likes,
        totalFavorites: totals.favorites,
        averageQualityScore: totals.scoredWorks ? Math.round(totals.qualitySum / totals.scoredWorks) : 0,
      },
      recentDrafts: recentDrafts.map((draft) => this.mapDraftSummary(draft)),
      works,
      contents: this.sortContentsByUpdatedTime([
        ...recentDrafts.map((draft) => this.mapDraftContent(draft)),
        ...articles.map((article) => this.mapArticleContent(article)),
      ]),
    };
  }

  private mapDraftSummary(draft: DraftRecord): DraftSummary {
    return {
      id: draft.id,
      title: draft.title,
      status: draft.status as DraftSummary["status"],
      mode: draft.mode as DraftSummary["mode"],
      version: draft.version,
      updatedAt: draft.updatedAt.toISOString(),
      createdAt: draft.createdAt.toISOString(),
    };
  }

  private mapWork(article: ArticleRecord): CreatorWorkItem {
    return {
      id: article.id,
      title: article.title,
      summary: article.summary,
      status: article.status as ArticleStatus,
      publishedAt: article.publishedAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
      qualityScore: article.scores[0]?.overall ?? 0,
      engagement: this.statsFromEvents(article.events),
    };
  }

  private mapDraftContent(draft: DraftRecord): CreatorContentItem {
    return {
      id: draft.id,
      type: CreatorContentType.Draft,
      status: CreatorContentStatus.Draft,
      title: draft.title,
      summary: `v${draft.version}，最近更新草稿`,
      draftId: draft.id,
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  private mapArticleContent(article: ArticleRecord): CreatorContentItem {
    const engagement = this.statsFromEvents(article.events);

    return {
      id: article.id,
      type: CreatorContentType.Article,
      status:
        article.status === ArticleStatus.Withdrawn
          ? CreatorContentStatus.Withdrawn
          : CreatorContentStatus.Published,
      title: article.title,
      summary: article.summary,
      draftId: article.draftId,
      articleId: article.id,
      updatedAt: article.updatedAt.toISOString(),
      publishedAt: article.publishedAt.toISOString(),
      qualityScore: article.scores[0]?.overall ?? 0,
      engagement,
    };
  }

  private sortContentsByUpdatedTime(contents: CreatorContentItem[]) {
    return contents.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
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
}
