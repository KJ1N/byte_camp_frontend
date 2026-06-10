import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ArticleStatus, AuditDecision, DraftMode, DraftStatus, type RichTextDocument } from "@bytecamp-aigc/shared";
import { AuditService } from "../audit/audit.service";
import type { RankingCacheService } from "../ranking/ranking-cache.service";
import { RankingService } from "../ranking/ranking.service";
import { ScoringService } from "../scoring/scoring.service";
import { PublishService } from "./publish.service";

const safeBody: RichTextDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "AI 可以帮助创作者完成选题、生成、编辑和发布前检查。" }],
    },
  ],
};

const warnBody: RichTextDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "案例里包含身份证号，需要发布前脱敏处理。" }],
    },
  ],
};

const blockBody: RichTextDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "这篇文章诱导读者参与赌博并承诺快速回本。" }],
    },
  ],
};

const imageBody: RichTextDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "上海租界短图文正文。" }],
    },
    {
      type: "image",
      attrs: {
        src: "https://example.test/shanghai.png",
        alt: "上海外滩租界建筑",
        title: "外滩一带保留了许多租界时期建筑",
      },
    },
  ],
};

function createDraft(body: RichTextDocument, title = "AI 如何改变内容创作") {
  return {
    id: "draft-1",
    authorId: "user-1",
    mode: DraftMode.Fast,
    status: DraftStatus.Draft,
    title,
    body,
    version: 1,
    reviewStatus: "NEEDS_REVIEW",
    reviewedVersion: null as number | null,
    reviewAuditRecordId: null as string | null,
    reviewScoreId: null as string | null,
    createdAt: new Date("2026-06-04T10:00:00.000Z"),
    updatedAt: new Date("2026-06-04T10:00:00.000Z"),
  };
}

function createAuditService() {
  return new AuditService({
    auditContent: async (text: string) => {
      if (/赌博/.test(text)) {
        return {
          decision: AuditDecision.Block,
          riskLevel: "high",
          categories: [],
          evidence: [{ text: "赌博", reason: "包含赌博引导表达" }],
          rewriteSuggestions: ["删除赌博相关表达"],
          summary: "内容命中高风险规则，禁止发布。",
          source: "MOCK",
        };
      }

      if (/身份证号|手机号/.test(text)) {
        return {
          decision: AuditDecision.Warn,
          riskLevel: "medium",
          categories: [],
          evidence: [{ text: "身份证号", reason: "包含敏感个人信息" }],
          rewriteSuggestions: ["删除或脱敏个人信息"],
          summary: "内容需要修改后重新审核。",
          source: "MOCK",
        };
      }

      return {
        decision: AuditDecision.Pass,
        riskLevel: "none",
        categories: [],
        evidence: [],
        rewriteSuggestions: [],
        summary: "未发现明显风险。",
        source: "MOCK",
      };
    },
  } as never);
}

