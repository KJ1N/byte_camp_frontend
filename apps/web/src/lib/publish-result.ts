export function getPublishedArticleHref(result: { status: string; articleId?: string }) {
  if (result.status !== "PUBLISHED" || !result.articleId) return null;
  return `/articles/${result.articleId}`;
}

export function isPublishArticleResponse(value: unknown): value is {
  articleId?: string;
  status: "PUBLISHED" | "BLOCKED" | "NEEDS_REVISION";
  message?: string;
} {
  if (!value || typeof value !== "object" || !("status" in value)) return false;
  const status = (value as { status?: unknown }).status;
  return status === "PUBLISHED" || status === "BLOCKED" || status === "NEEDS_REVISION";
}

export function normalizePublishDraftId(value: string | undefined) {
  const id = decodeURIComponent(value ?? "").trim();
  if (!id || id === ":id" || id === "[id]" || id.toLowerCase() === "undefined" || id.toLowerCase() === "null") {
    return null;
  }
  return id;
}
