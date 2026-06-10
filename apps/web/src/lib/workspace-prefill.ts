import type { DailyNewsItem, GeneratedArticleDraft, RichTextDocument } from "@bytecamp-aigc/shared";
import { replaceWithPlainText } from "./rich-text-document.ts";
import { normalizeWorkspaceTopic } from "./workspace-topic.ts";

export const WORKSPACE_PREFILL_KEY = "aigc_workspace_prefill";
const MAX_BODY_TEXT_LENGTH = 5_000;

export interface WorkspacePrefillState {
  source: "creator-news";
  topic: string;
  audience: string;
  style: string;
  draftTitle: string;
  generated: GeneratedArticleDraft;
  createdAt: string;
}

interface WorkspacePrefillStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createWorkspacePrefillFromDailyNews(
  item: DailyNewsItem,
  createdAt = new Date().toISOString(),
): WorkspacePrefillState {
  const title = normalizeTitle(item.title);
  const bodyText = normalizeBodyText(item);

  return {
    source: "creator-news",
    topic: normalizeWorkspaceTopic(title) ?? title,
    audience: "内容创作者",
    style: "新闻",
    draftTitle: title,
    generated: {
      model: "creator-news-prefill",
      title,
      outline: [
        "梳理资讯核心事实",
        "补充背景、影响和读者关切",
        "形成理性观点和发布建议",
      ],
      bodyText,
      body: replaceWithPlainText(bodyText),
    },
    createdAt,
  };
}

export function writeWorkspacePrefillState(storage: WorkspacePrefillStorage, state: WorkspacePrefillState) {
  try {
    storage.setItem(WORKSPACE_PREFILL_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function readWorkspacePrefillState(storage: WorkspacePrefillStorage): WorkspacePrefillState | null {
  try {
    const raw = storage.getItem(WORKSPACE_PREFILL_KEY);
    return raw ? normalizeWorkspacePrefillState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearWorkspacePrefillState(storage: WorkspacePrefillStorage) {
  try {
    storage.removeItem(WORKSPACE_PREFILL_KEY);
  } catch {
    // Failed cleanup should not block the workspace from opening.
  }
}

function normalizeWorkspacePrefillState(value: unknown): WorkspacePrefillState | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<WorkspacePrefillState>;
  if (
    record.source !== "creator-news" ||
    typeof record.topic !== "string" ||
    typeof record.audience !== "string" ||
    typeof record.style !== "string" ||
    typeof record.draftTitle !== "string" ||
    typeof record.createdAt !== "string" ||
    !isGeneratedArticleDraft(record.generated)
  ) {
    return null;
  }

  return {
    source: "creator-news",
    topic: record.topic,
    audience: record.audience,
    style: record.style,
    draftTitle: record.draftTitle,
    generated: record.generated,
    createdAt: record.createdAt,
  };
}

function isGeneratedArticleDraft(value: unknown): value is GeneratedArticleDraft {
  if (!value || typeof value !== "object") return false;

  const record = value as Partial<GeneratedArticleDraft>;
  return Boolean(
    typeof record.model === "string" &&
      typeof record.title === "string" &&
      Array.isArray(record.outline) &&
      record.outline.every((item) => typeof item === "string") &&
      typeof record.bodyText === "string" &&
      isRichTextDocument(record.body),
  );
}

function isRichTextDocument(value: unknown): value is RichTextDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "doc" &&
      Array.isArray((value as { content?: unknown }).content),
  );
}

function normalizeTitle(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  return normalized || "每日资讯选题";
}

function normalizeBodyText(item: DailyNewsItem) {
  const blocks = [
    item.content,
    item.content.includes(item.source) ? "" : `来源：${item.source}`,
    item.content.includes(item.date) ? "" : `日期：${item.date}`,
    item.url && !item.content.includes(item.url) ? `原文链接：${item.url}` : "",
  ]
    .map((block) => block.trim())
    .filter(Boolean);

  const bodyText = blocks.join("\n\n") || item.summary || item.title;
  if (bodyText.length <= MAX_BODY_TEXT_LENGTH) return bodyText;
  return `${bodyText.slice(0, MAX_BODY_TEXT_LENGTH - 1)}…`;
}
