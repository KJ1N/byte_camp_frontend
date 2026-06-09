"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import type { DraftSummary } from "@bytecamp-aigc/shared";

import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { createAiSseParser, mergeTitleCandidate } from "@/lib/ai-stream";

const rewriteModes = [
  { value: "POLISH", label: "润色" },
  { value: "EXPAND", label: "扩写" },
  { value: "SHORTEN", label: "缩写" },
  { value: "CHANGE_STYLE", label: "换风格" },
] as const;

type RewriteModeValue = (typeof rewriteModes)[number]["value"];
type StreamStatus = "idle" | "streaming" | "error";

interface AiWritingAssistantProps {
  authToken: string | null;
  topic: string;
  audience: string;
  style: string;
  currentTitle: string;
  bodyText: string;
  previewTitle?: string;
  previewBodyText?: string;
  recentDrafts?: DraftSummary[];
  leadingContent?: ReactNode;
  footer?: ReactNode;
  onSelectTitle: (title: string) => void;
  onReplaceBody: (text: string) => void;
  onAppendBody?: (text: string) => void;
  onOpenDraft?: (draftId: string) => void;
}

export function AiWritingAssistant({
  authToken,
  topic,
  audience,
  style,
  currentTitle,
  bodyText,
  previewTitle,
  previewBodyText,
  recentDrafts = [],
  leadingContent,
  footer,
  onSelectTitle,
  onReplaceBody,
  onAppendBody,
  onOpenDraft,
}: AiWritingAssistantProps) {
  const [titleStatus, setTitleStatus] = useState<StreamStatus>("idle");
  const [rewriteStatus, setRewriteStatus] = useState<StreamStatus>("idle");
  const [titleCandidates, setTitleCandidates] = useState<string[]>([]);
  const [rewriteMode, setRewriteMode] = useState<RewriteModeValue>("POLISH");
  const [rewriteInput, setRewriteInput] = useState("");
  const [rewriteResult, setRewriteResult] = useState("");
  const [rewriteSuggestions, setRewriteSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function optimizeTitles() {
    if (!authToken || titleStatus === "streaming") return;

    setTitleStatus("streaming");
    setTitleCandidates([]);
    setError("");

    try {
      await streamRequest("/ai/optimize-titles/stream", authToken, {
        topic,
        audience,
        style,
        currentTitle,
        bodyText,
      }, (eventName, data) => {
        if (eventName === "title" && isRecord(data) && typeof data.text === "string") {
          setTitleCandidates((items) =>
            mergeTitleCandidate(items, {
              text: data.text as string,
              index: typeof data.index === "number" ? data.index : undefined,
            }),
          );
        }
      });
      setTitleStatus("idle");
    } catch (streamError) {
      setTitleStatus("error");
      setError(streamError instanceof Error ? streamError.message : "标题优化失败，请稍后重试。");
    }
  }

  async function rewriteText() {
    if (!authToken || rewriteStatus === "streaming") return;
    const text = rewriteInput.trim() || bodyText.slice(0, 800).trim();
    if (!text) {
      setError("请先输入需要改写的正文片段。");
      return;
    }

    setRewriteStatus("streaming");
    setRewriteInput(text);
    setRewriteResult("");
    setRewriteSuggestions([]);
    setError("");

    let nextResult = "";

    try {
      await streamRequest("/ai/rewrite/stream", authToken, {
        text,
        mode: rewriteMode,
        targetStyle: style,
        topic,
        audience,
      }, (eventName, data) => {
        if (eventName === "text-delta" && isRecord(data) && typeof data.text === "string") {
          nextResult += data.text;
          setRewriteResult(nextResult);
          return;
        }

        if (eventName === "suggestion" && isRecord(data) && typeof data.text === "string") {
          setRewriteSuggestions((items) => [...items, data.text as string]);
          return;
        }

        if (eventName === "done" && isRecord(data)) {
          if (typeof data.text === "string") {
            nextResult = data.text;
            setRewriteResult(data.text);
          }
          if (Array.isArray(data.suggestions)) {
            setRewriteSuggestions(data.suggestions.filter((item): item is string => typeof item === "string"));
          }
        }
      });
      setRewriteStatus("idle");
    } catch (streamError) {
      setRewriteStatus("error");
      setError(streamError instanceof Error ? streamError.message : "正文改写失败，请稍后重试。");
    }
  }

  async function copyRewriteResult() {
    if (!rewriteResult.trim() || !navigator.clipboard) return;
    await navigator.clipboard.writeText(rewriteResult);
  }

  return (
    <aside className="h-fit min-h-[calc(100vh-8rem)] rounded-lg bg-[#fbfdff] px-6 py-8 lg:sticky lg:top-20">
      <div className="mb-8 flex items-center justify-center gap-3">
        <span className="h-6 w-6 rounded-md bg-gradient-to-br from-[#ff5f62] to-[#8c7bff]" />
        <h2 className="text-lg font-semibold">AI 创作助手</h2>
      </div>

      {error ? (
        <div className="mb-5 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5">
        {leadingContent}

        <section className="rounded-md border border-[#eeeeee] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[#1f2329]">标题优化</h3>
            <button
              className="rounded-md bg-[#ff4d4f] px-3 py-1.5 text-xs font-semibold text-white disabled:bg-[#f3a5a6]"
              disabled={!authToken || titleStatus === "streaming" || !topic.trim()}
              type="button"
              onClick={optimizeTitles}
            >
              {titleStatus === "streaming" ? "生成中..." : "优化标题"}
            </button>
          </div>
          <div className="grid gap-2">
            {titleCandidates.length ? (
              titleCandidates.map((title, index) => (
                <button
                  className="rounded-md border border-[#eeeeee] px-3 py-2 text-left text-sm leading-6 hover:border-[#ff9a9b] hover:text-[#d92d2d]"
                  key={`${title}-${index}`}
                  type="button"
                  onClick={() => onSelectTitle(title)}
                >
                  {title}
                </button>
              ))
            ) : (
              <p className="text-sm leading-6 text-[#8f959e]">AI 会按当前标题、主题和正文流式给出多个标题候选。</p>
            )}
          </div>
        </section>

        <section className="rounded-md border border-[#eeeeee] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[#1f2329]">正文改写</h3>
            <button
              className="rounded-md bg-[#ff4d4f] px-3 py-1.5 text-xs font-semibold text-white disabled:bg-[#f3a5a6]"
              disabled={!authToken || rewriteStatus === "streaming"}
              type="button"
              onClick={rewriteText}
            >
              {rewriteStatus === "streaming" ? "改写中..." : "开始改写"}
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {rewriteModes.map((mode) => (
              <button
                className={[
                  "rounded-md border px-2.5 py-1.5 text-xs font-medium",
                  rewriteMode === mode.value
                    ? "border-[#ff4d4f] bg-[#fff1f1] text-[#d92d2d]"
                    : "border-[#dedede] text-[#5d6673] hover:border-[#ff9a9b]",
                ].join(" ")}
                key={mode.value}
                type="button"
                onClick={() => setRewriteMode(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <textarea
            className="min-h-28 w-full resize-y rounded-md border border-[#dedede] px-3 py-2 text-sm leading-6 outline-none focus:border-[#ff4d4f]"
            placeholder="输入需要改写的正文片段；留空时使用当前正文前 800 字。"
            value={rewriteInput}
            onChange={(event) => setRewriteInput(event.target.value)}
          />

          <div className="mt-3 min-h-28 rounded-md bg-[#fafafa] p-3 text-sm leading-7 text-[#2f3640]">
            {rewriteResult || "改写结果会在这里流式出现。"}
          </div>

          {rewriteSuggestions.length ? (
            <ul className="mt-3 grid gap-1 text-xs leading-5 text-[#8f959e]">
              {rewriteSuggestions.map((item) => (
                <li key={item}>建议：{item}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-md bg-gradient-to-r from-[#ff4d4f] to-[#8c7bff] px-3 py-2 text-xs font-semibold text-white disabled:opacity-45"
              disabled={!rewriteResult || rewriteStatus === "streaming"}
              type="button"
              onClick={() => onReplaceBody(rewriteResult)}
            >
              替换正文
            </button>
            {onAppendBody ? (
              <button
                className="rounded-md bg-[#fff1f1] px-3 py-2 text-xs font-semibold text-[#d92d2d] disabled:opacity-45"
                disabled={!rewriteResult || rewriteStatus === "streaming"}
                type="button"
                onClick={() => onAppendBody(rewriteResult)}
              >
                添加正文
              </button>
            ) : null}
            <button
              className="rounded-md bg-[#f0f1f3] px-3 py-2 text-xs font-medium text-[#4e5661] disabled:opacity-45"
              disabled={!rewriteResult || rewriteStatus === "streaming"}
              type="button"
              onClick={copyRewriteResult}
            >
              复制结果
            </button>
          </div>
        </section>

        <section className="max-h-[34vh] overflow-y-auto rounded-md border border-[#eeeeee] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#1f2329]">{previewTitle || currentTitle || "等待创作建议"}</h3>
          {previewBodyText ? (
            <>
              {previewBodyText.split(/\n{2,}|\n/).filter(Boolean).map((paragraph, index) => (
                <p className="mb-3 text-sm leading-7 text-[#2f3640]" key={`${paragraph}-${index}`}>
                  {paragraph}
                </p>
              ))}
              <p className="mt-4 text-xs text-[#a8adb5]">以上文本由 AI 基于用户指令生成，请谨慎参考和使用。</p>
            </>
          ) : (
            <p className="text-sm leading-7 text-[#8f959e]">
              输入主题或编辑正文后，助手可以继续优化标题、改写正文，并把结果写回当前编辑区。
            </p>
          )}
        </section>

        {recentDrafts.length ? (
          <section className="border-t border-[#eeeeee] pt-5">
            <div className="mb-3 text-sm font-semibold text-[#4e5661]">最近草稿</div>
            <div className="grid gap-2">
              {recentDrafts.slice(0, 3).map((draft) =>
                onOpenDraft ? (
                  <button
                    className="rounded-md border border-[#eeeeee] bg-white px-3 py-2 text-left text-sm hover:border-[#ffb6b7]"
                    key={draft.id}
                    type="button"
                    onClick={() => onOpenDraft(draft.id)}
                  >
                    <DraftLinkContent draft={draft} />
                  </button>
                ) : (
                  <Link
                    className="rounded-md border border-[#eeeeee] bg-white px-3 py-2 text-sm hover:border-[#ffb6b7]"
                    href={`/drafts/${draft.id}`}
                    key={draft.id}
                  >
                    <DraftLinkContent draft={draft} />
                  </Link>
                ),
              )}
            </div>
          </section>
        ) : null}
        {footer}
      </div>
    </aside>
  );
}

async function streamRequest(
  path: string,
  authToken: string,
  body: unknown,
  onEvent: (eventName: string, data: unknown) => void,
) {
  const response = await apiFetch(path, {
    method: "POST",
    authToken,
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const payload = await readApiJson<{ message?: string | string[] }>(response);
    throw new Error(getApiErrorMessage(payload, "AI 流式请求失败，请稍后重试。"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let streamFinished = false;
  const parser = createAiSseParser(({ event, data }) => {
    if (event === "error") {
      const message = isRecord(data) && typeof data.message === "string" ? data.message : "AI 流式生成失败。";
      throw new Error(message);
    }

    if (event === "done") {
      streamFinished = true;
    }

    onEvent(event, data);
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }

  const tail = decoder.decode();
  if (tail) {
    parser.feed(tail);
  }

  if (!streamFinished) {
    throw new Error("AI 流式连接已中断，请重试。");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function DraftLinkContent({ draft }: { draft: DraftSummary }) {
  return (
    <>
      <div className="line-clamp-1 font-medium text-[#1f2329]">{draft.title}</div>
      <div className="mt-1 text-xs text-[#8f959e]">v{draft.version}</div>
    </>
  );
}
