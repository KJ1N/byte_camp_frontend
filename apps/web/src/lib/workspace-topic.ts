const MAX_TOPIC_LENGTH = 80;

export function normalizeWorkspaceTopic(value: string | null | undefined) {
  const topic = value?.trim();
  if (!topic) return null;
  return topic.slice(0, MAX_TOPIC_LENGTH);
}

export function buildWorkspaceTopicHref(topic: string | null | undefined) {
  const normalized = normalizeWorkspaceTopic(topic);
  if (!normalized) return "/workspace";

  const params = new URLSearchParams({ topic: normalized });
  return `/workspace?${params.toString()}`;
}
