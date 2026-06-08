import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ArticleStatus,
  DraftMode,
  DraftStatus,
  type CreateDraftInput,
  type DeleteDraftResponse,
  type DraftDetail,
  type DraftSummary,
  type DraftVersionSummary,
  type RichTextDocument,
  type RestoreDraftVersionInput,
  type RestoreDraftVersionResponse,
  type UpdateDraftInput,
} from "@bytecamp-aigc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RankingCacheService } from "../ranking/ranking-cache.service";

@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingCacheService?: RankingCacheService,
  ) {}

  async createDraft(authorId: string, input: CreateDraftInput): Promise<DraftDetail> {
    const title = this.ensureTitle(input.title);
    const body = this.ensureRichTextDocument(input.body);
    const mode = input.mode ?? DraftMode.Fast;

    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.draft.create({
        data: {
          authorId,
          mode,
          title,
          body: body as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.draftVersion.create({
        data: {
          draftId: draft.id,
          title,
          snapshot: body as unknown as Prisma.InputJsonValue,
          version: draft.version,
        },
      });

      return this.mapDraftDetail(draft);
    });
  }

  async listMine(authorId: string): Promise<DraftSummary[]> {
    const drafts = await this.prisma.draft.findMany({
      where: { authorId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return drafts.map((draft) => this.mapDraftSummary(draft));
  }

  async getMineById(authorId: string, id: string): Promise<DraftDetail> {
    const draft = await this.prisma.draft.findFirst({
      where: { id, authorId },
    });

    if (!draft) throw new NotFoundException("Draft not found");
    return this.mapDraftDetail(draft);
  }

  async updateDraft(authorId: string, id: string, input: UpdateDraftInput): Promise<DraftDetail> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.draft.findFirst({
        where: { id, authorId },
      });

      if (!existing) throw new NotFoundException("Draft not found");

      const title = input.title === undefined ? existing.title : this.ensureTitle(input.title);
      const body =
        input.body === undefined
          ? (existing.body as unknown as RichTextDocument)
          : this.ensureRichTextDocument(input.body);

      const draft = await tx.draft.update({
        where: { id: existing.id },
        data: {
          title,
          body: body as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });

      await tx.draftVersion.create({
        data: {
          draftId: draft.id,
          title,
          snapshot: body as unknown as Prisma.InputJsonValue,
          version: draft.version,
        },
      });

      return this.mapDraftDetail(draft);
    });
  }

  async listVersions(authorId: string, draftId: string): Promise<DraftVersionSummary[]> {
    const draft = await this.prisma.draft.findFirst({
      where: { id: draftId, authorId },
      select: { id: true },
    });

    if (!draft) throw new NotFoundException("Draft not found");

    const versions = await this.prisma.draftVersion.findMany({
      where: { draftId },
      orderBy: { version: "desc" },
      take: 20,
    });

    return versions.map((version) => ({
      id: version.id,
      draftId: version.draftId,
      title: version.title,
      snapshot: version.snapshot as unknown as RichTextDocument,
      version: version.version,
      createdAt: version.createdAt.toISOString(),
    }));
  }

  async restoreVersion(
    authorId: string,
    id: string,
    input: RestoreDraftVersionInput,
  ): Promise<RestoreDraftVersionResponse> {
    if (!input.versionId?.trim()) throw new BadRequestException("Version id is required");

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.draft.findFirst({
        where: { id, authorId },
      });

      if (!existing) throw new NotFoundException("Draft not found");
      if (existing.status === DraftStatus.Published) {
        throw new ConflictException("Published drafts cannot be restored directly");
      }

      const version = await tx.draftVersion.findFirst({
        where: {
          id: input.versionId,
          draftId: existing.id,
        },
      });

      if (!version) throw new NotFoundException("Draft version not found");

      const snapshot = this.ensureRichTextDocument(version.snapshot);
      const draft = await tx.draft.update({
        where: { id: existing.id },
        data: {
          title: version.title,
          body: snapshot as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });

      await tx.draftVersion.create({
        data: {
          draftId: draft.id,
          title: draft.title,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          version: draft.version,
        },
      });

      return {
        ...this.mapDraftDetail(draft),
        restoredFromVersion: version.version,
      };
    });
  }

  async deleteDraft(authorId: string, id: string): Promise<DeleteDraftResponse> {
    const draft = await this.prisma.draft.findFirst({
      where: { id, authorId },
      select: { id: true },
    });

    if (!draft) throw new NotFoundException("Draft not found");

    const linkedArticles = await this.prisma.article.findMany({
      where: { draftId: draft.id, authorId },
      select: { id: true, status: true },
    });

    await this.prisma.draft.delete({
      where: { id: draft.id },
    });

    await Promise.all(
      linkedArticles
        .filter((article) => article.status === ArticleStatus.Published)
        .map((article) => this.rankingCacheService?.removeArticle(article.id)),
    );

    return {
      draftId: draft.id,
      deletedArticleIds: linkedArticles.map((article) => article.id),
      message: "Draft deleted successfully.",
    };
  }

  private ensureTitle(value: string) {
    const title = value?.trim();
    if (!title) throw new BadRequestException("Title is required");
    if (title.length > 80) throw new BadRequestException("Title must be 80 characters or fewer");
    return title;
  }

  private ensureRichTextDocument(value: unknown): RichTextDocument {
    if (
      value &&
      typeof value === "object" &&
      "type" in value &&
      value.type === "doc" &&
      "content" in value &&
      Array.isArray(value.content)
    ) {
      return value as RichTextDocument;
    }

    throw new BadRequestException("Body must be a ProseMirror document");
  }

  private mapDraftSummary(draft: {
    id: string;
    title: string;
    status: string;
    mode: string;
    version: number;
    updatedAt: Date;
    createdAt: Date;
  }): DraftSummary {
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

  private mapDraftDetail(draft: {
    id: string;
    title: string;
    body: Prisma.JsonValue;
    status: string;
    mode: string;
    version: number;
    updatedAt: Date;
    createdAt: Date;
  }): DraftDetail {
    return {
      ...this.mapDraftSummary(draft),
      body: draft.body as unknown as RichTextDocument,
    };
  }
}
