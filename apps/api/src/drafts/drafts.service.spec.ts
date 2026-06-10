import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { ArticleStatus, DraftMode, DraftStatus, type RichTextDocument } from "@bytecamp-aigc/shared";
import { DraftsService } from "./drafts.service";

const currentBody: RichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "当前草稿内容。" }] }],
};

const restoredBody: RichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "历史版本内容。" }] }],
};

function createDraft(status = DraftStatus.Draft) {
  return {
    id: "draft-1",
    authorId: "user-1",
    mode: DraftMode.Fast,
    status,
    title: "当前标题",
    body: currentBody,
    version: 4,
    reviewStatus: "REVIEWED",
    reviewedVersion: 4,
    reviewAuditRecordId: "audit-4",
    reviewScoreId: "score-4",
    createdAt: new Date("2026-06-04T10:00:00.000Z"),
    updatedAt: new Date("2026-06-04T10:10:00.000Z"),
  };
}

function createVersion(draftId = "draft-1") {
  return {
    id: "version-2",
    draftId,
    title: "历史标题",
    snapshot: restoredBody,
    version: 2,
    createdAt: new Date("2026-06-04T10:05:00.000Z"),
  };
}

function createService(options: { draft?: ReturnType<typeof createDraft> | null; version?: ReturnType<typeof createVersion> | null } = {}) {
  const draft = options.draft === undefined ? createDraft() : options.draft;
  const version = options.version === undefined ? createVersion() : options.version;
  const calls = {
    draftUpdates: [] as Array<{
      title: string;
      body: RichTextDocument;
      version: { increment: number };
      reviewStatus: string;
      reviewedVersion: null;
      reviewAuditRecordId: null;
      reviewScoreId: null;
    }>,
    versionCreates: [] as Array<{ draftId: string; title: string; snapshot: RichTextDocument; version: number }>,
    draftDeletes: [] as string[],
  };

  const tx = {
    draft: {
      findFirst: async () => draft,
      update: async ({
        data,
      }: {
        data: {
          title: string;
          body: unknown;
          version: { increment: number };
          reviewStatus: string;
          reviewedVersion: null;
          reviewAuditRecordId: null;
          reviewScoreId: null;
        };
      }) => {
        calls.draftUpdates.push({
          title: data.title,
          body: data.body as RichTextDocument,
          version: data.version,
          reviewStatus: data.reviewStatus,
          reviewedVersion: data.reviewedVersion,
          reviewAuditRecordId: data.reviewAuditRecordId,
          reviewScoreId: data.reviewScoreId,
        });

        return {
          ...draft,
          title: data.title,
          body: data.body,
          version: (draft?.version ?? 0) + data.version.increment,
          reviewStatus: data.reviewStatus,
          reviewedVersion: data.reviewedVersion,
          reviewAuditRecordId: data.reviewAuditRecordId,
          reviewScoreId: data.reviewScoreId,
          updatedAt: new Date("2026-06-04T10:20:00.000Z"),
        };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        calls.draftDeletes.push(where.id);
        return draft;
      },
    },
    draftVersion: {
      findFirst: async () => version,
      create: async ({ data }: { data: { draftId: string; title: string; snapshot: unknown; version: number } }) => {
        calls.versionCreates.push({
          draftId: data.draftId,
          title: data.title,
          snapshot: data.snapshot as RichTextDocument,
          version: data.version,
        });
        return { id: "version-5", createdAt: new Date("2026-06-04T10:20:00.000Z"), ...data };
      },
    },
  };

  const prisma = {
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
  };

  return {
    service: new DraftsService(prisma as never),
    calls,
  };
}

