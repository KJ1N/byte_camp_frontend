import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ArticleStatus, AuditDecision, DraftMode, DraftStatus, type RichTextDocument } from "@bytecamp-aigc/shared";
import { AuditService } from "../audit/audit.service";
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

function createDraft(body: RichTextDocument, title = "AI 如何改变内容创作") {
  return {
    id: "draft-1",
    authorId: "user-1",
    mode: DraftMode.Fast,
    status: DraftStatus.Draft,
    title,
    body,
    version: 1,
    createdAt: new Date("2026-06-04T10:00:00.000Z"),
    updatedAt: new Date("2026-06-04T10:00:00.000Z"),
  };
}

function createService(
  body: RichTextDocument,
  options: { existingArticleId?: string; draftTitle?: string } = {},
) {
  const draft = createDraft(body, options.draftTitle);
  const calls = {
    auditRecords: [] as Array<{ decision: AuditDecision }>,
    auditRecordArticleLinks: [] as Array<{ id: string; articleId: string }>,
    qualityScores: [] as Array<{ overall: number }>,
    qualityScoreArticleLinks: [] as Array<{ id: string; articleId: string }>,
    articles: [] as Array<{ title: string; summary: string }>,
    articleUpdates: [] as Array<{ id: string; title: string; body: RichTextDocument; summary: string }>,
    revisions: [] as Array<{ title: string; body: RichTextDocument; reason?: string }>,
    draftUpdates: [] as Array<{ status: DraftStatus }>,
  };

  const tx = {
    draft: {
      findFirst: async () => draft,
      update: async ({ data }: { data: { status: DraftStatus } }) => {
        calls.draftUpdates.push({ status: data.status });
        return { ...draft, status: data.status };
      },
    },
    auditRecord: {
      create: async ({ data }: { data: { decision: AuditDecision } }) => {
        calls.auditRecords.push({ decision: data.decision });
        return {
          id: `audit-${calls.auditRecords.length}`,
          createdAt: new Date("2026-06-04T10:00:00.000Z"),
          ...data,
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: { articleId: string } }) => {
        calls.auditRecordArticleLinks.push({ id: where.id, articleId: data.articleId });
        return { id: where.id, createdAt: new Date("2026-06-04T10:00:00.000Z"), ...data };
      },
    },
    qualityScore: {
      create: async ({ data }: { data: { overall: number } }) => {
        calls.qualityScores.push({ overall: data.overall });
        return {
          id: `score-${calls.qualityScores.length}`,
          createdAt: new Date("2026-06-04T10:00:00.000Z"),
          ...data,
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: { articleId: string } }) => {
        calls.qualityScoreArticleLinks.push({ id: where.id, articleId: data.articleId });
        return { id: where.id, createdAt: new Date("2026-06-04T10:00:00.000Z"), ...data };
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
        data: { title: string; body: unknown; summary: string };
      }) => {
        calls.articleUpdates.push({
          id: where.id,
          title: data.title,
          body: data.body as RichTextDocument,
          summary: data.summary,
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
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
  };

  return {
    service: new PublishService(prisma as never, new AuditService(), new ScoringService()),
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

  return new PublishService(prisma as never, new AuditService(), new ScoringService());
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

  return new PublishService(prisma as never, new AuditService(), new ScoringService());
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

    const result = await service.publishDraft("user-1", "draft-1");

    assert.equal(result.status, "NEEDS_REVISION");
    assert.equal(result.articleId, undefined);
    assert.equal(result.audit.result.decision, AuditDecision.Warn);
    assert.equal(calls.articles.length, 0);
    assert.equal(calls.revisions.length, 0);
    assert.equal(calls.draftUpdates.length, 0);
  });

  it("blocks high-risk drafts without creating an article", async () => {
    const { service, calls } = createService(blockBody);

    const result = await service.publishDraft("user-1", "draft-1");

    assert.equal(result.status, "BLOCKED");
    assert.equal(result.articleId, undefined);
    assert.equal(result.audit.result.decision, AuditDecision.Block);
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
});
