import type { RichTextDocument } from "@bytecamp-aigc/shared";

export interface DraftOfflineState {
  title: string;
  body: RichTextDocument;
}

interface DraftOfflineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function buildDraftOfflineKey(draftId: string) {
  return `aigc_draft_offline_${draftId}`;
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
    return raw ? (JSON.parse(raw) as DraftOfflineState) : null;
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
