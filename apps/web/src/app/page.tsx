"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ArticleListItem, CursorPageResponse } from "@bytecamp-aigc/shared";

import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { clearAuthSession, getStoredUser, type AuthUser } from "@/lib/auth";
import { markArticleViewIntent } from "@/lib/engagement-state";
import { getRankingGuidance, type RankingGuidanceKind } from "@/lib/ranking-guidance";

type PageState = "loading" | "ready" | "empty" | "error";

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ContentHomePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [feed, setFeed] = useState<ArticleListItem[]>([]);
  const [hotRankings, setHotRankings] = useState<ArticleListItem[]>([]);
  const [topRankings, setTopRankings] = useState<ArticleListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [state, setState] = useState<PageState>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setUser(getStoredUser());
    void loadHome();
  }, []);

  async function loadHome() {
    setState("loading");
    setError("");

    const [feedResult, hotResult, topResult] = await Promise.all([
      requestArticlePage("/feed?limit=6"),
      requestArticlePage("/rankings/hot?limit=5"),
      requestArticlePage("/rankings/top?limit=5"),
    ]);

    if (!feedResult.ok || !hotResult.ok || !topResult.ok) {
      setError(feedResult.error || hotResult.error || topResult.error || "首页内容加载失败，请稍后重试。");
      setState("error");
      return;
    }

    const feedItems = feedResult.data?.items ?? [];
    setFeed(feedItems);
    setHotRankings(hotResult.data?.items ?? []);
    setTopRankings(topResult.data?.items ?? []);
    setNextCursor(feedResult.data?.nextCursor);
    setState(feedItems.length ? "ready" : "empty");
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    const result = await requestArticlePage(`/feed?limit=6&cursor=${encodeURIComponent(nextCursor)}`);
    setLoadingMore(false);

    if (!result.ok || !result.data) {
      setError(result.error || "加载更多失败，请稍后重试。");
      return;
    }

    setFeed((current) => [...current, ...result.data.items]);
    setNextCursor(result.data.nextCursor);
  }

  function logout() {
    clearAuthSession();
    setUser(null);
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5">
          <Link className="text-lg font-semibold" href="/">
            AI Creator Hub
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-[#4e5661] md:flex">
            <a className="font-semibold text-[#1f2329]" href="#feed">
              推荐
            </a>
            <Link href="/rankings?tab=hot">热点榜</Link>
            <Link href="/rankings?tab=top">爆文榜</Link>
            <Link href="/docs">文档</Link>
          </nav>

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

      <section className="mx-auto grid max-w-[1280px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div id="feed" className="bg-white">
          <div className="border-b border-[#eeeeee] px-6 py-6">
            <p className="text-sm font-semibold text-[#ff4d4f]">推荐内容</p>
            <h1 className="mt-2 text-3xl font-semibold">发现正在被阅读和互动的 AI 图文内容</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#6b7280]">
              首页内容来自后端发布文章、质量评分和互动数据，读者侧浏览会继续反馈到榜单排序。
            </p>
          </div>

          {state === "loading" ? (
            <div className="px-6 py-16 text-center text-sm text-[#8f959e]">推荐内容加载中...</div>
          ) : state === "error" ? (
            <div className="px-6 py-10">
              <div className="rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
                {error}
              </div>
              <button className="mt-4 rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => void loadHome()}>
                重试
              </button>
            </div>
          ) : state === "empty" ? (
            <div className="px-6 py-16 text-center">
              <div className="text-base font-semibold">暂无已发布文章</div>
              <p className="mt-3 text-sm text-[#8f959e]">从工作台完成创作、审核和发布后，文章会进入这里。</p>
              <Link className="mt-5 inline-flex rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white" href="/workspace">
                去创作
              </Link>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#eeeeee]">
                {feed.map((article) => (
                  <ArticleRow article={article} key={article.id} />
                ))}
              </div>
              <div className="border-t border-[#eeeeee] px-6 py-5 text-center">
                {nextCursor ? (
                  <button
                    className="rounded-md border border-[#dedede] px-5 py-2 text-sm font-semibold text-[#4e5661] hover:bg-[#f8f8f8] disabled:text-[#a8adb5]"
                    disabled={loadingMore}
                    type="button"
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? "加载中..." : "加载更多"}
                  </button>
                ) : (
                  <span className="text-sm text-[#8f959e]">没有更多内容了</span>
                )}
              </div>
            </>
          )}
        </div>

        <aside id="rankings" className="space-y-5">
          <RankingPanel href="/rankings?tab=hot" items={hotRankings} kind="hot" title="热点榜" />
          <RankingPanel href="/rankings?tab=top" items={topRankings} kind="top" title="爆文榜" />

          <div className="bg-white px-5 py-5">
            <h2 className="text-lg font-semibold">创作者入口</h2>
            <p className="mt-3 text-sm leading-7 text-[#6b7280]">
              登录后点击右上角昵称，可进入工作台或草稿箱。创作、审核和发布能力不会放在首页直接暴露。
            </p>
            <Link className="mt-5 inline-flex rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white" href="/workspace">
              进入工作台
            </Link>
          </div>
        </aside>
      </section>
    </main>
  );
}

