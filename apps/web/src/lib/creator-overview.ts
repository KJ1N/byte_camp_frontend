import {
  ArticleStatus,
  CreatorContentStatus,
  type CreatorContentItem,
  type CreatorOverviewStats,
} from "@bytecamp-aigc/shared";

export type CreatorContentFilter = "all" | "draft" | "published" | "withdrawn";

export type CreatorContentActionKind = "view" | "edit" | "publish" | "withdraw" | "delete";

export interface CreatorContentAction {
  kind: CreatorContentActionKind;
  label: string;
}

export function getEmptyCreatorStats(): CreatorOverviewStats {
  return {
    followers: 0,
    publishedArticles: 0,
    draftCount: 0,
    totalViews: 0,
    totalLikes: 0,
    totalFavorites: 0,
    averageQualityScore: 0,
  };
}

export function formatCreatorMetric(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const normalized = Math.trunc(value);
  if (normalized < 10000) return String(normalized);
  return `${(Math.round((normalized / 10000) * 10) / 10).toFixed(1).replace(/\.0$/, "")}万`;
}

export function getCreatorWorkStatusLabel(status: ArticleStatus) {
  if (status === ArticleStatus.Withdrawn) return "已撤回";
  return "已发布";
}

export function sortCreatorWorksByPublishedTime<T extends { publishedAt: string }>(works: T[]) {
  return [...works].sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

export function getCreatorContentStatusLabel(status: CreatorContentStatus) {
  if (status === CreatorContentStatus.Published) return "已发布";
  if (status === CreatorContentStatus.Withdrawn) return "已撤回";
  if (status === CreatorContentStatus.NeedsRevision) return "需修改";
  return "草稿";
}

export function filterCreatorContents(contents: CreatorContentItem[], filter: CreatorContentFilter) {
  if (filter === "draft") {
    return contents.filter((item) => item.status === CreatorContentStatus.Draft);
  }
  if (filter === "published") {
    return contents.filter((item) => item.status === CreatorContentStatus.Published);
  }
  if (filter === "withdrawn") {
    return contents.filter((item) => item.status === CreatorContentStatus.Withdrawn);
  }
  return contents;
}

export function getCreatorContentActions(content: CreatorContentItem): CreatorContentAction[] {
  if (content.status === CreatorContentStatus.Published) {
    return [
      { kind: "view", label: "查看详情" },
      { kind: "edit", label: "继续编辑" },
      { kind: "withdraw", label: "撤回" },
      { kind: "delete", label: "删除" },
    ];
  }

  return [
    { kind: "edit", label: "继续编辑" },
    { kind: "publish", label: content.status === CreatorContentStatus.Withdrawn ? "重新发布" : "去发布" },
    { kind: "delete", label: "删除" },
  ];
}

export function sortCreatorContentsByUpdatedTime<T extends { updatedAt: string }>(contents: T[]) {
  return [...contents].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}
