import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { DraftMode, DraftStatus, type RichTextDocument } from "@bytecamp-aigc/shared";
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
    draftUpdates: [] as Array<{ title: string; body: RichTextDocument; version: { increment: number } }>,
    versionCreates: [] as Array<{ draftId: string; title: string; snapshot: RichTextDocument; version: number }>,
  };

  const tx = {
    draft: {
      findFirst: async () => draft,
      update: async ({ data }: { data: { title: string; body: unknown; version: { increment: number } } }) => {
        calls.draftUpdates.push({
          title: data.title,
          body: data.body as RichTextDocument,
          version: data.version,
        });

        return {
          ...draft,
          title: data.title,
          body: data.body,
          version: (draft?.version ?? 0) + data.version.increment,
          updatedAt: new Date("2026-06-04T10:20:00.000Z"),
        };
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