function createService(
  body: RichTextDocument,
  options: {
    existingArticleId?: string;
    draftTitle?: string;
    rejectAuditInsideTransaction?: boolean;
    rejectScoringInsideTransaction?: boolean;
    assetAuditError?: Error;
  } = {},
) {
  let draft = createDraft(body, options.draftTitle);
  let inTransaction = false;
  const calls = {
    auditRecords: [] as Array<{ decision: AuditDecision }>,
    auditRecordStages: [] as string[],
    auditRecordArticleLinks: [] as Array<{ id: string; articleId: string }>,
    qualityScores: [] as Array<{ overall: number }>,
    qualityScoreArticleLinks: [] as Array<{ id: string; articleId: string }>,
    articles: [] as Array<{ title: string; summary: string }>,
    articleUpdates: [] as Array<{
      id: string;
      title: string;
      body: RichTextDocument;
      summary: string;
      status?: ArticleStatus;
    }>,
    revisions: [] as Array<{ title: string; body: RichTextDocument; reason?: string }>,
    draftUpdates: [] as Array<{ status: DraftStatus }>,
    rankingInvalidations: 0,
    auditModelCalls: 0,
    scoringModelCalls: 0,
  };
  const auditRows: Array<{
    id: string;
    draftId: string;
    articleId?: string;
    decision: AuditDecision;
    rawResult: unknown;
    createdAt: Date;
  }> = [];
  const scoreRows: Array<{
    id: string;
    draftId: string;
    articleId?: string;
    contentValue: number;
    expressionQuality: number;
    readerExperience: number;
    spreadPotential: number;
    safetyScore: number;
    overall: number;
    reasons: unknown;
    suggestions: unknown;
    createdAt: Date;
  }> = [];

  const tx = {
    draft: {
      findFirst: async (args?: {
        where?: {
          id?: string;
          authorId?: string;
          version?: number;
          reviewStatus?: string;
          reviewedVersion?: number;
          reviewAuditRecordId?: string;
          reviewScoreId?: string;
        };
      }) => {
        const where = args?.where;
        if (where?.id !== undefined && where.id !== draft.id) return null;
        if (where?.authorId !== undefined && where.authorId !== draft.authorId) return null;
        if (where?.version !== undefined && where.version !== draft.version) return null;
        if (where?.reviewStatus !== undefined && where.reviewStatus !== draft.reviewStatus) return null;
        if (where?.reviewedVersion !== undefined && where.reviewedVersion !== draft.reviewedVersion) return null;
        if (where?.reviewAuditRecordId !== undefined && where.reviewAuditRecordId !== draft.reviewAuditRecordId) return null;
        if (where?.reviewScoreId !== undefined && where.reviewScoreId !== draft.reviewScoreId) return null;
        return draft;
      },
      update: async ({ data }: { data: Partial<typeof draft> & { status?: DraftStatus } }) => {
        if (data.status) calls.draftUpdates.push({ status: data.status });
        draft = { ...draft, ...data };
        return draft;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          version: number;
          reviewedVersion: number;
          reviewAuditRecordId: string;
        };
        data: Partial<typeof draft>;
      }) => {
        if (
          where.id !== draft.id ||
          where.version !== draft.version ||
          where.reviewedVersion !== draft.reviewedVersion ||
          where.reviewAuditRecordId !== draft.reviewAuditRecordId
        ) {
          return { count: 0 };
        }
        draft = { ...draft, ...data };
        return { count: 1 };
      },
    },
    auditRecord: {
      create: async ({
        data,
      }: {
        data: { draftId: string; decision: AuditDecision; stage?: string; rawResult: unknown };
      }) => {
        calls.auditRecords.push({ decision: data.decision });
        if (data.stage) calls.auditRecordStages.push(data.stage);
        const record = {
          id: `audit-${calls.auditRecords.length}`,
          createdAt: new Date("2026-06-04T10:00:00.000Z"),
          ...data,
        };
        auditRows.push(record);
        return record;
      },
      findFirst: async ({ where }: { where: { id: string; draftId: string; decision: AuditDecision } }) => {
        return (
          auditRows.find(
            (record) =>
              record.id === where.id &&
              record.draftId === where.draftId &&
              record.decision === where.decision,
          ) ?? null
        );
      },
      update: async ({ where, data }: { where: { id: string }; data: { articleId: string } }) => {
        calls.auditRecordArticleLinks.push({ id: where.id, articleId: data.articleId });
        const record = auditRows.find((item) => item.id === where.id);
        if (record) record.articleId = data.articleId;
        return { ...record, id: where.id, ...data };
      },
    },
    qualityScore: {
      create: async ({
        data,
      }: {
        data: Omit<(typeof scoreRows)[number], "id" | "createdAt">;
      }) => {
        calls.qualityScores.push({ overall: data.overall });
        const record = {
          id: `score-${calls.qualityScores.length}`,
          createdAt: new Date("2026-06-04T10:00:00.000Z"),
          ...data,
        };
        scoreRows.push(record);
        return record;
      },
      findFirst: async ({ where }: { where: { id: string; draftId: string } }) => {
        return scoreRows.find((record) => record.id === where.id && record.draftId === where.draftId) ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { articleId: string } }) => {
        calls.qualityScoreArticleLinks.push({ id: where.id, articleId: data.articleId });
        const record = scoreRows.find((item) => item.id === where.id);
        if (record) record.articleId = data.articleId;
        return { ...record, id: where.id, ...data };
      },
    },
    article: {
      findFirst: async () => (options.existingArticleId ? { id: options.existingArticleId } : null),
      create: async ({ data }: { data: { title: string; summary: string } }) => {
        calls.articles.push({ title: data.title, summary: data.summary });
        return {
          id: "article-1",
          publishedAt: new Date("2026-06-04T10:00:00.000Z"),
          updatedAt: new Date("2026-06-04T10:00:00.000Z"),
          ...data,
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { title: string; body: unknown; summary: string; status?: ArticleStatus };
      }) => {
        calls.articleUpdates.push({
          id: where.id,
          title: data.title,
          body: data.body as RichTextDocument,
          summary: data.summary,
          status: data.status,
        });
        return {
          id: where.id,
          publishedAt: new Date("2026-06-04T10:00:00.000Z"),
          updatedAt: new Date("2026-06-04T10:00:00.000Z"),
          ...data,
        };
      },
    },
    articleRevision: {
      create: async ({ data }: { data: { title: string; body: unknown; reason?: string } }) => {
        calls.revisions.push({ title: data.title, body: data.body as RichTextDocument, reason: data.reason });
        return { id: "revision-1", createdAt: new Date("2026-06-04T10:00:00.000Z"), ...data };
      },
    },
  };

  const prisma = {
    draft: tx.draft,
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => {
      inTransaction = true;
      try {
        return await callback(tx);
      } finally {
        inTransaction = false;
      }
    },
  };

  const auditService = new AuditService({
    auditContent: async (text: string) => {
      calls.auditModelCalls += 1;
      if (options.rejectAuditInsideTransaction && inTransaction) {
        throw new Error("Audit should run before opening the Prisma transaction");
      }

      return createAuditService().checkText(text);
    },
  } as never);
  const scoringService = {
    scoreArticle: async (input: { title: string; text: string; safetyScore?: number }) => {
      calls.scoringModelCalls += 1;
      if (options.rejectScoringInsideTransaction && inTransaction) {
        throw new Error("Scoring should run before opening the Prisma transaction");
      }

      return new ScoringService().scoreArticle(input);
    },
  };
  const rankingCache = {
    invalidateRankings: async () => {
      calls.rankingInvalidations += 1;
      return true;
    },
  };
  const assetAuditService = options.assetAuditError
    ? {
        auditGeneratedImage: async () => {
          throw options.assetAuditError;
        },
      }
    : undefined;

  return {
    service: new PublishService(
      prisma as never,
      auditService,
      scoringService as never,
      new RankingService(),
      rankingCache as unknown as RankingCacheService,
      assetAuditService as never,
    ),
    calls,
    changeDraft: () => {
      draft = {
        ...draft,
        version: draft.version + 1,
        reviewStatus: "NEEDS_REVIEW",
        reviewedVersion: null,
        reviewAuditRecordId: null,
        reviewScoreId: null,
      };
    },
  };
}

