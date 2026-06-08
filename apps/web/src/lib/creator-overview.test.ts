import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ArticleStatus,
  CreatorContentStatus,
  CreatorContentType,
  type CreatorContentItem,
} from "@bytecamp-aigc/shared";
import {
  filterCreatorContents,
  formatCreatorMetric,
  getCreatorContentActions,
  getCreatorContentStatusLabel,
  getCreatorWorkStatusLabel,
  getEmptyCreatorStats,
  sortCreatorContentsByUpdatedTime,
  sortCreatorWorksByPublishedTime,
} from "./creator-overview.ts";

describe("creator overview helpers", () => {
  it("formats compact creator metrics", () => {
    assert.equal(formatCreatorMetric(0), "0");
    assert.equal(formatCreatorMetric(9999), "9999");
    assert.equal(formatCreatorMetric(12000), "1.2万");
    assert.equal(formatCreatorMetric(105000), "10.5万");
  });

  it("returns stable zero stats for empty creator data", () => {
    assert.deepEqual(getEmptyCreatorStats(), {
      followers: 0,
      publishedArticles: 0,
      draftCount: 0,
      totalViews: 0,
      totalLikes: 0,
      totalFavorites: 0,
      averageQualityScore: 0,
    });
  });

  it("maps creator work statuses to readable labels", () => {
    assert.equal(getCreatorWorkStatusLabel(ArticleStatus.Published), "已发布");
    assert.equal(getCreatorWorkStatusLabel(ArticleStatus.Withdrawn), "已撤回");
  });

  it("sorts works by publish time without mutating the original list", () => {
    const works = [
      { id: "old", publishedAt: "2026-06-05T10:00:00.000Z" },
      { id: "new", publishedAt: "2026-06-06T10:00:00.000Z" },
    ];

    const sorted = sortCreatorWorksByPublishedTime(works);

    assert.deepEqual(sorted.map((work) => work.id), ["new", "old"]);
    assert.deepEqual(works.map((work) => work.id), ["old", "new"]);
  });

  it("maps creator content statuses to readable labels", () => {
    assert.equal(getCreatorContentStatusLabel(CreatorContentStatus.Draft), "草稿");
    assert.equal(getCreatorContentStatusLabel(CreatorContentStatus.Published), "已发布");
    assert.equal(getCreatorContentStatusLabel(CreatorContentStatus.Withdrawn), "已撤回");
    assert.equal(getCreatorContentStatusLabel(CreatorContentStatus.NeedsRevision), "需修改");
  });

  it("filters creator contents by status", () => {
    const contents = createContents();

    assert.deepEqual(filterCreatorContents(contents, "all").map((item) => item.id), [
      "draft-1",
      "article-1",
      "article-2",
    ]);
    assert.deepEqual(filterCreatorContents(contents, "draft").map((item) => item.id), ["draft-1"]);
    assert.deepEqual(filterCreatorContents(contents, "published").map((item) => item.id), ["article-1"]);
    assert.deepEqual(filterCreatorContents(contents, "withdrawn").map((item) => item.id), ["article-2"]);
  });

  it("returns content actions by lifecycle status", () => {
    const [draft, published, withdrawn] = createContents();

    assert.deepEqual(getCreatorContentActions(draft).map((action) => action.kind), ["edit", "publish", "delete"]);
    assert.deepEqual(getCreatorContentActions(published).map((action) => action.kind), [
      "view",
      "edit",
      "withdraw",
      "delete",
    ]);
    assert.deepEqual(getCreatorContentActions(withdrawn).map((action) => action.kind), ["edit", "publish", "delete"]);
  });

  it("sorts contents by update time without mutating the original list", () => {
    const contents = createContents();

    const sorted = sortCreatorContentsByUpdatedTime(contents);

    assert.deepEqual(sorted.map((item) => item.id), ["article-2", "article-1", "draft-1"]);
    assert.deepEqual(contents.map((item) => item.id), ["draft-1", "article-1", "article-2"]);
  });
});

function createContents(): CreatorContentItem[] {
  return [
    {
      id: "draft-1",
      type: CreatorContentType.Draft,
      status: CreatorContentStatus.Draft,
      title: "草稿内容",
      summary: "v2",
      draftId: "draft-1",
      updatedAt: "2026-06-05T10:00:00.000Z",
    },
    {
      id: "article-1",
      type: CreatorContentType.Article,
      status: CreatorContentStatus.Published,
      title: "已发布内容",
      summary: "公开摘要",
      draftId: "draft-2",
      articleId: "article-1",
      updatedAt: "2026-06-06T10:00:00.000Z",
      publishedAt: "2026-06-06T09:00:00.000Z",
      qualityScore: 88,
      engagement: { views: 10, likes: 2, favorites: 1 },
    },
    {
      id: "article-2",
      type: CreatorContentType.Article,
      status: CreatorContentStatus.Withdrawn,
      title: "已撤回内容",
      summary: "撤回前摘要",
      draftId: "draft-3",
      articleId: "article-2",
      updatedAt: "2026-06-07T10:00:00.000Z",
      publishedAt: "2026-06-04T09:00:00.000Z",
      qualityScore: 76,
      engagement: { views: 7, likes: 1, favorites: 0 },
    },
  ];
}
