"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type {
  AssetSummary,
  DraftSummary,
  GeneratedArticleDraft,
  ListPromptsResponse,
  PromptTemplateDetail,
  PromptTemplateSummary,
  RichTextDocument,
} from "@bytecamp-aigc/shared";

import { AiWritingAssistant } from "@/components/ai-writing-assistant";
import { AssetPanel } from "@/components/asset-panel";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { PromptManagerPanel } from "@/components/prompt-manager-panel";
import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { createAiSseParser, mergeTitleCandidate } from "@/lib/ai-stream";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";
import {
  appendPlainTextParagraph,
  plainTextFromRichText,
  replaceWithPlainText,
} from "@/lib/rich-text-document";
import { nextSelectedPromptIdAfterDelete } from "@/lib/prompt-management";
import { normalizeWorkspaceTopic } from "@/lib/workspace-topic";
import {
  createWorkspaceImageInsertRequest,
  workspaceSidePanelTabs,
  type EditorImageInsertRequest,
  type WorkspaceSidePanelTab,
} from "@/lib/workspace-assets";

const styleOptions = ["科普", "新闻", "轻松", "严谨", "种草"];
const rewriteModes = [
  { value: "POLISH", label: "润色" },
  { value: "EXPAND", label: "扩写" },
  { value: "SHORTEN", label: "缩写" },
  { value: "CHANGE_STYLE", label: "换风格" },
] as const;

type RewriteModeValue = (typeof rewriteModes)[number]["value"];
type WorkbenchStatus = "loading" | "idle" | "streaming" | "saving";
type StreamStatus = "idle" | "streaming" | "error";

const defaultTopic = "AI 如何改变内容创作";

const emptyDoc: RichTextDocument = replaceWithPlainText("");

function textFromDoc(doc: RichTextDocument) {
  return doc.content
    .flatMap((node) => node.content ?? [])
    .map((node) => node.text ?? "")
    .join("");
}

function createEmptyGenerated(model = "streaming"): GeneratedArticleDraft {
  return {
    model,
    title: "",
    outline: [],
    bodyText: "",
    body: emptyDoc,
  };
}

