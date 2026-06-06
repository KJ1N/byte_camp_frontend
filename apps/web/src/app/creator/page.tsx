"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  CreatorInspiration,
  CreatorInspirationsResponse,
  CreatorOverviewResponse,
  CreatorWorkItem,
} from "@bytecamp-aigc/shared";

import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";
import {
  formatCreatorMetric,
  getCreatorWorkStatusLabel,
  getEmptyCreatorStats,
  sortCreatorWorksByPublishedTime,
} from "@/lib/creator-overview";
import { buildWorkspaceTopicHref } from "@/lib/workspace-topic";

type LoadState = "loading" | "idle";
type ActiveSection = "overview" | "works";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isCreatorInspirationsResponse(payload: unknown): payload is CreatorInspirationsResponse {
  return Boolean(payload && typeof payload === "object" && "items" in payload && Array.isArray(payload.items));
}

function isCreatorOverviewResponse(payload: unknown): payload is CreatorOverviewResponse {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "stats" in payload &&
      "recentDrafts" in payload &&
      "works" in payload,
  );
}

export default function CreatorHomePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [overview, setOverview] = useState<CreatorOverviewResponse | null>(null);
  const [inspirations, setInspirations] = useState<CreatorInspiration[]>([]);
  const [status, setStatus] = useState<LoadState>("loading");
  const [activeSection, setActiveSection] = useState<ActiveSection>("overview");
  const [overviewError, setOverviewError] = useState("");
  const [inspirationError, setInspirationError] = useState("");
  const [managementOpen, setManagementOpen] = useState(true);

  useEffect(() => {
    const storedToken = getStoredToken();
    const storedUser = getStoredUser();
    setToken(storedToken);
    setUser(storedUser);

    if (!storedToken) {
      setStatus("idle");
      return;
    }

    void loadCreatorData(storedToken);
  }, []);

  const stats = overview?.stats ?? getEmptyCreatorStats();
  const recentDrafts = overview?.recentDrafts ?? [];
  const works = useMemo(() => sortCreatorWorksByPublishedTime(overview?.works ?? []), [overview?.works]);

  async function loadCreatorData(authToken: string) {
    setStatus("loading");
    setOverviewError("");
    setInspirationError("");

    const [overviewResponse, inspirationResponse] = await Promise.all([
      apiFetch("/users/me/creator-overview", { authToken }),
      apiFetch("/ai/creator-inspirations", { authToken }),
    ]);

    if (overviewResponse.status === 401 || inspirationResponse.status === 401) {
      clearAuthSession();
      setToken(null);
      setUser(null);
      setOverview(null);
      setInspirations([]);
      setStatus("idle");
      return;
    }

    const overviewPayload = await readApiJson<CreatorOverviewResponse | { message?: string | string[] }>(
      overviewResponse,
    );
    const inspirationPayload = await readApiJson<CreatorInspirationsResponse | { message?: string | string[] }>(
      inspirationResponse,
    );

    if (!overviewResponse.ok || !isCreatorOverviewResponse(overviewPayload)) {
      setOverview(null);
      setOverviewError(getApiErrorMessage(overviewPayload, "创作者数据加载失败，请稍后重试。"));
    } else {
      setOverview(overviewPayload);
      setUser((current) => current ?? { id: overviewPayload.user.id, email: "", nickname: overviewPayload.user.nickname });
    }

    if (!inspirationResponse.ok || !isCreatorInspirationsResponse(inspirationPayload)) {
      setInspirationError(getApiErrorMessage(inspirationPayload, "创作灵感加载失败，请稍后重试。"));
      setInspirations([]);
    } else {
      setInspirations(inspirationPayload.items);
    }

    setStatus("idle");
  }

  function logout() {
    clearAuthSession();
    setToken(null);
    setUser(null);
    setOverview(null);
    setInspirations([]);
    setOverviewError("");
    setInspirationError("");
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-30 border-b border-[#ededed] bg-white">
        <div className="mx-auto grid h-16 max-w-[1500px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 lg:grid-cols-[220px_minmax(0,1fr)_380px]">
          <Link className="justify-self-start text-2xl font-black tracking-tight text-[#ff3b3f]" href="/">
            创作者主页
          </Link>
          <div className="justify-self-end lg:col-start-3">
            {user ? (
              <div className="group relative">
                <Link
                  className="rounded-md bg-[#f6f7f9] px-4 py-2 text-sm font-semibold text-[#1f2329] hover:bg-[#eeeeee]"
                  href="/creator"
                >
                  {user.nickname}
                </Link>
                <div className="invisible absolute right-0 top-full z-40 w-40 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100">
                  <div className="rounded-md border border-[#eeeeee] bg-white py-2 shadow-[0_12px_36px_rgba(31,35,41,0.12)]">
                    <Link className="block px-4 py-2 text-sm text-[#4e5661] hover:bg-[#fff1f1] hover:text-[#ff4d4f]" href="/workspace">
                      工作台
                    </Link>
                    <Link className="block px-4 py-2 text-sm text-[#4e5661] hover:bg-[#fff1f1] hover:text-[#ff4d4f]" href="/drafts">
                      草稿箱
                    </Link>
                    <button
                      className="block w-full px-4 py-2 text-left text-sm text-[#4e5661] hover:bg-[#fff1f1] hover:text-[#ff4d4f]"
                      type="button"
                      onClick={logout}
                    >
                      退出登录
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link className="rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white" href="/login">
                登录
              </Link>
            )}
          </div>
        </div>
      </header>

      {!token ? (
        <section className="mx-auto max-w-[760px] px-5 py-20 text-center">
          <div className="rounded-lg border border-[#eeeeee] bg-white px-8 py-14">
            <h1 className="text-2xl font-semibold">登录后进入创作者主页</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[#6b7280]">
              创作者主页会汇总草稿动态、已发布作品、互动数据和 AI 灵感建议，先登录即可继续。
            </p>
            <Link className="mt-6 inline-flex rounded-md bg-[#ff4d4f] px-5 py-3 text-sm font-semibold text-white" href="/login">
              去登录
            </Link>
          </div>
        </section>
      ) : (
        <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:grid-cols-[220px_minmax(0,1fr)_380px]">
          <aside className="h-fit rounded-lg bg-white py-4 lg:sticky lg:top-20">
            <nav className="grid gap-1 px-3 text-[15px]">
              <button
                className={[
                  "rounded-md px-4 py-3 text-left font-semibold",
                  activeSection === "overview" ? "bg-[#fff1f1] text-[#ff4d4f]" : "text-[#4e5661] hover:bg-[#f6f7f9]",
                ].join(" ")}
                type="button"
                onClick={() => setActiveSection("overview")}
              >
                主页
              </button>
              <Link className="rounded-md px-4 py-3 font-semibold text-[#4e5661] hover:bg-[#f6f7f9]" href="/workspace">
                创作
              </Link>
              <button
                className="flex items-center justify-between rounded-md px-4 py-3 text-left font-semibold text-[#4e5661] hover:bg-[#f6f7f9]"
                type="button"
                onClick={() => setManagementOpen((current) => !current)}
              >
                <span>管理</span>
                <span className="text-[#a8adb5]">{managementOpen ? "收起" : "展开"}</span>
              </button>
              {managementOpen ? (
                <div className="ml-3 grid gap-1 border-l border-[#eeeeee] pl-3 text-sm">
                  <button
                    className={[
                      "rounded-md px-3 py-2 text-left",
                      activeSection === "works" ? "bg-[#fff1f1] font-semibold text-[#ff4d4f]" : "text-[#4e5661] hover:bg-[#f6f7f9]",
                    ].join(" ")}
                    type="button"
                    onClick={() => setActiveSection("works")}
                  >
                    作品管理
                  </button>
                  <Link className="rounded-md px-3 py-2 text-[#4e5661] hover:bg-[#f6f7f9]" href="/drafts">
                    草稿箱列表
                  </Link>
                </div>
              ) : null}
            </nav>
          </aside>

          <section className="grid gap-5">
            {overviewError ? (
              <div className="rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]" role="alert">
                <div>{overviewError}</div>
                <button
                  className="mt-2 rounded-md bg-[#ff4d4f] px-3 py-1.5 text-xs font-semibold text-white"
                  type="button"
                  onClick={() => token && void loadCreatorData(token)}
                >
                  重试
                </button>
              </div>
            ) : null}

            {activeSection === "overview" ? (
              <div className="rounded-lg bg-white px-6 py-7">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-semibold">数据概览</h1>
                    <p className="mt-1 text-sm text-[#8f959e]">发布后的阅读、互动和质量分会回流到这里。</p>
                  </div>
                  <Link className="rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white" href="/workspace">
                    新建创作
                  </Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <MetricCard label="总阅读量" value={formatCreatorMetric(stats.totalViews)} hint="来自文章详情页阅读事件" />
                  <MetricCard label="已发布作品" value={formatCreatorMetric(stats.publishedArticles)} hint={`${stats.draftCount} 篇草稿待继续`} />
                  <MetricCard label="点赞 / 收藏" value={`${formatCreatorMetric(stats.totalLikes)} / ${formatCreatorMetric(stats.totalFavorites)}`} hint="读者正反馈" />
                  <MetricCard label="平均质量分" value={formatCreatorMetric(stats.averageQualityScore)} hint="按有评分作品计算" />
                  <MetricCard label="草稿数" value={formatCreatorMetric(stats.draftCount)} hint="可回到草稿箱继续编辑" />
                  <MetricCard label="粉丝数" value={formatCreatorMetric(stats.followers)} hint="MVP 阶段暂未接入粉丝模型" />
                </div>

                <div className="mt-8 border-t border-[#eeeeee] pt-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-semibold">最近草稿动态</h2>
                    <Link className="text-sm font-medium text-[#ff4d4f]" href="/drafts">
                      查看草稿箱
                    </Link>
                  </div>
                  {status === "loading" ? (
                    <div className="py-10 text-center text-sm text-[#8f959e]">加载创作者数据中...</div>
                  ) : null}
                  {status === "idle" && !recentDrafts.length ? (
                    <div className="rounded-md border border-dashed border-[#dedede] px-5 py-10 text-center">
                      <div className="text-base font-semibold">还没有草稿</div>
                      <p className="mt-2 text-sm text-[#8f959e]">从一个创作灵感或工作台主题开始，生成你的第一篇内容。</p>
                    </div>
                  ) : null}
                  {recentDrafts.length ? (
                    <div className="grid gap-4">
                      {recentDrafts.slice(0, 5).map((draft) => (
                        <Link
                          className="grid gap-3 rounded-md bg-[#fafafa] px-4 py-4 transition hover:bg-[#f5f5f5] sm:grid-cols-[minmax(0,1fr)_110px]"
                          href={`/drafts/${draft.id}`}
                          key={draft.id}
                        >
                          <div>
                            <div className="line-clamp-1 font-semibold">{draft.title}</div>
                            <div className="mt-2 text-sm text-[#8f959e]">{formatTime(draft.updatedAt)} 更新草稿</div>
                          </div>
                          <div className="text-sm text-[#8f959e] sm:text-right">v{draft.version}</div>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <WorksPanel works={works} visible={activeSection === "works" || activeSection === "overview"} />
          </section>

          <aside className="h-fit rounded-lg bg-white px-5 py-6 lg:sticky lg:top-20">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">创作灵感</h2>
              <button
                className="rounded-md px-2 py-1 text-sm font-medium text-[#8f959e] hover:bg-[#f6f7f9]"
                type="button"
                onClick={() => token && void loadCreatorData(token)}
              >
                换一组
              </button>
            </div>
            {inspirationError ? (
              <div className="mb-4 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-3 py-2 text-sm text-[#d92d2d]">
                {inspirationError}
              </div>
            ) : null}
            {status === "loading" && !inspirations.length ? (
              <div className="py-10 text-center text-sm text-[#8f959e]">AI 正在生成灵感...</div>
            ) : null}
            <div className="grid gap-2">
              {inspirations.map((item) => (
                <button
                  className="group rounded-md border border-transparent px-2 py-4 text-left transition hover:border-[#ffd2d3] hover:bg-[#fff7f7]"
                  key={item.id}
                  type="button"
                  onClick={() => router.push(buildWorkspaceTopicHref(item.topic))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold leading-7 text-[#1f2329]">#{item.topic}#</div>
                      <div className="mt-1 text-xs font-medium text-[#ff4d4f]">{item.category}</div>
                      <p className="mt-2 text-sm leading-6 text-[#6b7280]">{item.reason}</p>
                    </div>
                    <span className="pt-1 text-xl text-[#a8adb5] group-hover:text-[#ff4d4f]">›</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-[#eeeeee] bg-[#fbfbfb] px-4 py-4">
      <div className="text-sm font-medium text-[#8f959e]">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-[#1f2329]">{value}</div>
      <div className="mt-3 text-xs leading-5 text-[#8f959e]">{hint}</div>
    </div>
  );
}

function WorksPanel({ works, visible }: { works: CreatorWorkItem[]; visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="rounded-lg bg-white px-6 py-7" id="works">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">作品管理</h2>
          <p className="mt-1 text-sm text-[#8f959e]">已发布内容会展示质量分和读者互动，用于后续复盘优化。</p>
        </div>
        <Link className="rounded-md border border-[#ffb6b7] px-4 py-2 text-sm font-semibold text-[#ff4d4f] hover:bg-[#fff1f1]" href="/workspace">
          去工作台创作
        </Link>
      </div>

      {!works.length ? (
        <div className="rounded-md border border-dashed border-[#dedede] px-5 py-12 text-center">
          <div className="text-base font-semibold">还没有发布作品</div>
          <p className="mt-2 text-sm text-[#8f959e]">完成草稿编辑并通过审核评分后，作品会出现在这里。</p>
          <Link className="mt-5 inline-flex rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white" href="/workspace">
            开始创作
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {works.map((work) => (
            <article className="rounded-md border border-[#eeeeee] bg-[#fbfbfb] px-4 py-4" key={work.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="line-clamp-1 text-base font-semibold">{work.title}</h3>
                    <span className="rounded-md bg-[#fff1f1] px-2 py-1 text-xs font-medium text-[#ff4d4f]">
                      {getCreatorWorkStatusLabel(work.status)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm leading-6 text-[#6b7280]">{work.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#8f959e]">
                    <span>{formatTime(work.publishedAt)} 发布</span>
                    <span>质量分 {work.qualityScore}</span>
                    <span>阅读 {formatCreatorMetric(work.engagement.views)}</span>
                    <span>点赞 {formatCreatorMetric(work.engagement.likes)}</span>
                    <span>收藏 {formatCreatorMetric(work.engagement.favorites)}</span>
                  </div>
                </div>
                <Link
                  className="shrink-0 rounded-md bg-[#ff4d4f] px-3 py-2 text-sm font-semibold text-white hover:bg-[#f04446]"
                  href={`/articles/${work.id}`}
                >
                  查看详情
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
