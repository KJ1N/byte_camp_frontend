import { ArticleStatus, type CreatorOverviewStats } from "@bytecamp-aigc/shared";

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