function createWithdrawService(
  article:
    | {
        id: string;
        authorId: string;
        draftId: string;
        status: ArticleStatus;
      }
    | null,
) {
  const calls = {
    articleUpdates: [] as Array<{ id: string; status: ArticleStatus }>,
    removedArticles: [] as string[],
  };
  const prisma = {
    article: {
      findFirst: async ({ where }: { where: { id: string; authorId: string } }) => {
        if (!article) return null;
        if (where.id !== article.id || where.authorId !== article.authorId) return null;
        return article;
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: ArticleStatus } }) => {
        calls.articleUpdates.push({ id: where.id, status: data.status });
        return { ...article, id: where.id, status: data.status };
      },
    },
  };
  const rankingCache = {
    removeArticle: async (articleId: string) => {
      calls.removedArticles.push(articleId);
      return true;
    },
  };

  return {
    service: new PublishService(
      prisma as never,
      createAuditService(),
      new ScoringService(),
      new RankingService(),
      rankingCache as unknown as RankingCacheService,
    ),
    calls,
  };
}

function createArticleDetailService() {
  const prisma = {
    article: {
      findFirst: async () => ({
        id: "article-1",
        draftId: "draft-1",
        title: "AI 如何改变内容创作",
        body: safeBody,
        summary: "AI 可以帮助创作者完成选题、生成、编辑和发布前检查。",
        status: ArticleStatus.Published,
        publishedAt: new Date("2026-06-04T10:00:00.000Z"),
        updatedAt: new Date("2026-06-04T10:00:00.000Z"),
        author: {
          id: "user-1",
          nickname: "训练营创作者",
        },
        auditRecords: [
          {
            id: "audit-1",
            rawResult: {
              decision: AuditDecision.Pass,
              riskLevel: "none",
              categories: [],
              evidence: [],
              rewriteSuggestions: [],
              summary: "未发现明显风险。",
            },
            createdAt: new Date("2026-06-04T10:00:00.000Z"),
          },
        ],
        scores: [
          {
            id: "score-1",
            contentValue: 90,
            expressionQuality: 88,
            readerExperience: 86,
            spreadPotential: 82,
            safetyScore: 95,
            overall: 88,
            reasons: ["内容结构完整"],
            suggestions: ["补充真实案例"],
            createdAt: new Date("2026-06-04T10:00:00.000Z"),
          },
        ],
        events: [
          { type: "VIEW", value: 12 },
          { type: "LIKE", value: 3 },
          { type: "FAVORITE", value: 2 },
        ],
      }),
    },
  };

  return new PublishService(prisma as never, createAuditService(), new ScoringService());
}

