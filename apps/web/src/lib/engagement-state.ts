import type { EngagementEventType } from "@bytecamp-aigc/shared";

interface EngagementStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function buildEngagementKey(articleId: string, type: EngagementEventType) {
  return `aigc_creator_engagement_${articleId}_${type}`;
}

export function hasRecordedEngagement(storage: EngagementStorage, articleId: string, type: EngagementEventType) {
  try {
    return storage.getItem(buildEngagementKey(articleId, type)) === "1";
  } catch {
    return false;
  }
}

export function markEngagementRecorded(storage: EngagementStorage, articleId: string, type: EngagementEventType) {
  try {
    storage.setItem(buildEngagementKey(articleId, type), "1");
  } catch {
    // localStorage may be disabled; interaction should still leave the page usable.
  }
}

export function shouldRecordArticleView(recordedArticleId: string | null, nextArticleId: string) {
  return recordedArticleId !== nextArticleId;
}

export function buildArticleViewIntentKey(articleId: string) {
  return `aigc_creator_view_intent_${articleId}`;
}

export function markArticleViewIntent(storage: EngagementStorage, articleId: string) {
  try {
    storage.setItem(buildArticleViewIntentKey(articleId), "1");
  } catch {
    // sessionStorage may be disabled; the detail page can still be read.
  }
}

export function consumeArticleViewIntent(storage: EngagementStorage, articleId: string) {
  const key = buildArticleViewIntentKey(articleId);

  try {
    if (storage.getItem(key) !== "1") return false;
    storage.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}
