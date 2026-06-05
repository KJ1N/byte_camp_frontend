import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ArticleStatus,
  EngagementEventType,
  type ArticleEngagementStats,
  type CreateEngagementEventInput,
  type CreateEngagementEventResponse,
} from "@bytecamp-aigc/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(articleId: string, input: CreateEngagementEventInput): Promise<CreateEngagementEventResponse> {
    if (!this.isSupportedEventType(input.type)) {
      throw new BadRequestException("Unsupported engagement event type");
    }

    const article = await this.prisma.article.findFirst({
      where: { id: articleId, status: ArticleStatus.Published },
      select: { id: true },
    });

    if (!article) throw new NotFoundException("Article not found");

    await this.prisma.engagementEvent.create({
      data: {
        articleId,
        type: input.type,
        userKey: input.userKey ?? null,
        value: 1,
      },
    });

    return {
      articleId,
      type: input.type,
      stats: await this.getStats(articleId),
    };
  }

  async getStats(articleId: string): Promise<ArticleEngagementStats> {
    const events = await this.prisma.engagementEvent.findMany({
      where: { articleId },
      select: { type: true, value: true },
    });

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

  private isSupportedEventType(type: string): type is EngagementEventType {
    return Object.values(EngagementEventType).includes(type as EngagementEventType);
  }
}