function createLegacyArticleDetailService() {
  const prisma = {
    article: {
      findFirst: async () => ({
        id: "article-1",
        draftId: "draft-1",
        title: "AI 如何改变内容创作",
        body: safeBody,
        summary: "AI 可以帮助创作者完成选题、生成、编辑和发布前检查。",
        status: ArticleStatus.Published,
        publishedAt: new Date("2026-06-04T10:00:00.000Z"),
        updatedAt: new Date("2026-06-04T10:00:00.000Z"),
        author: {
          id: "user-1",
          nickname: "训练营创作者",
        },
        auditRecords: [],
        scores: [],
      }),
    },
    auditRecord: {
      findFirst: async () => ({
        id: "audit-legacy",
        rawResult: {
          decision: AuditDecision.Pass,
          riskLevel: "none",
          categories: [],
          evidence: [],
          rewriteSuggestions: [],
          summary: "旧记录按草稿回退读取。",
        },
        createdAt: new Date("2026-06-04T10:00:00.000Z"),
      }),
    },
    qualityScore: {
      findFirst: async () => ({
        id: "score-legacy",
        contentValue: 86,
        expressionQuality: 84,
        readerExperience: 82,
        spreadPotential: 78,
        safetyScore: 95,
        overall: 84,
        reasons: ["旧评分记录"],
        suggestions: ["继续优化案例"],
        createdAt: new Date("2026-06-04T10:00:00.000Z"),
      }),
    },
  };

  return new PublishService(prisma as never, createAuditService(), new ScoringService());
}

async function reviewDraft(service: PublishService) {
  const audit = await service.checkDraft("user-1", "draft-1");
  const score = await service.scoreDraft("user-1", "draft-1");
  return { audit, score };
}

