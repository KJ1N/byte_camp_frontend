"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  AuditCheckResponse,
  DraftDetail,
  PublishArticleResponse,
  RichTextDocument,
  RichTextNode,
  ScoringArticleResponse,
} from "@bytecamp-aigc/shared";

import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";
import { markArticleViewIntent } from "@/lib/engagement-state";
import { getPublishedArticleHref, isPublishArticleResponse, normalizePublishDraftId } from "@/lib/publish-result";

function textFromNode(node: RichTextNode): string {
  return [node.text ?? "", ...(node.content ?? []).map((child) => textFromNode(child))].join("");
}

function linesFromDoc(doc: RichTextDocument) {
  return doc.content.map((node) => textFromNode(node).trim()).filter(Boolean);
}

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

  const paragraphs = useMemo(() => (draft ? linesFromDoc(draft.body) : []), [draft]);
  const isChecking = state === "checking";
  const isPublishing = state === "publishing";
  const canPublish = state === "pass" && Boolean(audit && score);

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
  }

  async function startReview() {
    if (!token || !draftId) return;
    setState("checking");
    setError("");
    setAudit(null);
    setScore(null);
    setPublishResult(null);

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
              <article className="mt-8 max-w-[860px] space-y-5 text-[17px] leading-9 text-[#2f3640]">
                {paragraphs.length ? (
                  paragraphs.map((paragraph, index) => <p key={`${paragraph}-${index}`}>{paragraph}</p>)
                ) : (
                  <p className="text-[#8f959e]">正文为空，请返回草稿编辑页补充内容。</p>
                )}
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
                  className="rounded-md border border-[#dedede] px-5 py-3 text-sm font-semibold text-[#4e5661] disabled:text-[#a8adb5]"
                  disabled={!draft || isChecking || isPublishing}
                  type="button"
                  onClick={() => void startReview()}
                >
                  {isChecking ? "审核评分中..." : "开始审核"}
                </button>
                <button
                  className="rounded-md bg-[#ff4d4f] px-5 py-3 text-sm font-semibold text-white disabled:bg-[#f3a5a6]"
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
