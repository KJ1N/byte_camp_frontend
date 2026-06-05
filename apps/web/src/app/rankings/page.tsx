"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ArticleListItem, CursorPageResponse } from "@bytecamp-aigc/shared";
import { clearAuthSession, getStoredUser, type AuthUser } from "@/lib/auth";
import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { markArticleViewIntent } from "@/lib/engagement-state";

type RankingTab = "hot" | "top";
type PageState = "loading" | "ready" | "empty" | "error";

function getInitialTab(): RankingTab {
  if (typeof window === "undefined") return "hot";
  return new URLSearchParams(window.location.search).get("tab") === "top" ? "top" : "hot";
}

function tabLabel(tab: RankingTab) {
  return tab === "hot" ? "热点榜" : "爆文榜";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function RankingsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tab, setTab] = useState<RankingTab>("hot");
  const [items, setItems] = useState<ArticleListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [state, setState] = useState<PageState>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const initialTab = getInitialTab();
    setUser(getStoredUser());
    setTab(initialTab);
    void loadRanking(initialTab, true);
  }, []);

  async function switchTab(nextTab: RankingTab) {
    if (nextTab === tab) return;
    setTab(nextTab);
    window.history.replaceState(null, "", `/rankings?tab=${nextTab}`);
    await loadRanking(nextTab, true);
  }

  async function loadRanking(targetTab: RankingTab, reset = false, cursor?: string) {
    if (reset) {
      setState("loading");
      setError("");
    }

    const response = await apiFetch(`/rankings/${targetTab}?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    const payload = await readApiJson<CursorPageResponse<ArticleListItem> | { message?: string | string[] }>(response);

    if (!response.ok || !payload || "message" in payload) {
      setError(getApiErrorMessage(payload, "榜单加载失败，请稍后重试。"));
      setState("error");
      return;
    }

    const page = payload as CursorPageResponse<ArticleListItem>;
    setItems((current) => (reset ? page.items : [...current, ...page.items]));
    setNextCursor(page.nextCursor);
    setState(page.items.length || !reset ? "ready" : "empty");
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await loadRanking(tab, false, nextCursor);
    setLoadingMore(false);
  }

  function logout() {
    clearAuthSession();
    setUser(null);
  }
  
  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5">
          <Link className="text-lg font-semibold text-[#ff4d4f]" href="/">
            AI Creator Hub
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

      <section className="mx-auto max-w-[1180px] px-5 py-6">
        <div className="bg-white">
          <div className="border-b border-[#eeeeee] px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#ff4d4f]">内容分发</p>
                <h1 className="mt-2 text-2xl font-semibold">{tabLabel(tab)}</h1>
              </div>
              <div className="flex rounded-md border border-[#dedede] bg-[#f8f9fb] p-1">
                <button
                  className={`rounded px-4 py-2 text-sm font-semibold ${tab === "hot" ? "bg-white text-[#ff4d4f] shadow-sm" : "text-[#5d6673]"}`}
                  type="button"
                  onClick={() => void switchTab("hot")}
                >
                  热点榜
                </button>
                <button
                  className={`rounded px-4 py-2 text-sm font-semibold ${tab === "top" ? "bg-white text-[#ff4d4f] shadow-sm" : "text-[#5d6673]"}`}
                  type="button"
                  onClick={() => void switchTab("top")}
                >
                  爆文榜
                </button>
              </div>
            </div>
          </div>

          {state === "loading" ? (
            <div className="px-6 py-16 text-center text-sm text-[#8f959e]">榜单加载中...</div>
          ) : state === "error" ? (
            <div className="px-6 py-10">
              <div className="rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
                {error}
              </div>
              <button className="mt-4 rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => void loadRanking(tab, true)}>
                重试
              </button>
            </div>
          ) : state === "empty" ? (
            <div className="px-6 py-16 text-center text-sm text-[#8f959e]">暂无榜单内容</div>
          ) : (
            <>
              <div className="divide-y divide-[#eeeeee]">
                {items.map((item, index) => (
                  <RankingRow item={item} key={item.id} rank={index + 1} />
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
      </section>
    </main>
  );
}

function RankingRow({ item, rank }: { item: ArticleListItem; rank: number }) {
  return (
    <Link
      className="grid gap-5 px-6 py-5 transition hover:bg-[#fafafa] md:grid-cols-[48px_minmax(0,1fr)_220px]"
      href={`/articles/${item.id}`}
      onClick={() => markArticleViewIntent(window.sessionStorage, item.id)}
    >
      <div className="text-2xl font-semibold text-[#ff4d4f]">{rank}</div>
      <article>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-[#8f959e]">
          <span>{item.author.nickname}</span>
          <span>{formatTime(item.publishedAt)}</span>
        </div>
        <h2 className="text-lg font-semibold leading-7">{item.title}</h2>
        <p className="mt-2 text-sm leading-7 text-[#5d6673]">{item.summary}</p>
      </article>
      <div className="grid grid-cols-2 gap-3 text-sm md:text-right">
        <Metric label="排序分" value={item.ranking.rankScore} />
        <Metric label="质量分" value={item.qualityScore} />
        <Metric label="阅读" value={item.engagement.views} />
        <Metric label="点赞/收藏" value={`${item.engagement.likes}/${item.engagement.favorites}`} />
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xs text-[#8f959e]">{label}</div>
      <div className="mt-1 font-semibold text-[#1f2329]">{value}</div>
    </div>
  );
}
