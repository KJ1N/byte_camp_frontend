"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  AuditCheckResponse,
  ComplianceRewriteDoneData,
  DraftDetail,
  PublishArticleResponse,
  ScoringArticleResponse,
} from "@bytecamp-aigc/shared";

import { RichTextViewer } from "@/components/editor/rich-text-viewer";
import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { createAiSseParser } from "@/lib/ai-stream";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";
import { markArticleViewIntent } from "@/lib/engagement-state";
import {
  canStartComplianceRewrite,
  getReviewStateAfterApplyingRewrite,
  isComplianceRewriteDoneData,
  isRewriteApplyDisabled,
  type ComplianceRewriteState,
} from "@/lib/publish-compliance-rewrite";
import { getPublishedArticleHref, isPublishArticleResponse, normalizePublishDraftId } from "@/lib/publish-result";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

type ReviewState = "loading" | "ready" | "checking" | "pass" | "warn" | "block" | "publishing" | "published" | "error";

export default function PublishConfirmPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const draftId = normalizePublishDraftId(params.id);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [audit, setAudit] = useState<AuditCheckResponse | null>(null);
  const [score, setScore] = useState<ScoringArticleResponse | null>(null);
  const [publishResult, setPublishResult] = useState<PublishArticleResponse | null>(null);
  const [state, setState] = useState<ReviewState>("loading");
  const [error, setError] = useState("");
  const [rewriteState, setRewriteState] = useState<ComplianceRewriteState>("idle");
  const [rewriteText, setRewriteText] = useState("");
  const [rewriteSuggestions, setRewriteSuggestions] = useState<string[]>([]);
  const [rewritePayload, setRewritePayload] = useState<ComplianceRewriteDoneData | null>(null);
  const [rewriteError, setRewriteError] = useState("");
  const [rewriteMessage, setRewriteMessage] = useState("");

  const isChecking = state === "checking";
  const isPublishing = state === "publishing";
  const canPublish = state === "pass" && Boolean(audit && score);
  const canRewrite = canStartComplianceRewrite(audit?.result.decision);

  useEffect(() => {
    const storedToken = getStoredToken();
    setToken(storedToken);
    setUser(getStoredUser());

    if (!storedToken) {
      router.push("/login");
      return;
    }

    if (!draftId) {
      setError("发布地址缺少有效草稿 ID，请从草稿编辑页点击“预览并发布”进入。");
      setState("error");
      return;
    }

    void loadDraft(storedToken);
  }, [draftId, router]);

  async function loadDraft(authToken: string) {
    setState("loading");
    setError("");

    if (!draftId) return;

    const response = await apiFetch(`/drafts/${draftId}`, { authToken });
    const payload = await readApiJson<DraftDetail | { message?: string | string[] }>(response);

    if (response.status === 401) {
      clearAuthSession();
      router.push("/login");
      return;
    }

    if (!response.ok || !payload || "message" in payload) {
      setError(getApiErrorMessage(payload, "草稿加载失败，请稍后重试。"));
      setState("error");
      return;
    }

    setDraft(payload as DraftDetail);
    setState("ready");
    resetRewriteState();
  }

  async function startReview() {
    if (!token || !draftId) return;
    setState("checking");
    setError("");
    setAudit(null);
    setScore(null);
    setPublishResult(null);
    resetRewriteState();

    const auditResponse = await apiFetch("/audit/check", {
      method: "POST",
      authToken: token,
      body: JSON.stringify({ draftId }),
    });
    const auditPayload = await readApiJson<AuditCheckResponse | { message?: string | string[] }>(auditResponse);

    if (!auditResponse.ok || !auditPayload || "message" in auditPayload) {
      setError(getApiErrorMessage(auditPayload, "审核失败，请稍后重试。"));
      setState("error");
      return;
    }

    const scoreResponse = await apiFetch("/scoring/article", {
      method: "POST",
      authToken: token,
      body: JSON.stringify({ draftId }),
    });
    const scorePayload = await readApiJson<ScoringArticleResponse | { message?: string | string[] }>(scoreResponse);

    if (!scoreResponse.ok || !scorePayload || "message" in scorePayload) {
      setError(getApiErrorMessage(scorePayload, "评分失败，请稍后重试。"));
      setState("error");
      return;
    }

    setAudit(auditPayload as AuditCheckResponse);
    setScore(scorePayload as ScoringArticleResponse);

    const decision = (auditPayload as AuditCheckResponse).result.decision;
    if (decision === "BLOCK") setState("block");
    else if (decision === "WARN") setState("warn");
    else setState("pass");
  }

  async function publishDraft() {
    if (!token || !draftId || !canPublish) return;
    setState("publishing");
    setError("");

    const response = await apiFetch(`/publish/${draftId}`, {
      method: "POST",
      authToken: token,
    });
    const payload = await readApiJson<PublishArticleResponse | { message?: string | string[] }>(response);

    if (!response.ok || !isPublishArticleResponse(payload)) {
      if (response.status === 409) {
        setAudit(null);
        setScore(null);
        setPublishResult(null);
        setError(getApiErrorMessage(payload, "草稿内容已变化，请重新审核后发布。"));
        setState("ready");
        return;
      }

      setError(getApiErrorMessage(payload, "发布失败，请稍后重试。"));
      setState("error");
      return;
    }

    const result = payload as PublishArticleResponse;
    setPublishResult(result);
    setAudit(result.audit);
    setScore(result.score);

    const articleHref = getPublishedArticleHref(result);
    if (articleHref) {
      setState("published");
      window.location.assign(articleHref);
      return;
    }

    if (result.status === "BLOCKED") setState("block");
    else setState("warn");
  }

  function resetRewriteState() {
    setRewriteState("idle");
    setRewriteText("");
    setRewriteSuggestions([]);
    setRewritePayload(null);
    setRewriteError("");
    setRewriteMessage("");
  }

  async function startComplianceRewrite() {
    if (!token || !draftId || !audit || !canRewrite || rewriteState === "streaming" || rewriteState === "applying") return;

    setRewriteState("streaming");
    setRewriteText("");
    setRewriteSuggestions([]);
    setRewritePayload(null);
    setRewriteError("");
    setRewriteMessage("");

    let nextText = "";
    let donePayload: ComplianceRewriteDoneData | null = null;

    try {
      await streamRequest("/audit/rewrite/stream", token, {
        draftId,
        auditRecordId: audit.recordId,
      }, (eventName, data) => {
        if (eventName === "text-delta" && isRecord(data) && typeof data.text === "string") {
          nextText += data.text;
          setRewriteText(nextText);
          return;
        }

        if (eventName === "suggestion" && isRecord(data) && typeof data.text === "string") {
          setRewriteSuggestions((items) => [...items, data.text as string]);
          return;
        }

        if (eventName === "done") {
          if (!isComplianceRewriteDoneData(data)) {
            throw new Error("合规改写结果格式异常，请重试。");
          }
          donePayload = data;
          nextText = data.bodyText;
          setRewriteText(data.bodyText);
          setRewriteSuggestions(data.suggestions);
          setRewritePayload(data);
        }
      });

      setRewriteState(donePayload ? "ready" : "error");
      if (!donePayload) setRewriteError("合规改写结果不完整，请重试。");
    } catch (streamError) {
      setRewriteState("error");
      setRewriteError(streamError instanceof Error ? streamError.message : "合规改写失败，请稍后重试。");
    }
  }

  async function applyComplianceRewrite() {
    if (!token || !draftId || !rewritePayload || isRewriteApplyDisabled(rewriteState, rewritePayload)) return;

    setRewriteState("applying");
    setRewriteError("");
    setRewriteMessage("");

    const response = await apiFetch(`/drafts/${draftId}`, {
      method: "PATCH",
      authToken: token,
      body: JSON.stringify({ body: rewritePayload.body }),
    });
    const payload = await readApiJson<DraftDetail | { message?: string | string[] }>(response);

    if (response.status === 401) {
      clearAuthSession();
      router.push("/login");
      return;
    }

    if (!response.ok || !payload || "message" in payload) {
      setRewriteState("ready");
      setRewriteError(getApiErrorMessage(payload, "应用改写失败，请稍后重试。"));
      return;
    }

    setDraft(payload as DraftDetail);
    setAudit(null);
    setScore(null);
    setPublishResult(null);
    setState(getReviewStateAfterApplyingRewrite());
    setRewriteState("applied");
    setRewritePayload(null);
    setRewriteMessage("已应用合规改写，请重新审核评分后再发布。");
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Link
              aria-label="返回草稿编辑"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-xl text-[#7b8088] hover:bg-[#eeeeee]"
              href={draftId ? `/drafts/${draftId}` : "/drafts"}
            >
              ‹
            </Link>
            <div>
              <div className="text-lg font-semibold">发布确认</div>
              <div className="text-xs text-[#8f959e]">发布前审核 · {user?.nickname ?? "创作者"}</div>
            </div>
          </div>
          <Link className="rounded-md bg-[#f6f7f9] px-3 py-2 text-sm font-medium hover:bg-[#eeeeee]" href="/drafts">
            草稿箱
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-h-[calc(100vh-8rem)] bg-white px-8 py-9">
          {state === "loading" ? (
            <div className="py-16 text-center text-sm text-[#8f959e]">草稿加载中...</div>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-center gap-3 text-xs text-[#8f959e]">
                <span>草稿版本 v{draft?.version ?? "-"}</span>
                <span>{draft?.updatedAt ? `更新于 ${formatTime(draft.updatedAt)}` : "尚未加载"}</span>
              </div>
              <h1 className="border-b border-[#eeeeee] pb-6 text-[30px] font-semibold leading-tight">
                {draft?.title ?? "未命名草稿"}
              </h1>
              <article className="mt-8 max-w-[860px]">
                {draft ? (
                  <RichTextViewer emptyText="正文为空，请返回草稿编辑页补充内容。" value={draft.body} />
                ) : null}
              </article>
            </>
          )}
        </section>

        <aside className="h-fit bg-[#fbfdff] px-6 py-7 lg:sticky lg:top-20">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">发布前检查</h2>
            <span className="rounded-md bg-[#fff1f0] px-2 py-1 text-xs font-medium text-[#ff4d4f]">强制审核</span>
          </div>

          {error ? (
            <div className="mb-5 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4">
            <div className="rounded-md border border-[#eeeeee] bg-white p-4">
              <div className="mb-2 text-sm font-semibold">审核结果</div>
              <div className="text-sm text-[#4e5661]">{audit?.result.summary ?? "尚未审核"}</div>
              {audit?.result.evidence.length ? (
                <div className="mt-3 grid gap-2">
                  {audit.result.evidence.map((item, index) => (
                    <div className="rounded-md bg-[#fffaf0] px-3 py-2 text-xs text-[#8a5a00]" key={`${item.text}-${index}`}>
                      <div className="font-semibold">{item.text}</div>
                      <div className="mt-1">{item.reason}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-md border border-[#eeeeee] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">质量评分</div>
                <div className="text-2xl font-semibold text-[#ff4d4f]">{score?.overall ?? "--"}</div>
              </div>
              {score ? (
                <div className="grid gap-2 text-xs text-[#4e5661]">
                  <div>内容价值：{score.contentValue}</div>
                  <div>表达质量：{score.expressionQuality}</div>
                  <div>读者体验：{score.readerExperience}</div>
                  <div>传播潜力：{score.spreadPotential}</div>
                  <div>合规安全：{score.safetyScore}</div>
                </div>
              ) : (
                <div className="text-sm text-[#8f959e]">审核后自动生成五维评分。</div>
              )}
            </div>

            {audit?.result.rewriteSuggestions.length ? (
              <div className="rounded-md border border-[#eeeeee] bg-white p-4">
                <div className="mb-2 text-sm font-semibold">修改建议</div>
                <ul className="space-y-2 text-sm text-[#4e5661]">
                  {audit.result.rewriteSuggestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {(canRewrite || rewriteState !== "idle") ? (
              <div className="rounded-md border border-[#ffd7d8] bg-white p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">一键合规改写</div>
                  <span className="rounded-md bg-[#fff1f1] px-2 py-1 text-xs font-medium text-[#ff4d4f]">
                    需重新审核
                  </span>
                </div>
                <p className="text-sm leading-6 text-[#6b7280]">
                  {audit?.result.decision === "BLOCK"
                    ? "当前内容禁止发布，改写后仍必须重新审核，不能绕过发布前检查。"
                    : "根据审核证据生成安全改写稿，应用到草稿后重新审核评分。"}
                </p>

                {rewriteError ? (
                  <div className="mt-3 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-3 py-2 text-sm text-[#d92d2d]">
                    {rewriteError}
                  </div>
                ) : null}

                {rewriteMessage ? (
                  <div className="mt-3 rounded-md border border-[#d8ead8] bg-[#f5fbf5] px-3 py-2 text-sm text-[#2f6b37]">
                    {rewriteMessage}
                  </div>
                ) : null}

                {(rewriteState === "streaming" || rewriteText) ? (
                  <div className="mt-4 rounded-md bg-[#fafafa] p-3">
                    <div className="mb-2 text-xs font-semibold text-[#8f959e]">改写预览</div>
                    <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-[#2f3640]">
                      {rewriteText || "正在生成合规改写..."}
                    </div>
                    {rewriteSuggestions.length ? (
                      <div className="mt-3 border-t border-[#eeeeee] pt-3 text-xs leading-6 text-[#6b7280]">
                        {rewriteSuggestions.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-md border border-[#ffb6b7] px-3 py-2 text-sm font-semibold text-[#ff4d4f] disabled:border-[#eeeeee] disabled:text-[#a8adb5]"
                    disabled={!canRewrite || rewriteState === "streaming" || rewriteState === "applying"}
                    type="button"
                    onClick={() => void startComplianceRewrite()}
                  >
                    {rewriteState === "streaming" ? "改写中..." : rewriteText ? "重新生成" : "一键合规改写"}
                  </button>
                  <button
                    className="rounded-md bg-[#ff4d4f] px-3 py-2 text-sm font-semibold text-white disabled:bg-[#f3a5a6]"
                    disabled={isRewriteApplyDisabled(rewriteState, rewritePayload)}
                    type="button"
                    onClick={() => void applyComplianceRewrite()}
                  >
                    {rewriteState === "applying" ? "应用中..." : "应用到草稿"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {state === "published" && publishResult?.articleId ? (
              <Link
                className="rounded-md bg-[#ff4d4f] px-5 py-3 text-center text-sm font-semibold text-white"
                href={`/articles/${publishResult.articleId}`}
                onClick={() => markArticleViewIntent(window.sessionStorage, publishResult.articleId!)}
              >
                查看文章详情
              </Link>
            ) : (
              <>
                <button
                  className="rounded-md border border-[#dedede] px-5 py-3 text-sm font-semibold text-[#4e5661] disabled:text-[#a8adb5] cursor-pointer disabled:cursor-not-allowed"
                  disabled={!draft || isChecking || isPublishing}
                  type="button"
                  onClick={() => void startReview()}
                >
                  {isChecking ? "审核评分中..." : "开始审核"}
                </button>
                <button
                  className="rounded-md bg-[#ff4d4f] px-5 py-3 text-sm font-semibold text-white disabled:bg-[#f3a5a6] cursor-pointer disabled:cursor-not-allowed"
                  disabled={!canPublish || isPublishing}
                  type="button"
                  onClick={() => void publishDraft()}
                >
                  {isPublishing ? "发布中..." : "确认发布"}
                </button>
              </>
            )}
            {(state === "warn" || state === "block") && (
              <Link
                className="rounded-md bg-[#f0f1f3] px-5 py-3 text-center text-sm font-semibold text-[#4e5661]"
                href={draftId ? `/drafts/${draftId}` : "/drafts"}
              >
                返回编辑修改
              </Link>
            )}
          </div>
        </aside>
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
