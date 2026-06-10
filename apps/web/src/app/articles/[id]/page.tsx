"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  EngagementEventType,
  type ArticleDetail,
  type ArticleEngagementStats,
  type CreateEngagementEventResponse,
} from "@bytecamp-aigc/shared";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";
import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { RichTextViewer } from "@/components/editor/rich-text-viewer";
import {
  consumeArticleViewIntent,
  hasRecordedEngagement,
  markEngagementRecorded,
  shouldRecordArticleView,
} from "@/lib/engagement-state";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ArticleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [engagement, setEngagement] = useState<ArticleEngagementStats>({ views: 0, likes: 0, favorites: 0 });
  const [error, setError] = useState("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [eventError, setEventError] = useState("");
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<EngagementEventType | null>(null);
  const viewedArticleIdRef = useRef<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    void loadArticle();
  }, [params.id]);

  async function loadArticle() {
    setLoading(true);
    setError("");

    const response = await apiFetch(`/articles/${params.id}`);
    const payload = await readApiJson<ArticleDetail | { message?: string | string[] }>(response);

    if (!response.ok || !payload || "message" in payload) {
      setError(getApiErrorMessage(payload, "文章加载失败，请稍后重试。"));
      setLoading(false);
      return;
    }

    setArticle(payload as ArticleDetail);
    setEngagement((payload as ArticleDetail).engagement ?? { views: 0, likes: 0, favorites: 0 });
    setLiked(hasRecordedEngagement(window.localStorage, params.id, EngagementEventType.Like));
    setFavorited(hasRecordedEngagement(window.localStorage, params.id, EngagementEventType.Favorite));
    setLoading(false);

    if (
      shouldRecordArticleView(viewedArticleIdRef.current, params.id) &&
      consumeArticleViewIntent(window.sessionStorage, params.id)
    ) {
      viewedArticleIdRef.current = params.id;
      void recordEngagement(EngagementEventType.View);
    }
  }

  async function recordEngagement(type: EngagementEventType) {
    setEventError("");
    setPendingEvent(type);

    const response = await apiFetch(`/articles/${params.id}/events`, {
      method: "POST",
      body: JSON.stringify({
        type,
        userKey: getBrowserUserKey(),
      }),
    });
    const payload = await readApiJson<CreateEngagementEventResponse | { message?: string | string[] }>(response);

    setPendingEvent(null);

    if (!response.ok || !payload || "message" in payload) {
      if (type !== EngagementEventType.View) {
        setEventError(getApiErrorMessage(payload, "互动记录失败，请稍后重试。"));
      }
      return false;
    }

    setEngagement((payload as CreateEngagementEventResponse).stats);
    return true;
  }

  async function togglePositiveEvent(type: EngagementEventType.Like | EngagementEventType.Favorite) {
    if (hasRecordedEngagement(window.localStorage, params.id, type)) return;

    const recorded = await recordEngagement(type);
    if (!recorded) return;

    markEngagementRecorded(window.localStorage, params.id, type);

    if (type === EngagementEventType.Like) setLiked(true);
    if (type === EngagementEventType.Favorite) setFavorited(true);
  }

  function logout() {
    clearAuthSession();
    setUser(null);
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5">
          <Link className="brand-wordmark text-xl" href="/">
            文舟
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {user ? (
              <div className="group relative">
                <Link
                  className="rounded-md bg-[#f6f7f9] px-4 py-2 font-semibold text-[#1f2329] hover:bg-[#eeeeee]"
                  href="/creator"
                >
                  {user.nickname}
                </Link>
                <div className="invisible absolute right-0 top-full z-30 w-40 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100">
                  <div className="rounded-md border border-[#eeeeee] bg-white py-2 shadow-[0_12px_36px_rgba(31,35,41,0.12)]">
                    <Link className="block px-4 py-2 text-[#4e5661] hover:bg-[#fff1f1] hover:text-[#ff4d4f]" href="/workspace">
                      工作台
                    </Link>
                    <Link className="block px-4 py-2 text-[#4e5661] hover:bg-[#fff1f1] hover:text-[#ff4d4f]" href="/drafts">
                      草稿箱
                    </Link>
                    <button
                      className="block w-full px-4 py-2 text-left text-[#4e5661] hover:bg-[#fff1f1] hover:text-[#ff4d4f]"
                      type="button"
                      onClick={logout}
                    >
                      退出登录
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link className="rounded-md bg-[#ff4d4f] px-4 py-2 font-semibold text-white" href="/login">
                登录
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1180px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-h-[calc(100vh-8rem)] bg-white px-8 py-10">
          <button
            aria-label="返回上一页"
            className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-xl text-[#7b8088] hover:bg-[#eeeeee]"
            type="button"
            onClick={() => router.back()}
          >
            ‹
          </button>
          {loading ? (
            <div className="py-16 text-center text-sm text-[#8f959e]">文章加载中...</div>
          ) : error ? (
            <div className="rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
              {error}
            </div>
          ) : article ? (
            <>
              <h1 className="text-[32px] font-semibold leading-tight">{article.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#8f959e]">
                <span>{article.author.nickname}</span>
                <span>{formatTime(article.publishedAt)}</span>
              </div>
              <div className="mt-9 max-w-[820px]">
                <RichTextViewer value={article.body} />
              </div>
            </>
          ) : null}
        </article>

        <aside className="h-fit bg-white px-5 py-6 lg:sticky lg:top-20">
          <h2 className="mb-4 text-base font-semibold">分发反馈</h2>
          <div className="grid gap-3 text-sm text-[#4e5661]">
            <div className="grid grid-cols-3 gap-2 rounded-md bg-[#f8f9fb] p-4 text-center">
              <Metric label="阅读" value={engagement.views} />
              <Metric label="点赞" value={engagement.likes} />
              <Metric label="收藏" value={engagement.favorites} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-md bg-[#ff4d4f] px-4 py-3 text-sm font-semibold text-white disabled:bg-[#f3a5a6]"
                disabled={liked || pendingEvent === EngagementEventType.Like}
                type="button"
                onClick={() => void togglePositiveEvent(EngagementEventType.Like)}
              >
                {liked ? "已点赞" : pendingEvent === EngagementEventType.Like ? "点赞中..." : "点赞"}
              </button>
              <button
                className="rounded-md border border-[#dedede] px-4 py-3 text-sm font-semibold text-[#4e5661] hover:bg-[#f8f8f8] disabled:text-[#a8adb5]"
                disabled={favorited || pendingEvent === EngagementEventType.Favorite}
                type="button"
                onClick={() => void togglePositiveEvent(EngagementEventType.Favorite)}
              >
                {favorited ? "已收藏" : pendingEvent === EngagementEventType.Favorite ? "收藏中..." : "收藏"}
              </button>
            </div>
            {eventError ? (
              <div className="rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
                {eventError}
              </div>
            ) : null}
            <div className="rounded-md bg-[#f8f9fb] p-4">
              <div className="text-xs text-[#8f959e]">排序解释</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <span>热度分：{article?.ranking?.hotScore ?? "--"}</span>
                <span>新鲜度：{article?.ranking?.freshnessScore ?? "--"}</span>
                <span>反馈分：{article?.ranking?.feedbackScore ?? "--"}</span>
                <span>综合分：{article?.ranking?.rankScore ?? "--"}</span>
              </div>
            </div>
            <div className="rounded-md bg-[#f8f9fb] p-4">
              <div className="text-xs text-[#8f959e]">审核摘要</div>
              <div className="mt-2">{article?.latestAudit?.result.summary ?? "暂无审核记录"}</div>
            </div>
            <div className="rounded-md bg-[#f8f9fb] p-4">
              <div className="text-xs text-[#8f959e]">质量总分</div>
              <div className="mt-2 text-3xl font-semibold text-[#ff4d4f]">{article?.latestScore?.overall ?? "--"}</div>
            </div>
            {article?.latestScore ? (
              <div className="rounded-md bg-[#f8f9fb] p-4">
                <div className="text-xs text-[#8f959e]">优化建议</div>
                <div className="mt-2 space-y-2">
                  {article.latestScore.suggestions.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-[#8f959e]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[#1f2329]">{value}</div>
    </div>
  );
}

function getBrowserUserKey() {
  const key = "aigc_creator_browser_key";

  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;

    const created = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return "anonymous-browser";
  }
}
