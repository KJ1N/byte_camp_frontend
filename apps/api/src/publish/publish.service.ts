import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ArticleStatus,
  AuditDecision,
  DraftStatus,
  EngagementEventType,
  richTextToPlainText,
  type AuditCheckResponse,
  type ArticleDetail,
  type ArticleEngagementStats,
  type AuditResult,
  type PublishArticleResponse,
  type QualityScore,
  type RichTextDocument,
  type ScoringArticleResponse,
  type WithdrawArticleResponse,
} from "@bytecamp-aigc/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";
import { ScoringService } from "../scoring/scoring.service";

@Injectable()
export class PublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly scoringService: ScoringService,
    private readonly rankingService: RankingService = new RankingService(),
  ) {}

  async checkDraft(authorId: string, draftId: string): Promise<AuditCheckResponse> {
    const { draft, text } = await this.loadDraftText(this.prisma, authorId, draftId);
    const result = await this.auditService.checkText(`${draft.title}\n${text}`);

    return this.prisma.$transaction(async (tx) => {
      return this.createAuditRecord(tx, draft.id, result);
    });
  }

  async scoreDraft(authorId: string, draftId: string): Promise<ScoringArticleResponse> {
    const { draft, text } = await this.loadDraftText(this.prisma, authorId, draftId);
    const result = await this.scoringService.scoreArticle({
      title: draft.title,
      text,
    });

    return this.prisma.$transaction(async (tx) => {
      return this.createQualityScore(tx, draft.id, result);
    });
  }

  async getPublishedArticle(id: string): Promise<ArticleDetail> {
    const article = await this.prisma.article.findFirst({
      where: { id, status: ArticleStatus.Published },
      include: {
        author: { select: { id: true, nickname: true } },
        auditRecords: { orderBy: { createdAt: "desc" }, take: 1 },
        scores: { orderBy: { createdAt: "desc" }, take: 1 },
        events: { select: { type: true, value: true } },
      },
    });

    if (!article) throw new NotFoundException("Article not found");

    const latestAuditRecord =
      article.auditRecords[0] ??
      (await this.prisma.auditRecord.findFirst({
        where: { draftId: article.draftId },
        orderBy: { createdAt: "desc" },
      }));
    const latestScoreRecord =
      article.scores[0] ??
      (await this.prisma.qualityScore.findFirst({
        where: { draftId: article.draftId },
        orderBy: { createdAt: "desc" },
      }));
    const engagement = this.statsFromEvents(article.events ?? []);
    const qualityScore = latestScoreRecord?.overall ?? 0;

    return {
      id: article.id,
      draftId: article.draftId,
      title: article.title,
      body: article.body as unknown as RichTextDocument,
      summary: article.summary,
      status: article.status as ArticleStatus,
      author: article.author,
      publishedAt: article.publishedAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
      latestAudit: latestAuditRecord
        ? {
            recordId: latestAuditRecord.id,
            result: latestAuditRecord.rawResult as unknown as AuditResult,
            createdAt: latestAuditRecord.createdAt.toISOString(),
          }
        : undefined,
      latestScore: latestScoreRecord
        ? {
            scoreId: latestScoreRecord.id,
            contentValue: latestScoreRecord.contentValue,
            expressionQuality: latestScoreRecord.expressionQuality,
            readerExperience: latestScoreRecord.readerExperience,
            spreadPotential: latestScoreRecord.spreadPotential,
            safetyScore: latestScoreRecord.safetyScore,
            overall: latestScoreRecord.overall,
            reasons: this.asStringArray(latestScoreRecord.reasons),
            suggestions: this.asStringArray(latestScoreRecord.suggestions),
            createdAt: latestScoreRecord.createdAt.toISOString(),
          }
        : undefined,
      engagement,
      ranking: this.rankingService.calculateBreakdown({
        qualityScore,
        views: engagement.views,
        likes: engagement.likes,
        favorites: engagement.favorites,
        publishedAt: article.publishedAt,
      }),
    };
  }

  async publishDraft(authorId: string, draftId: string): Promise<PublishArticleResponse> {
    const { draft, body, text } = await this.loadDraftText(this.prisma, authorId, draftId);
    const auditResult = await this.auditService.checkText(`${draft.title}\n${text}`);
    const scoreResult = await this.scoringService.scoreArticle({
      title: draft.title,
      text,
      safetyScore: this.safetyScoreFor(auditResult.decision),
    });

    return this.prisma.$transaction(async (tx) => {
      await this.assertDraftUnchanged(tx, draft.id, draft.version);

      const audit = await this.createAuditRecord(tx, draft.id, auditResult);
      const score = await this.createQualityScore(tx, draft.id, scoreResult);

      if (auditResult.decision === AuditDecision.Block) {
        return {
          status: "BLOCKED",
          audit,
          score,
          message: "内容命中高风险规则，已阻止发布。",
        };
      }

      if (auditResult.decision === AuditDecision.Warn) {
        return {
          status: "NEEDS_REVISION",
          audit,
          score,
          message: "内容需要修改后重新审核。",
        };
      }

      const existingArticle = await tx.article.findFirst({
        where: { draftId: draft.id, status: ArticleStatus.Published },
        select: { id: true },
      });
      const summary = this.createSummary(text);

      if (existingArticle) {
        await tx.article.update({
          where: { id: existingArticle.id },
          data: {
            status: ArticleStatus.Published,
            title: draft.title,
            body: body as unknown as Prisma.InputJsonValue,
            summary,
          },
        });

        await tx.articleRevision.create({
          data: {
            articleId: existingArticle.id,
            title: draft.title,
            body: body as unknown as Prisma.InputJsonValue,
            reason: "二次发布更新",
          },
        });

        await this.linkPublishRecordsToArticle(tx, {
          articleId: existingArticle.id,
          auditRecordId: audit.recordId,
          scoreId: score.scoreId,
        });

        await tx.draft.update({
          where: { id: draft.id },
          data: { status: DraftStatus.Published },
        });

        return {
          articleId: existingArticle.id,
          status: "PUBLISHED",
          audit,
          score,
          message: "文章已更新并重新发布。",
        };
      }

      const article = await tx.article.create({
        data: {
          authorId,
          draftId: draft.id,
          title: draft.title,
          body: body as unknown as Prisma.InputJsonValue,
          summary,
        },
      });

      await tx.articleRevision.create({
        data: {
          articleId: article.id,
          title: draft.title,
          body: body as unknown as Prisma.InputJsonValue,
          reason: "初次发布",
        },
      });

      await this.linkPublishRecordsToArticle(tx, {
        articleId: article.id,
        auditRecordId: audit.recordId,
        scoreId: score.scoreId,
      });

      await tx.draft.update({
        where: { id: draft.id },
        data: { status: DraftStatus.Published },
      });

      return {
        articleId: article.id,
        status: "PUBLISHED",
        audit,
        score,
        message: "文章发布成功。",
      };
    });
  }

  async withdrawArticle(authorId: string, articleId: string): Promise<WithdrawArticleResponse> {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, authorId },
      select: { id: true, draftId: true, status: true },
    });

    if (!article) throw new NotFoundException("Article not found");
    if (article.status === ArticleStatus.Withdrawn) {
      throw new ConflictException("Article already withdrawn");
    }

    await this.prisma.article.update({
      where: { id: article.id },
      data: { status: ArticleStatus.Withdrawn },
    });

    return {
      articleId: article.id,
      draftId: article.draftId,
      status: ArticleStatus.Withdrawn,
      message: "文章已撤回，读者将无法继续访问。",
    };
  }

  private async loadDraftText(db: Pick<Prisma.TransactionClient, "draft">, authorId: string, draftId: string) {
    const draft = await db.draft.findFirst({
      where: { id: draftId, authorId },
    });

    if (!draft) throw new NotFoundException("Draft not found");

    const body = draft.body as unknown as RichTextDocument;
    return {
      draft,
      body,
      text: richTextToPlainText(body),
    };
  }

  private async assertDraftUnchanged(tx: Prisma.TransactionClient, draftId: string, version: number) {
    const currentDraft = await tx.draft.findFirst({
      where: { id: draftId, version },
      select: { id: true },
    });

    if (!currentDraft) {
      throw new ConflictException("Draft changed after audit. Please review and publish again.");
    }
  }

  private async createAuditRecord(
    tx: Prisma.TransactionClient,
    draftId: string,
    result: AuditResult,
  ): Promise<AuditCheckResponse> {
    const record = await tx.auditRecord.create({
      data: {
        draftId,
        stage: "PUBLISH_PRECHECK",
        decision: result.decision,
        riskLevel: result.riskLevel,
        categories: result.categories,
        evidence: result.evidence as unknown as Prisma.InputJsonValue,
        suggestions: result.rewriteSuggestions as unknown as Prisma.InputJsonValue,
        rawResult: result as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      recordId: record.id,
      result,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private async createQualityScore(
    tx: Prisma.TransactionClient,
    draftId: string,
    result: QualityScore,
  ): Promise<ScoringArticleResponse> {
    const score = await tx.qualityScore.create({
      data: {
        draftId,
        contentValue: result.contentValue,
        expressionQuality: result.expressionQuality,
        readerExperience: result.readerExperience,
        spreadPotential: result.spreadPotential,
        safetyScore: result.safetyScore,
        overall: result.overall,
        reasons: result.reasons as unknown as Prisma.InputJsonValue,
        suggestions: result.suggestions as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      ...result,
      scoreId: score.id,
      createdAt: score.createdAt.toISOString(),
    };
  }

  private async linkPublishRecordsToArticle(
    tx: Prisma.TransactionClient,
    input: { articleId: string; auditRecordId: string; scoreId: string },
  ) {
    await tx.auditRecord.update({
      where: { id: input.auditRecordId },
      data: { articleId: input.articleId },
    });

    await tx.qualityScore.update({
      where: { id: input.scoreId },
      data: { articleId: input.articleId },
    });
  }

  private safetyScoreFor(decision: AuditDecision) {
    if (decision === AuditDecision.Block) return 20;
    if (decision === AuditDecision.Warn) return 65;
    return 95;
  }

  private createSummary(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return "暂无摘要";
    return trimmed.length > 120 ? `${trimmed.slice(0, 120)}...` : trimmed;
  }

  private asStringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
