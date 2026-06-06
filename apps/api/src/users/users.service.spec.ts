import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ArticleStatus, DraftMode, DraftStatus, EngagementEventType } from "@bytecamp-aigc/shared";
import { UsersService } from "./users.service";

const user = {
  id: "user-1",
  nickname: "训练营创作者",
  avatarUrl: null,
};

const drafts = [
  {
    id: "draft-new",
    title: "最新草稿",
    status: DraftStatus.Draft,
    mode: DraftMode.Fast,
    version: 3,
    updatedAt: new Date("2026-06-06T11:00:00.000Z"),
    createdAt: new Date("2026-06-06T10:00:00.000Z"),
  },
  {
    id: "draft-old",
    title: "较早草稿",
    status: DraftStatus.Draft,
    mode: DraftMode.Fine,
    version: 1,
    updatedAt: new Date("2026-06-05T11:00:00.000Z"),
    createdAt: new Date("2026-06-05T10:00:00.000Z"),
  },
];

const articles = [
  {
    id: "article-owned",
    title: "AI 正在重塑内容创作",
    summary: "从选题、生成、编辑到审核发布，AI 创作工具正在变成完整工作流。",
    status: ArticleStatus.Published,
    publishedAt: new Date("2026-06-06T12:00:00.000Z"),
    updatedAt: new Date("2026-06-06T12:30:00.000Z"),
    scores: [{ overall: 86 }],
    events: [
      { type: EngagementEventType.View, value: 80 },
      { type: EngagementEventType.Like, value: 10 },
      { type: EngagementEventType.Favorite, value: 5 },
    ],
  },
  {
    id: "article-no-score",
    title: "还没有评分的作品",
    summary: "用于验证平均质量分不会把无评分作品计入分母。",
    status: ArticleStatus.Published,
    publishedAt: new Date("2026-06-05T12:00:00.000Z"),
    updatedAt: new Date("2026-06-05T12:30:00.000Z"),
    scores: [],
    events: [
      { type: EngagementEventType.View, value: 20 },
      { type: EngagementEventType.Like, value: 2 },
    ],
  },
];

function createService(options?: { empty?: boolean }) {
  const calls = {
    draftQueries: [] as Array<{ where?: unknown; orderBy?: unknown; take?: number }>,
    articleQueries: [] as Array<{ where?: unknown; orderBy?: unknown; take?: number }>,
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === user.id ? user : null),
    },
    draft: {
      count: async ({ where }: { where: { authorId: string } }) => (where.authorId === user.id && !options?.empty ? 2 : 0),
      findMany: async (query: { where?: unknown; orderBy?: unknown; take?: number }) => {
        calls.draftQueries.push(query);
        return options?.empty ? [] : drafts;
      },
    },
    article: {
      findMany: async (query: { where?: unknown; orderBy?: unknown; take?: number }) => {
        calls.articleQueries.push(query);
        return options?.empty ? [] : articles;
      },
    },
  };

  return {
    service: new UsersService(prisma as never),
    calls,
  };
}

describe("UsersService", () => {
  it("returns creator overview scoped to the current user", async () => {
    const { service, calls } = createService();

    const result = await service.getCreatorOverview("user-1");

    assert.deepEqual(result.user, user);
    assert.deepEqual(result.stats, {
      followers: 0,
      publishedArticles: 2,
      draftCount: 2,
      totalViews: 100,
      totalLikes: 12,
      totalFavorites: 5,
      averageQualityScore: 86,
    });
    assert.deepEqual(result.recentDrafts.map((draft) => draft.id), ["draft-new", "draft-old"]);
    assert.deepEqual(result.works.map((work) => work.id), ["article-owned", "article-no-score"]);
    assert.equal(result.works[0].qualityScore, 86);
    assert.deepEqual(result.works[0].engagement, {
      views: 80,
      likes: 10,
      favorites: 5,
    });
    assert.deepEqual(calls.draftQueries[0].where, { authorId: "user-1" });
    assert.deepEqual(calls.articleQueries[0].where, { authorId: "user-1" });
  });

  it("returns empty lists and zero stats for a creator without content", async () => {
    const { service } = createService({ empty: true });

    const result = await service.getCreatorOverview("user-1");

    assert.deepEqual(result.stats, {
      followers: 0,
      publishedArticles: 0,
      draftCount: 0,
      totalViews: 0,
      totalLikes: 0,
      totalFavorites: 0,
      averageQualityScore: 0,
    });
    assert.deepEqual(result.recentDrafts, []);
    assert.deepEqual(result.works, []);
  });
});
