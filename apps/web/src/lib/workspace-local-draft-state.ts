import type { GeneratedArticleDraft, RichTextDocument } from "@bytecamp-aigc/shared";

export interface WorkspaceLocalDraftState {
  topic: string;
  audience: string;
  style: string;
  selectedPromptId: string;
  draftTitle: string;
  generated: GeneratedArticleDraft | null;
  localUpdatedAt: string;
}

interface WorkspaceLocalDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const WORKSPACE_LOCAL_DRAFT_KEY = "aigc_workspace_local_draft";

export function createWorkspaceLocalDraftState(input: WorkspaceLocalDraftState): WorkspaceLocalDraftState {
  return {
    topic: input.topic,
    audience: input.audience,
    style: input.style,
    selectedPromptId: input.selectedPromptId,
    draftTitle: input.draftTitle,
    generated: input.generated,
    localUpdatedAt: input.localUpdatedAt,
  };
}

export function writeWorkspaceLocalDraftState(
  storage: WorkspaceLocalDraftStorage,
  state: WorkspaceLocalDraftState,
) {
  try {
    storage.setItem(WORKSPACE_LOCAL_DRAFT_KEY, JSON.stringify(state));
  } catch {
    // The editor should remain usable when localStorage is disabled or full.
  }
}

export function readWorkspaceLocalDraftState(storage: WorkspaceLocalDraftStorage): WorkspaceLocalDraftState | null {
  try {
    const raw = storage.getItem(WORKSPACE_LOCAL_DRAFT_KEY);
    return raw ? normalizeWorkspaceLocalDraftState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearWorkspaceLocalDraftState(storage: WorkspaceLocalDraftStorage) {
  try {
    storage.removeItem(WORKSPACE_LOCAL_DRAFT_KEY);
  } catch {
    // The server save has already succeeded; failed local cleanup should not block navigation.
  }
}

function normalizeWorkspaceLocalDraftState(value: unknown): WorkspaceLocalDraftState | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<WorkspaceLocalDraftState>;
  if (
    typeof record.topic !== "string" ||
    typeof record.audience !== "string" ||
    typeof record.style !== "string" ||
    typeof record.selectedPromptId !== "string" ||
    typeof record.draftTitle !== "string"
  ) {
    return null;
  }

  const generated = record.generated === null ? null : normalizeGeneratedArticleDraft(record.generated);
  if (record.generated !== null && !generated) return null;

  return {
    topic: record.topic,
    audience: record.audience,
    style: record.style,
    selectedPromptId: record.selectedPromptId,
    draftTitle: record.draftTitle,
    generated,
    localUpdatedAt: typeof record.localUpdatedAt === "string" ? record.localUpdatedAt : "",
  };
}

function normalizeGeneratedArticleDraft(value: unknown): GeneratedArticleDraft | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<GeneratedArticleDraft>;
  if (
    typeof record.model !== "string" ||
    typeof record.title !== "string" ||
    !Array.isArray(record.outline) ||
    typeof record.bodyText !== "string" ||
    !isRichTextDocument(record.body)
  ) {
    return null;
  }

  return {
    model: record.model,
    title: record.title,
    outline: record.outline.filter((item): item is string => typeof item === "string"),
    bodyText: record.bodyText,
    body: record.body,
  };
}

function isRichTextDocument(value: unknown): value is RichTextDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "doc" &&
      Array.isArray((value as { content?: unknown }).content),
  );
}