async function requestArticlePage(path: string) {
  const response = await apiFetch(path);
  const payload = await readApiJson<CursorPageResponse<ArticleListItem> | { message?: string | string[] }>(response);

  if (!response.ok || !payload || "message" in payload) {
    return {
      ok: false,
      error: getApiErrorMessage(payload, "内容加载失败，请稍后重试。"),
      data: null,
    };
  }

  return {
    ok: true,
    error: "",
    data: payload as CursorPageResponse<ArticleListItem>,
  };
}

function ArticleRow({ article }: { article: ArticleListItem }) {
  return (
    <Link
      className="grid gap-5 px-6 py-6 transition hover:bg-[#fafafa] md:grid-cols-[minmax(0,1fr)_132px]"
      href={`/articles/${article.id}`}
      onClick={() => markArticleViewIntent(window.sessionStorage, article.id)}
    >
      <article>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded bg-[#fff1f1] px-2 py-1 font-semibold text-[#ff4d4f]">质量分 {article.qualityScore}</span>
          <span className="text-[#8f959e]">{article.author.nickname}</span>
          <span className="text-[#8f959e]">{formatTime(article.publishedAt)}</span>
        </div>
        <h2 className="text-xl font-semibold leading-8">{article.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5d6673]">{article.summary}</p>
      </article>
      <div className="flex items-end justify-between gap-4 md:block md:text-right">
        <div>
          <div className="text-sm text-[#8f959e]">排序分</div>
          <div className="mt-1 text-2xl font-semibold text-[#1f2329]">{article.ranking.rankScore}</div>
        </div>
        <div className="mt-4 text-sm text-[#8f959e]">{formatCount(article.engagement.views)} 阅读</div>
      </div>
    </Link>
  );
}

function RankingPanel({ href, items, kind, title }: { href: string; items: ArticleListItem[]; kind: RankingGuidanceKind; title: string }) {
  const guidance = getRankingGuidance(kind);

  return (
    <div className="bg-white px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link className="text-xs text-[#8f959e] hover:text-[#ff4d4f]" href={href}>
          查看全部
        </Link>
      </div>
      <div className="mb-4 rounded-md border border-[#eeeeee] bg-[#fafafa] px-3 py-3">
        <div className="text-xs font-semibold text-[#4e5661]">{guidance.title}</div>
        <p className="mt-2 text-xs leading-5 text-[#6b7280]">{guidance.algorithm}</p>
        <p className="mt-2 text-xs leading-5 text-[#8f959e]">创作者指引：{guidance.creatorTip}</p>
      </div>
      <div className="grid gap-3">
        {items.length ? (
          items.map((item, index) => (
            <Link
              className="flex gap-3 rounded-md border border-[#eeeeee] px-3 py-3 hover:bg-[#fafafa]"
              href={`/articles/${item.id}`}
              key={item.id}
              onClick={() => markArticleViewIntent(window.sessionStorage, item.id)}
            >
              <span className="font-semibold text-[#ff4d4f]">{index + 1}</span>
              <div>
                <div className="text-sm font-semibold leading-6">{item.title}</div>
                <div className="mt-1 text-xs text-[#8f959e]">
                  热度 {item.ranking.hotScore} · 质量 {item.qualityScore}
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-md border border-[#eeeeee] px-3 py-6 text-center text-sm text-[#8f959e]">暂无榜单内容</div>
        )}
      </div>
    </div>
  );
}