describe("PublishService", () => {
  it("checks a draft and persists the audit record", async () => {
    const { service, calls } = createService(warnBody);

    const result = await service.checkDraft("user-1", "draft-1");

    assert.equal(result.result.decision, AuditDecision.Warn);
    assert.equal(result.recordId, "audit-1");
    assert.deepEqual(calls.auditRecords, [{ decision: AuditDecision.Warn }]);
    assert.equal(calls.articles.length, 0);
  });

  it("splits text and image audit records before returning the aggregate result", async () => {
    const { service, calls } = createService(imageBody);

    const result = await service.checkDraft("user-1", "draft-1");

    assert.equal(result.result.decision, AuditDecision.Pass);
    assert.deepEqual(calls.auditRecordStages, [
      "PUBLISH_PRECHECK_TEXT",
      "PUBLISH_PRECHECK_IMAGE",
      "PUBLISH_PRECHECK",
    ]);
    assert.equal(calls.auditRecords.length, 3);
  });

  it("returns a friendly image warning instead of exposing an internal audit error", async () => {
    const { service } = createService(imageBody, {
      assetAuditError: new Error("(parsed.categories ?? []).filter is not a function"),
    });

    const result = await service.checkDraft("user-1", "draft-1");

    assert.equal(result.result.decision, AuditDecision.Warn);
    assert.equal(result.result.evidence[0].reason, "图片下载或视觉审核失败，请稍后重试或替换图片。");
    assert.doesNotMatch(result.result.evidence[0].reason, /filter is not a function/);
  });

  it("scores a draft and persists the quality score", async () => {
    const { service, calls } = createService(safeBody);

    const result = await service.scoreDraft("user-1", "draft-1");

    assert.equal(result.scoreId, "score-1");
    assert.ok(result.overall > 0);
    assert.equal(calls.qualityScores.length, 1);
    assert.equal(calls.articles.length, 0);
  });

  it("publishes a passing draft and creates the article snapshot", async () => {
    const { service, calls } = createService(safeBody);
    await reviewDraft(service);
    const auditCallsBeforePublish = calls.auditModelCalls;
    const scoringCallsBeforePublish = calls.scoringModelCalls;

    const result = await service.publishDraft("user-1", "draft-1");

    assert.equal(result.status, "PUBLISHED");
    assert.equal(result.articleId, "article-1");
    assert.equal(result.audit.result.decision, AuditDecision.Pass);
    assert.ok(result.score.overall > 0);
    assert.equal(calls.articles.length, 1);
    assert.equal(calls.revisions.length, 1);
    assert.deepEqual(calls.draftUpdates, [{ status: DraftStatus.Published }]);
    assert.deepEqual(calls.auditRecordArticleLinks, [{ id: "audit-1", articleId: "article-1" }]);
    assert.deepEqual(calls.qualityScoreArticleLinks, [{ id: "score-1", articleId: "article-1" }]);
    assert.equal(calls.rankingInvalidations, 1);
    assert.equal(calls.auditModelCalls, auditCallsBeforePublish);
    assert.equal(calls.scoringModelCalls, scoringCallsBeforePublish);
  });

  it("runs model audit before opening the publish transaction", async () => {
    const { service } = createService(safeBody, { rejectAuditInsideTransaction: true });
    await reviewDraft(service);

    const result = await service.publishDraft("user-1", "draft-1");

    assert.equal(result.status, "PUBLISHED");
  });

  it("runs model scoring before opening the publish transaction", async () => {
    const { service } = createService(safeBody, { rejectScoringInsideTransaction: true });
    await reviewDraft(service);

    const result = await service.publishDraft("user-1", "draft-1");

    assert.equal(result.status, "PUBLISHED");
  });

  it("rejects publishing when the draft changes after model audit", async () => {
    const { service, calls, changeDraft } = createService(safeBody);
    await reviewDraft(service);
    changeDraft();

    await assert.rejects(
      () => service.publishDraft("user-1", "draft-1"),
      /草稿内容已变化或尚未完成审核/,
    );
    assert.equal(calls.articles.length, 0);
  });

  it("republishes a passing draft by updating the existing article snapshot", async () => {
    const updatedBody: RichTextDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Updated body after the creator edits the published draft." }],
        },
      ],
    };
    const { service, calls } = createService(updatedBody, {
      existingArticleId: "article-1",
      draftTitle: "Updated published article",
    });
    await reviewDraft(service);

    const result = await service.publishDraft("user-1", "draft-1");

    assert.equal(result.status, "PUBLISHED");
    assert.equal(result.articleId, "article-1");
    assert.equal(calls.articles.length, 0);
    assert.deepEqual(calls.articleUpdates, [
      {
        id: "article-1",
        title: "Updated published article",
        body: updatedBody,
        summary: "Updated body after the creator edits the published draft.",
        status: ArticleStatus.Published,
      },
    ]);
    assert.deepEqual(calls.revisions, [
      {
        title: "Updated published article",
        body: updatedBody,
        reason: "二次发布更新",
      },
    ]);
    assert.deepEqual(calls.auditRecordArticleLinks, [{ id: "audit-1", articleId: "article-1" }]);
    assert.deepEqual(calls.qualityScoreArticleLinks, [{ id: "score-1", articleId: "article-1" }]);
  });

  it("keeps a warn draft unpublished and returns revision guidance", async () => {
    const { service, calls } = createService(warnBody);
    await reviewDraft(service);

    await assert.rejects(
      () => service.publishDraft("user-1", "draft-1"),
      /尚未完成审核/,
    );
    assert.equal(calls.articles.length, 0);
    assert.equal(calls.revisions.length, 0);
    assert.equal(calls.draftUpdates.length, 0);
  });

  it("blocks high-risk drafts without creating an article", async () => {
    const { service, calls } = createService(blockBody);
    await reviewDraft(service);

    await assert.rejects(
      () => service.publishDraft("user-1", "draft-1"),
      /尚未完成审核/,
    );
    assert.equal(calls.articles.length, 0);
    assert.equal(calls.draftUpdates.length, 0);
  });

  it("returns a published article with latest audit and score", async () => {
    const service = createArticleDetailService();

    const article = await service.getPublishedArticle("article-1");

    assert.equal(article.id, "article-1");
    assert.equal(article.author.nickname, "训练营创作者");
    assert.equal(article.latestAudit?.result.decision, AuditDecision.Pass);
    assert.equal(article.latestScore?.overall, 88);
    assert.deepEqual(article.engagement, {
      views: 12,
      likes: 3,
      favorites: 2,
    });
    assert.equal(article.ranking?.qualityScore, 88);
    assert.equal(article.ranking?.hotScore, 36);
  });

  it("falls back to draft-linked audit and score records for older articles", async () => {
    const service = createLegacyArticleDetailService();

    const article = await service.getPublishedArticle("article-1");

    assert.equal(article.latestAudit?.recordId, "audit-legacy");
    assert.equal(article.latestAudit?.result.summary, "旧记录按草稿回退读取。");
    assert.equal(article.latestScore?.scoreId, "score-legacy");
    assert.equal(article.latestScore?.overall, 84);
  });

  it("withdraws an owned published article", async () => {
    const { service, calls } = createWithdrawService({
      id: "article-1",
      authorId: "user-1",
      draftId: "draft-1",
      status: ArticleStatus.Published,
    });

    const result = await service.withdrawArticle("user-1", "article-1");

    assert.deepEqual(result, {
      articleId: "article-1",
      draftId: "draft-1",
      status: ArticleStatus.Withdrawn,
      message: "文章已撤回，读者将无法继续访问。",
    });
    assert.deepEqual(calls.articleUpdates, [{ id: "article-1", status: ArticleStatus.Withdrawn }]);
    assert.deepEqual(calls.removedArticles, ["article-1"]);
  });

  it("rejects withdrawing another creator's article", async () => {
    const { service } = createWithdrawService({
      id: "article-1",
      authorId: "user-2",
      draftId: "draft-1",
      status: ArticleStatus.Published,
    });

    await assert.rejects(() => service.withdrawArticle("user-1", "article-1"), /Article not found/);
  });

  it("rejects withdrawing an already withdrawn article", async () => {
    const { service } = createWithdrawService({
      id: "article-1",
      authorId: "user-1",
      draftId: "draft-1",
      status: ArticleStatus.Withdrawn,
    });

    await assert.rejects(() => service.withdrawArticle("user-1", "article-1"), /Article already withdrawn/);
  });
});
