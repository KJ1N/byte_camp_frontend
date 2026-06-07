import type { RichTextDocument } from "@bytecamp-aigc/shared";

export type DraftOfflineSaveReason = "offline" | "save_failed" | "sync_failed";

export interface DraftOfflineState {
  draftId: string;
  title: string;
  body: RichTextDocument;
  baseVersion: number | null;
  serverUpdatedAt: string | null;
  localUpdatedAt: string;
  reason: DraftOfflineSaveReason;
}

interface DraftOfflineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function buildDraftOfflineKey(draftId: string) {
  return `aigc_draft_offline_${draftId}`;
}

export function createDraftOfflineState(input: DraftOfflineState): DraftOfflineState {
  return {
    draftId: input.draftId,
    title: input.title,
    body: input.body,
    baseVersion: input.baseVersion,
    serverUpdatedAt: input.serverUpdatedAt,
    localUpdatedAt: input.localUpdatedAt,
    reason: input.reason,
  };
}

export function writeDraftOfflineState(storage: DraftOfflineStorage, draftId: string, state: DraftOfflineState) {
  try {
    storage.setItem(buildDraftOfflineKey(draftId), JSON.stringify(state));
  } catch {
    // localStorage can be disabled; server saves should remain the source of truth.
  }
}

export function readDraftOfflineState(storage: DraftOfflineStorage, draftId: string): DraftOfflineState | null {
  try {
    const raw = storage.getItem(buildDraftOfflineKey(draftId));
    return raw ? normalizeDraftOfflineState(JSON.parse(raw), draftId) : null;
  } catch {
    return null;
  }
}

export function clearDraftOfflineState(storage: DraftOfflineStorage, draftId: string) {
  try {
    storage.removeItem(buildDraftOfflineKey(draftId));
  } catch {
    // localStorage can be disabled; the page should keep working.
  }
}

export function isDraftOfflineConflict(
  state: DraftOfflineState,
  current: { version: number; updatedAt: string },
) {
  if (state.baseVersion === null || state.serverUpdatedAt === null) return true;
  if (state.baseVersion < current.version) return true;
  return state.serverUpdatedAt !== current.updatedAt;
}

export function getDraftOfflineStatusText(state: DraftOfflineState) {
  if (state.reason === "offline") return "离线编辑内容已暂存到本地，恢复网络后会尝试同步。";
  if (state.reason === "sync_failed") return "本地内容同步失败，已继续保存在本地。";
  return "保存失败的内容已暂存到本地，可以稍后重试同步。";
}

function normalizeDraftOfflineState(value: unknown, draftId: string): DraftOfflineState | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<DraftOfflineState>;
  if (typeof record.title !== "string" || !isRichTextDocument(record.body)) return null;

  return {
    draftId: typeof record.draftId === "string" ? record.draftId : draftId,
    title: record.title,
    body: record.body,
    baseVersion: typeof record.baseVersion === "number" ? record.baseVersion : null,
    serverUpdatedAt: typeof record.serverUpdatedAt === "string" ? record.serverUpdatedAt : null,
    localUpdatedAt: typeof record.localUpdatedAt === "string" ? record.localUpdatedAt : "",
    reason: isDraftOfflineSaveReason(record.reason) ? record.reason : "save_failed",
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

function isDraftOfflineSaveReason(value: unknown): value is DraftOfflineSaveReason {
  return value === "offline" || value === "save_failed" || value === "sync_failed";
}