export default function WorkspacePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [topic, setTopic] = useState(defaultTopic);
  const [audience, setAudience] = useState("内容创作者");
  const [style, setStyle] = useState("科普");
  const [prompts, setPrompts] = useState<PromptTemplateSummary[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [generated, setGenerated] = useState<GeneratedArticleDraft | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [status, setStatus] = useState<WorkbenchStatus>("loading");
  const [titleStatus, setTitleStatus] = useState<StreamStatus>("idle");
  const [rewriteStatus, setRewriteStatus] = useState<StreamStatus>("idle");
  const [titleCandidates, setTitleCandidates] = useState<string[]>([]);
  const [rewriteMode, setRewriteMode] = useState<RewriteModeValue>("POLISH");
  const [rewriteInput, setRewriteInput] = useState("");
  const [rewriteResult, setRewriteResult] = useState("");
  const [rewriteSuggestions, setRewriteSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [sidePanelTab, setSidePanelTab] = useState<WorkspaceSidePanelTab>("ai");
  const [imageInsertRequest, setImageInsertRequest] = useState<EditorImageInsertRequest | null>(null);

  useEffect(() => {
    const storedToken = getStoredToken();
    const queryTopic = normalizeWorkspaceTopic(new URLSearchParams(window.location.search).get("topic"));

    if (queryTopic) {
      setTopic(queryTopic);
    }

    setToken(storedToken);
    setUser(getStoredUser());
    setStatus("idle");

    if (storedToken) {
      void loadDrafts(storedToken);
      void loadPrompts(storedToken);
    }
  }, []);

  const wordCount = useMemo(() => {
    if (!generated) return 0;
    return plainTextFromRichText(generated.body).length;
  }, [generated]);

  async function loadPrompts(authToken: string) {
    setPromptsLoading(true);
    const response = await apiFetch("/prompts?category=article_generation", { authToken });
    const payload = await readApiJson<ListPromptsResponse | { message?: string | string[] }>(response);
    setPromptsLoading(false);

    if (!response.ok || !payload || !("items" in payload)) {
      setError(getApiErrorMessage(payload, "Prompt 模板加载失败，已使用默认模板。"));
      return;
    }

    setPrompts(payload.items);
    setSelectedPromptId(payload.items.find((item) => item.isStarter)?.id ?? payload.items[0]?.id ?? "");
  }

  function handlePromptSaved(prompt: PromptTemplateDetail) {
    const summary: PromptTemplateSummary = {
      id: prompt.id,
      name: prompt.name,
      category: prompt.category,
      owner: prompt.owner,
      isStarter: prompt.isStarter,
      description: prompt.description,
    };

    setPrompts((items) => {
      const exists = items.some((item) => item.id === summary.id);
      if (exists) return items.map((item) => (item.id === summary.id ? summary : item));
      return [...items, summary];
    });
    setSelectedPromptId(prompt.id);
  }

  function handlePromptDeleted(promptId: string) {
    setPrompts((items) => {
      const remaining = items.filter((item) => item.id !== promptId);
      setSelectedPromptId((currentPromptId) =>
        nextSelectedPromptIdAfterDelete(promptId, currentPromptId, remaining),
      );
      return remaining;
    });
  }

  async function loadDrafts(authToken: string) {
    const response = await apiFetch("/drafts/mine", { authToken });
    const payload = await readApiJson<DraftSummary[] | { message?: string | string[] }>(response);

    if (response.status === 401) {
      clearAuthSession();
      setToken(null);
      setUser(null);
      setDrafts([]);
      return;
    }

    if (!response.ok) {
      setError(getApiErrorMessage(payload, "草稿列表加载失败，请稍后重试。"));
      return;
    }

    setDrafts(Array.isArray(payload) ? payload : []);
  }

  async function generateArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      router.push("/login");
      return;
    }

    setStatus("streaming");
    setError("");
    setTitleCandidates([]);
    setRewriteResult("");
    setRewriteSuggestions([]);
    setGenerated(createEmptyGenerated());
    setDraftTitle("");

    let bodyText = "";

    try {
      await streamRequest("/ai/generate-article/stream", token, {
        topic,
        audience,
        style,
        promptId: selectedPromptId || undefined,
      }, (eventName, data) => {
        if (eventName === "meta" && isRecord(data) && typeof data.model === "string") {
          setGenerated((current) => ({ ...(current ?? createEmptyGenerated()), model: data.model as string }));
          return;
        }

        if (eventName === "title" && isRecord(data) && typeof data.text === "string") {
          setDraftTitle(data.text);
          setGenerated((current) => ({ ...(current ?? createEmptyGenerated()), title: data.text as string }));
          return;
        }

        if (eventName === "outline" && isRecord(data) && Array.isArray(data.items)) {
          const outline = data.items.filter((item): item is string => typeof item === "string");
          setGenerated((current) => ({ ...(current ?? createEmptyGenerated()), outline }));
          return;
        }

        if (eventName === "body-delta" && isRecord(data) && typeof data.text === "string") {
          bodyText += data.text;
          const body = replaceWithPlainText(bodyText);
          setGenerated((current) => ({
            ...(current ?? createEmptyGenerated()),
            bodyText,
            body,
          }));
          return;
        }

        if (eventName === "done" && isRecord(data)) {
          const finalBodyText = typeof data.bodyText === "string" ? data.bodyText : bodyText;
          const finalBody = isRichTextDocument(data.body) ? data.body : replaceWithPlainText(finalBodyText);
          setGenerated((current) => ({
            ...(current ?? createEmptyGenerated()),
            title: typeof data.title === "string" ? data.title : current?.title ?? "",
            outline: Array.isArray(data.outline)
              ? data.outline.filter((item): item is string => typeof item === "string")
              : current?.outline ?? [],
            bodyText: finalBodyText,
            body: finalBody,
          }));
        }
      });
      setStatus("idle");
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : "AI 生成失败，请稍后重试。");
      setStatus("idle");
    }
  }

  async function optimizeTitles() {
    if (!token || titleStatus === "streaming") return;

    setTitleStatus("streaming");
    setTitleCandidates([]);
    setError("");

    try {
      await streamRequest("/ai/optimize-titles/stream", token, {
        topic,
        audience,
        style,
        currentTitle: draftTitle,
        bodyText: generated?.bodyText,
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
    if (!token || rewriteStatus === "streaming") return;
    const text = rewriteInput.trim() || generated?.bodyText.slice(0, 800).trim();
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
      await streamRequest("/ai/rewrite/stream", token, {
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

  function applyRewriteToPreview() {
    if (!rewriteResult.trim()) return;

    const body = replaceWithPlainText(rewriteResult);
    setGenerated((current) => ({
      ...(current ?? createEmptyGenerated()),
      bodyText: rewriteResult,
      body,
    }));
  }

  async function copyRewriteResult() {
    if (!rewriteResult.trim() || !navigator.clipboard) return;
    await navigator.clipboard.writeText(rewriteResult);
  }

  function replaceGeneratedBody(text: string) {
    if (!text.trim()) return;
    const body = replaceWithPlainText(text);
    setGenerated((current) => ({
      ...(current ?? createEmptyGenerated()),
      bodyText: text,
      body,
    }));
  }

  function appendGeneratedBody(text: string) {
    if (!text.trim()) return;
    setGenerated((current) => {
      const base = current ?? createEmptyGenerated();
      const body = appendPlainTextParagraph(base.body, text);
      return {
        ...base,
        body,
        bodyText: plainTextFromRichText(body),
      };
    });
  }

  function updateGeneratedBody(nextBody: RichTextDocument) {
    setGenerated((current) => ({
      ...(current ?? createEmptyGenerated()),
      body: nextBody,
      bodyText: plainTextFromRichText(nextBody),
    }));
  }

  function insertAssetImage(asset: AssetSummary) {
    setError("");
    setGenerated((current) => current ?? createEmptyGenerated());
    setImageInsertRequest(createWorkspaceImageInsertRequest(asset));
  }

  async function saveDraft() {
    if (!token || !generated || status === "streaming") return;

    setStatus("saving");
    setError("");

    try {
      const response = await apiFetch("/drafts", {
        method: "POST",
        authToken: token,
        body: JSON.stringify({
          title: draftTitle || generated.title,
          body: generated.body,
          mode: "FAST",
        }),
      });
      const payload = await readApiJson<{ id: string } | { message?: string | string[] }>(response);

      if (!response.ok || !payload || "message" in payload) {
        setError(getApiErrorMessage(payload, "保存草稿失败，请稍后重试。"));
        setStatus("idle");
        return;
      }

      router.push(`/drafts/${(payload as { id: string }).id}`);
    } catch {
      setError("无法连接 API 服务，请稍后重试。");
      setStatus("idle");
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Link
              aria-label="返回创作者主页"
              className="flex h-9 w-9 items-center justify-center rounded-md bg-[#f5f5f5] text-lg text-[#7b8088] hover:bg-[#eeeeee]"
              href="/creator"
            >
              ←
            </Link>
            <div>
              <div className="text-lg font-semibold">发布文章</div>
              <div className="text-xs text-[#8f959e]">AI Creator Hub 工作台</div>
            </div>
          </div>

          <div className="flex items-center gap-5 text-sm text-[#4e5661]">
            <Link className="hidden hover:text-[#ff4d4f] sm:block" href="/docs">
              发文规范
            </Link>
            {user ? (
              <Link className="rounded-md bg-[#f6f7f9] px-3 py-2 font-medium hover:bg-[#eeeeee]" href="/creator">
                {user.nickname}
              </Link>
            ) : (
              <Link className="rounded-md bg-[#ff4d4f] px-4 py-2 font-medium text-white" href="/login">
                登录
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="min-h-[calc(100vh-8rem)] rounded-lg bg-white">
          

          <div className="mx-auto max-w-[920px] px-8 py-9">
            <form className="mb-9 rounded-lg border border-[#eeeeee] bg-[#fbfbfb] p-5" onSubmit={generateArticle}>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-base font-semibold">创作设定</div>
                  <p className="mt-1 text-sm text-[#8f959e]">
                    选择模板并输入主题，AI 会流式生成标题、大纲和正文。
                  </p>
                </div>
                <Link className="text-sm font-medium text-[#ff4d4f]" href="/drafts">
                  我的草稿
                </Link>
              </div>

              <PromptManagerPanel
                authToken={token}
                prompts={prompts}
                promptsLoading={promptsLoading}
                selectedPromptId={selectedPromptId}
                onError={setError}
                onPromptDeleted={handlePromptDeleted}
                onPromptSaved={handlePromptSaved}
                onSelectPrompt={setSelectedPromptId}
              />

              <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#4e5661]">创作主题</span>
                  <input
                    className="h-11 w-full rounded-md border border-[#dedede] bg-white px-3 text-sm outline-none focus:border-[#ff4d4f]"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#4e5661]">目标受众</span>
                  <input
                    className="h-11 w-full rounded-md border border-[#dedede] bg-white px-3 text-sm outline-none focus:border-[#ff4d4f]"
                    value={audience}
                    onChange={(event) => setAudience(event.target.value)}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <span className="mb-2 block text-sm font-medium text-[#4e5661]">内容风格</span>
                  <div className="flex flex-wrap gap-2">
                    {styleOptions.map((option) => (
                      <button
                        className={[
                          "rounded-md border px-3 py-2 text-sm font-medium transition",
                          style === option
                            ? "border-[#ff4d4f] bg-[#fff1f1] text-[#ff4d4f]"
                            : "border-[#dedede] bg-white text-[#4e5661] hover:border-[#ff9a9b]",
                        ].join(" ")}
                        key={option}
                        type="button"
                        onClick={() => setStyle(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="h-11 rounded-md bg-[#ff4d4f] px-5 text-sm font-semibold text-white transition hover:bg-[#f04446] disabled:bg-[#f3a5a6]"
                  disabled={status === "streaming" || !topic.trim() || !token}
                  type="submit"
                >
                  {status === "streaming" ? "流式生成中..." : "AI 生成初稿"}
                </button>
              </div>
            </form>

            {error ? (
              <div className="mb-6 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
                {error}
              </div>
            ) : null}

            {!token ? (
              <div className="rounded-lg border border-dashed border-[#dedede] bg-white px-8 py-14 text-center">
                <h1 className="text-3xl font-semibold text-[#1f2329]">登录后开始创作</h1>
                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#6b7280]">
                  工作台会把 AI 流式生成、草稿保存、编辑器和发布审核连成一条链路。先登录即可体验演示账号。
                </p>
                <Link className="mt-6 inline-flex rounded-md bg-[#ff4d4f] px-5 py-3 text-sm font-semibold text-white" href="/login">
                  进入登录
                </Link>
              </div>
            ) : (
              <>
                <input
                  className="w-full border-0 border-b border-[#eeeeee] px-0 pb-5 text-[30px] font-semibold text-[#1f2329] outline-none placeholder:text-[#a8adb5]"
                  placeholder="请输入文章标题"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                />

                <article className="hidden">
                  {generated ? (
                    <>
                      {generated.outline.length ? (
                        <div className="mb-8 rounded-md bg-[#fafafa] p-4">
                          <div className="mb-3 text-sm font-semibold text-[#4e5661]">生成大纲</div>
                          <ol className="grid gap-2 pl-5 text-sm leading-7 text-[#5d6673]">
                            {generated.outline.map((item) => (
                              <li className="list-decimal" key={item}>
                                {item}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                      {generated.bodyText ? (
                        generated.bodyText.split(/\n{2,}/).map((paragraph, index) => (
                          <p className="my-6" key={`${paragraph}-${index}`}>
                            {paragraph}
                          </p>
                        ))
                      ) : (
                        <p className="pt-20 text-center text-[#a8adb5]">正在等待正文流式返回...</p>
                      )}
                    </>
                  ) : (
                    <div className="pt-20 text-center text-[#a8adb5]">
                      <p className="text-xl font-semibold">左侧填写主题，右侧助手会同步展示 AI 结果</p>
                      <p className="mt-3 text-sm">生成后可以优化标题、改写正文，并保存为草稿继续编辑。</p>
                    </div>
                  )}
                </article>
                {generated ? (
                  <>
                    {generated.outline.length ? (
                      <div className="mt-8 rounded-md bg-[#fafafa] p-4">
                        <div className="mb-3 text-sm font-semibold text-[#4e5661]">生成大纲</div>
                        <ol className="grid gap-2 pl-5 text-sm leading-7 text-[#5d6673]">
                          {generated.outline.map((item) => (
                            <li className="list-decimal" key={item}>
                              {item}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    <div className="mt-8">
                      <RichTextEditor
                        value={generated.body}
                        insertImageRequest={imageInsertRequest}
                        onChange={updateGeneratedBody}
                      />
                    </div>
                  </>
                ) : (
                  <div className="min-h-[520px] pt-20 text-center text-[#a8adb5]">
                    <p className="text-xl font-semibold">左侧填写主题，右侧助手会同步展示 AI 结果</p>
                    <p className="mt-3 text-sm">生成后可用富文本工具栏编辑正文，也可以继续优化标题和改写正文。</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-4 border-t border-[#eeeeee] bg-white px-8 py-4">
            <div className="flex flex-wrap items-center gap-6 text-sm text-[#8f959e]">
              <span>{status === "streaming" ? "AI 正在生成" : "草稿未保存"}</span>
              <span>共 {wordCount} 字</span>
              <span>发布前仍需审核评分</span>
            </div>
            <button
              className="rounded-md bg-[#ff4d4f] px-6 py-2.5 text-sm font-semibold text-white disabled:bg-[#f3a5a6]"
              disabled={!generated || status === "saving" || status === "streaming"}
              type="button"
              onClick={saveDraft}
            >
              {status === "saving" ? "保存中..." : "保存草稿"}
            </button>
          </div>
        </section>

        <aside className="hidden">
          <div className="mb-8 flex items-center justify-center gap-3">
            <span className="h-6 w-6 rounded-md bg-gradient-to-br from-[#ff5f62] to-[#8c7bff]" />
            <h2 className="text-lg font-semibold">AI 创作助手</h2>
          </div>
{/*
          <div className="mb-6 flex gap-8 border-b border-[#eeeeee] text-sm">
            <button className="border-b-2 border-[#1f2329] pb-3 font-semibold text-[#1f2329]" type="button">
              AI 创作
            </button>
          </div>
*/}
          <div className="grid gap-5">
            <section className="rounded-md border border-[#eeeeee] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#1f2329]">标题优化</h3>
                <button
                  className="rounded-md bg-[#ff4d4f] px-3 py-1.5 text-xs font-semibold text-white disabled:bg-[#f3a5a6]"
                  disabled={!token || titleStatus === "streaming" || !topic.trim()}
                  type="button"
                  onClick={optimizeTitles}
                >
                  {titleStatus === "streaming" ? "生成中..." : "优化标题"}
                </button>
              </div>
              <div className="grid gap-2">
                {titleCandidates.length ? (
                  titleCandidates.map((title) => (
                    <button
                      className="rounded-md border border-[#eeeeee] px-3 py-2 text-left text-sm leading-6 hover:border-[#ff9a9b] hover:text-[#d92d2d]"
                      key={title}
                      type="button"
                      onClick={() => setDraftTitle(title)}
                    >
                      {title}
                    </button>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[#8f959e]">生成初稿后可让 AI 流式给出多个标题候选。</p>
                )}
              </div>
            </section>

            <section className="rounded-md border border-[#eeeeee] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#1f2329]">正文改写</h3>
                <button
                  className="rounded-md bg-[#ff4d4f] px-3 py-1.5 text-xs font-semibold text-white disabled:bg-[#f3a5a6]"
                  disabled={!token || rewriteStatus === "streaming"}
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
                placeholder="输入需要改写的正文片段；留空时使用当前生成正文前 800 字。"
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
                  onClick={applyRewriteToPreview}
                >
                  替换预览正文
                </button>
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
              <h3 className="mb-3 text-sm font-semibold text-[#1f2329]">{generated?.title || "等待生成创作建议"}</h3>
              {generated?.bodyText ? (
                <>
                  {generated.bodyText.split(/\n{2,}/).map((paragraph, index) => (
                    <p className="mb-3 text-sm leading-7 text-[#2f3640]" key={`${paragraph}-${index}`}>
                      {paragraph}
                    </p>
                  ))}
                  <p className="mt-4 text-xs text-[#a8adb5]">以上文本由 AI 基于用户指令生成，请谨慎参考和使用。</p>
                </>
              ) : (
                <p className="text-sm leading-7 text-[#8f959e]">
                  输入创作主题后，助手会逐步给出标题、大纲和正文。所有发布动作仍需经过后端审核和评分。
                </p>
              )}
            </section>

            {drafts.length ? (
              <section className="border-t border-[#eeeeee] pt-5">
                <div className="mb-3 text-sm font-semibold text-[#4e5661]">最近草稿</div>
                <div className="grid gap-2">
                  {drafts.slice(0, 3).map((draft) => (
                    <Link
                      className="rounded-md border border-[#eeeeee] bg-white px-3 py-2 text-sm hover:border-[#ffb6b7]"
                      href={`/drafts/${draft.id}`}
                      key={draft.id}
                    >
                      <div className="line-clamp-1 font-medium text-[#1f2329]">{draft.title}</div>
                      <div className="mt-1 text-xs text-[#8f959e]">v{draft.version}</div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </aside>
        <div className="grid h-fit gap-3">
          <div className="flex rounded-lg bg-white p-1 text-sm font-semibold">
            {workspaceSidePanelTabs.map((item) => (
              <button
                className={[
                  "min-w-0 flex-1 rounded-md px-3 py-2",
                  sidePanelTab === item.id ? "bg-[#fff1f1] text-[#ff4d4f]" : "text-[#6b7280] hover:bg-[#f6f7f9]",
                ].join(" ")}
                key={item.id}
                type="button"
                onClick={() => setSidePanelTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {sidePanelTab === "assets" ? (
            <AssetPanel authToken={token} onInsertImage={insertAssetImage} />
          ) : (
            <AiWritingAssistant
              authToken={token}
              topic={topic}
              audience={audience}
              style={style}
              currentTitle={draftTitle}
              bodyText={generated?.bodyText ?? ""}
              previewTitle={generated?.title}
              previewBodyText={generated?.bodyText}
              recentDrafts={drafts}
              onSelectTitle={setDraftTitle}
              onReplaceBody={replaceGeneratedBody}
              onAppendBody={appendGeneratedBody}
            />
          )}
        </div>
      </div>
    </main>
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

function isRichTextDocument(value: unknown): value is RichTextDocument {
  return isRecord(value) && value.type === "doc" && Array.isArray(value.content);
}
