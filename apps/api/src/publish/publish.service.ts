import { ConflictException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ArticleStatus,
  AuditDecision,
  AssetAuditStatus,
  DraftStatus,
  EngagementEventType,
  RiskCategory,
  richTextToPlainText,
  type AuditCheckResponse,
  type ArticleDetail,
  type ArticleEngagementStats,
  type AuditResult,
  type PublishArticleResponse,
  type QualityScore,
  type RichTextDocument,
  type RichTextNode,
  type ScoringArticleResponse,
  type WithdrawArticleResponse,
} from "@bytecamp-aigc/shared";
import { AssetAuditService } from "../assets/asset-audit.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { RankingCacheService } from "../ranking/ranking-cache.service";
import { RankingService } from "../ranking/ranking.service";
import { ScoringService } from "../scoring/scoring.service";

interface DraftAuditBundle {
  aggregate: AuditResult;
  text: AuditResult;
  images: AuditResult[];
}

interface DraftImageAuditTarget {
  src: string;
  alt?: string;
  caption?: string;
  prompt?: string;
}

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly scoringService: ScoringService,
    private readonly rankingService: RankingService = new RankingService(),
    private readonly rankingCacheService?: RankingCacheService,
    @Optional() private readonly assetAuditService?: AssetAuditService,
  ) {}

  async checkDraft(authorId: string, draftId: string): Promise<AuditCheckResponse> {
    const { draft, body, text } = await this.loadDraftText(this.prisma, authorId, draftId);
    const auditBundle = await this.auditDraftContent(draft.title, body, text);

    return this.prisma.$transaction(async (tx) => {
      await this.assertDraftUnchanged(tx, draft.id, draft.version);
      const audit = await this.createAuditRecords(tx, draft.id, auditBundle);
      const passed = audit.result.decision === AuditDecision.Pass;

      await tx.draft.update({
        where: { id: draft.id },
        data: passed
          ? {
              reviewStatus: "NEEDS_REVIEW",
              reviewedVersion: draft.version,
              reviewAuditRecordId: audit.recordId,
              reviewScoreId: null,
            }
          : {
              reviewStatus: "NEEDS_REVIEW",
              reviewedVersion: null,
              reviewAuditRecordId: null,
              reviewScoreId: null,
            },
      });

      return audit;
    });
  }

  async scoreDraft(authorId: string, draftId: string): Promise<ScoringArticleResponse> {
    const { draft, text } = await this.loadDraftText(this.prisma, authorId, draftId);
    const result = await this.scoringService.scoreArticle({
      title: draft.title,
      text,
    });

    return this.prisma.$transaction(async (tx) => {
      await this.assertDraftUnchanged(tx, draft.id, draft.version);
      const score = await this.createQualityScore(tx, draft.id, result);

      if (draft.reviewedVersion === draft.version && draft.reviewAuditRecordId) {
        const update = await tx.draft.updateMany({
          where: {
            id: draft.id,
            version: draft.version,
            reviewedVersion: draft.version,
            reviewAuditRecordId: draft.reviewAuditRecordId,
          },
          data: {
            reviewStatus: "REVIEWED",
            reviewScoreId: score.scoreId,
          },
        });

        if (update.count !== 1) {
          throw new ConflictException("草稿在审核评分期间发生变化，请重新审核。");
        }
      }

      return score;
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
    if (
      draft.reviewStatus !== "REVIEWED" ||
      draft.reviewedVersion !== draft.version ||
      !draft.reviewAuditRecordId ||
      !draft.reviewScoreId
    ) {
      throw new ConflictException("草稿内容已变化或尚未完成审核，请重新审核后发布。");
    }
    const reviewAuditRecordId = draft.reviewAuditRecordId;
    const reviewScoreId = draft.reviewScoreId;

    const result = await this.prisma.$transaction<PublishArticleResponse>(async (tx) => {
      const reviewedDraft = await tx.draft.findFirst({
        where: {
          id: draft.id,
          authorId,
          version: draft.version,
          reviewStatus: "REVIEWED",
          reviewedVersion: draft.version,
          reviewAuditRecordId,
          reviewScoreId,
        },
        select: { id: true },
      });

      if (!reviewedDraft) {
        throw new ConflictException("草稿内容已变化，请重新审核后发布。");
      }

      const auditRecord = await tx.auditRecord.findFirst({
        where: {
          id: reviewAuditRecordId,
          draftId: draft.id,
          decision: AuditDecision.Pass,
        },
      });
      const scoreRecord = await tx.qualityScore.findFirst({
        where: {
          id: reviewScoreId,
          draftId: draft.id,
        },
      });

      if (!auditRecord || !scoreRecord) {
        throw new ConflictException("审核记录已失效，请重新审核后发布。");
      }

      const audit = this.auditResponseFromRecord(auditRecord);
      const score = this.scoreResponseFromRecord(scoreRecord);
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

    if (result.status === "PUBLISHED") {
      await this.rankingCacheService?.invalidateRankings();
    }

    return result;
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
    await this.rankingCacheService?.removeArticle(article.id);

    return {
      articleId: article.id,
      draftId: article.draftId,
      status: ArticleStatus.Withdrawn,
      message: "文章已撤回，读者将无法继续访问。",
    };
  }

  private async auditDraftContent(title: string, body: RichTextDocument, text: string): Promise<DraftAuditBundle> {
    const textResult = await this.auditService.checkText(`${title}\n${text}`);
    const imageTargets = this.extractImageAuditTargets(body);
    const imageResults = await Promise.all(
      imageTargets.map((target, index) => this.auditImageTarget(target, index)),
    );

    return {
      text: textResult,
      images: imageResults,
      aggregate: this.aggregateAuditResults(textResult, imageResults),
    };
  }

  private async auditImageTarget(target: DraftImageAuditTarget, index: number): Promise<AuditResult> {
    if (!target.src) {
      return this.createImageAuditWarn(index, "图片节点缺少地址，无法完成图片审核。");
    }

    try {
      if (this.assetAuditService) {
        return this.assetAuditToAuditResult(
          await this.assetAuditService.auditGeneratedImage({
            url: target.src,
            alt: target.alt,
            caption: target.caption,
            prompt: target.prompt,
          }),
          index,
        );
      }

      return this.auditService.checkText(
        [`图片 ${index + 1}`, target.alt, target.caption, target.prompt, target.src].filter(Boolean).join("\n"),
      );
    } catch (error) {
      const details = error instanceof Error ? error.stack ?? error.message : String(error);
      this.logger.warn(`第 ${index + 1} 张图片审核失败：${details}`);
      return this.createImageAuditWarn(index, "图片下载或视觉审核失败，请稍后重试或替换图片。");
    }
  }

  private aggregateAuditResults(textResult: AuditResult, imageResults: AuditResult[]): AuditResult {
    const results = [textResult, ...imageResults];
    const decision = this.aggregateDecision(results);

    if (decision === AuditDecision.Pass) {
      return {
        decision,
        riskLevel: "none",
        categories: [],
        evidence: [],
        rewriteSuggestions: [],
        summary: "文字和图片均未发现明显风险。",
        source: this.aggregateSource(results),
      };
    }

    return {
      decision,
      riskLevel: results.some((result) => result.riskLevel === "high") ? "high" : "medium",
      categories: [...new Set(results.flatMap((result) => result.categories))],
      evidence: results.flatMap((result) => result.evidence),
      rewriteSuggestions: [...new Set(results.flatMap((result) => result.rewriteSuggestions))],
      summary:
        decision === AuditDecision.Block
          ? "文字或图片命中高风险规则，已阻止发布。"
          : "文字或图片存在中风险，需要修改后重新审核。",
      source: this.aggregateSource(results),
    };
  }

  private aggregateDecision(results: AuditResult[]) {
    if (results.some((result) => result.decision === AuditDecision.Block)) return AuditDecision.Block;
    if (results.some((result) => result.decision === AuditDecision.Warn)) return AuditDecision.Warn;
    return AuditDecision.Pass;
  }

  private aggregateSource(results: AuditResult[]): AuditResult["source"] {
    return results.some((result) => result.source === "MODEL") ? "MODEL" : "MOCK";
  }

  private assetAuditToAuditResult(
    result: Awaited<ReturnType<AssetAuditService["auditGeneratedImage"]>>,
    index: number,
  ): AuditResult {
    const decision =
      result.decision === AssetAuditStatus.Blocked
        ? AuditDecision.Block
        : result.decision === AssetAuditStatus.Warn
          ? AuditDecision.Warn
          : AuditDecision.Pass;

    return {
      decision,
      riskLevel: result.riskLevel,
      categories: result.categories,
      evidence: result.evidence.map((item) => ({
        text: item.text || `图片 ${index + 1}`,
        reason: item.reason || "图片审核命中风险。",
      })),
      rewriteSuggestions:
        decision === AuditDecision.Pass ? [] : [`请替换或重新生成第 ${index + 1} 张图片。`],
      summary: `第 ${index + 1} 张图片审核: ${result.summary}`,
      model: result.model,
      source: result.source,
    };
  }

  private createImageAuditWarn(index: number, reason: string): AuditResult {
    return {
      decision: AuditDecision.Warn,
      riskLevel: "medium",
      categories: [RiskCategory.LowQuality],
      evidence: [{ text: `图片 ${index + 1}`, reason }],
      rewriteSuggestions: [`请重新生成或移除第 ${index + 1} 张图片。`],
      summary: `第 ${index + 1} 张图片审核未完成，需要处理后再发布。`,
      source: "MOCK",
    };
  }

  private extractImageAuditTargets(body: RichTextDocument): DraftImageAuditTarget[] {
    const targets: DraftImageAuditTarget[] = [];

    for (const node of body.content) {
      this.collectImageAuditTargets(node, targets);
    }

    return targets;
  }

  private collectImageAuditTargets(node: RichTextNode, targets: DraftImageAuditTarget[]) {
    if (node.type === "image") {
      targets.push({
        src: this.readNodeAttr(node, "src") ?? "",
        alt: this.readNodeAttr(node, "alt"),
        caption: this.readNodeAttr(node, "title"),
        prompt: this.readNodeAttr(node, "prompt"),
      });
    }

    for (const child of node.content ?? []) {
      this.collectImageAuditTargets(child, targets);
    }
  }

  private readNodeAttr(node: RichTextNode, key: string) {
    const value = node.attrs?.[key];
    return typeof value === "string" ? value.trim() : undefined;
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

  private async createAuditRecords(
    tx: Prisma.TransactionClient,
    draftId: string,
    bundle: DraftAuditBundle,
  ): Promise<AuditCheckResponse> {
    if (!bundle.images.length) {
      return this.createAuditRecord(tx, draftId, bundle.aggregate, "PUBLISH_PRECHECK");
    }

    await this.createAuditRecord(tx, draftId, bundle.text, "PUBLISH_PRECHECK_TEXT");

    for (const imageResult of bundle.images) {
      await this.createAuditRecord(tx, draftId, imageResult, "PUBLISH_PRECHECK_IMAGE");
    }

    return this.createAuditRecord(tx, draftId, bundle.aggregate, "PUBLISH_PRECHECK");
  }

  private async createAuditRecord(
    tx: Prisma.TransactionClient,
    draftId: string,
    result: AuditResult,
    stage: string,
  ): Promise<AuditCheckResponse> {
    const record = await tx.auditRecord.create({
      data: {
        draftId,
        stage,
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

  private auditResponseFromRecord(record: {
    id: string;
    rawResult: Prisma.JsonValue;
    createdAt: Date;
  }): AuditCheckResponse {
    return {
      recordId: record.id,
      result: record.rawResult as unknown as AuditResult,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private scoreResponseFromRecord(record: {
    id: string;
    contentValue: number;
    expressionQuality: number;
    readerExperience: number;
    spreadPotential: number;
    safetyScore: number;
    overall: number;
    reasons: Prisma.JsonValue;
    suggestions: Prisma.JsonValue;
    createdAt: Date;
  }): ScoringArticleResponse {
    return {
      scoreId: record.id,
      contentValue: record.contentValue,
      expressionQuality: record.expressionQuality,
      readerExperience: record.readerExperience,
      spreadPotential: record.spreadPotential,
      safetyScore: record.safetyScore,
      overall: record.overall,
      reasons: this.asStringArray(record.reasons),
      suggestions: this.asStringArray(record.suggestions),
      createdAt: record.createdAt.toISOString(),
    };
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