describe("DraftsService.restoreVersion", () => {
  it("restores an owned draft from one of its historical versions", async () => {
    const { service, calls } = createService();

    const result = await service.restoreVersion("user-1", "draft-1", { versionId: "version-2" });

    assert.equal(result.id, "draft-1");
    assert.equal(result.title, "历史标题");
    assert.deepEqual(result.body, restoredBody);
    assert.equal(result.version, 5);
    assert.equal(result.restoredFromVersion, 2);
    assert.deepEqual(calls.draftUpdates, [
      {
        title: "历史标题",
        body: restoredBody,
        version: { increment: 1 },
        reviewStatus: "NEEDS_REVIEW",
        reviewedVersion: null,
        reviewAuditRecordId: null,
        reviewScoreId: null,
      },
    ]);
    assert.deepEqual(calls.versionCreates, [
      {
        draftId: "draft-1",
        title: "历史标题",
        snapshot: restoredBody,
        version: 5,
      },
    ]);
  });

  it("invalidates the reviewed tag when the draft content is saved", async () => {
    const { service, calls } = createService();

    const result = await service.updateDraft("user-1", "draft-1", {
      title: "修改后的标题",
      body: restoredBody,
    });

    assert.equal(result.version, 5);
    assert.equal(calls.draftUpdates[0].reviewStatus, "NEEDS_REVIEW");
    assert.equal(calls.draftUpdates[0].reviewedVersion, null);
    assert.equal(calls.draftUpdates[0].reviewAuditRecordId, null);
    assert.equal(calls.draftUpdates[0].reviewScoreId, null);
  });

  it("rejects restoring a draft that does not belong to the current user", async () => {
    const { service } = createService({ draft: null });

    await assert.rejects(
      () => service.restoreVersion("user-2", "draft-1", { versionId: "version-2" }),
      NotFoundException,
    );
  });

  it("rejects restoring a version from another draft", async () => {
    const { service } = createService({ version: null });

    await assert.rejects(
      () => service.restoreVersion("user-1", "draft-1", { versionId: "version-2" }),
      NotFoundException,
    );
  });

  it("rejects restoring an already published draft", async () => {
    const { service } = createService({ draft: createDraft(DraftStatus.Published) });

    await assert.rejects(
      () => service.restoreVersion("user-1", "draft-1", { versionId: "version-2" }),
      ConflictException,
    );
  });
});

function createDeleteService(
  options: {
    draft?: ReturnType<typeof createDraft> | null;
    articles?: Array<{ id: string; status: ArticleStatus }>;
  } = {},
) {
  const draft = options.draft === undefined ? createDraft() : options.draft;
  const articles = options.articles ?? [];
  const calls = {
    draftDeletes: [] as string[],
    removedArticles: [] as string[],
  };

  const prisma = {
    draft: {
      findFirst: async () => draft,
      delete: async ({ where }: { where: { id: string } }) => {
        calls.draftDeletes.push(where.id);
        return draft;
      },
    },
    article: {
      findMany: async () => articles,
    },
  };

  return {
    service: new DraftsService(prisma as never, {
      removeArticle: async (articleId: string) => {
        calls.removedArticles.push(articleId);
        return true;
      },
    } as never),
    calls,
  };
}

describe("DraftsService.deleteDraft", () => {
  it("deletes an owned draft and removes linked published articles from rankings", async () => {
    const { service, calls } = createDeleteService({
      articles: [
        { id: "article-1", status: ArticleStatus.Published },
        { id: "article-2", status: ArticleStatus.Withdrawn },
      ],
    });

    const result = await service.deleteDraft("user-1", "draft-1");

    assert.deepEqual(result, {
      draftId: "draft-1",
      deletedArticleIds: ["article-1", "article-2"],
      message: "Draft deleted successfully.",
    });
    assert.deepEqual(calls.draftDeletes, ["draft-1"]);
    assert.deepEqual(calls.removedArticles, ["article-1"]);
  });

  it("rejects deleting another user's draft", async () => {
    const { service } = createDeleteService({ draft: null });

    await assert.rejects(() => service.deleteDraft("user-2", "draft-1"), NotFoundException);
  });
});
