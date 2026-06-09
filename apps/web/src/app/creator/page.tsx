"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  CreatorContentItem,
  CreatorInspiration,
  CreatorInspirationsResponse,
  CreatorOverviewResponse,
  DeleteDraftResponse,
  WithdrawArticleResponse,
} from "@bytecamp-aigc/shared";

import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";
import {
  filterCreatorContents,
  formatCreatorMetric,
  getCreatorContentActions,
  getCreatorContentStatusLabel,
  getEmptyCreatorStats,
  sortCreatorContentsByUpdatedTime,
  type CreatorContentFilter,
} from "@/lib/creator-overview";
import { buildWorkspaceTopicHref } from "@/lib/workspace-topic";

type LoadState = "loading" | "idle";
type ActiveSection = "overview" | "contents";

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
      "works" in payload &&
      "contents" in payload,
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
  const [contentFilter, setContentFilter] = useState<CreatorContentFilter>("all");
  const [overviewError, setOverviewError] = useState("");
  const [inspirationError, setInspirationError] = useState("");
  const [withdrawError, setWithdrawError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [pendingWithdrawArticleId, setPendingWithdrawArticleId] = useState("");
  const [pendingDeleteDraftId, setPendingDeleteDraftId] = useState("");
  const [withdrawingArticleId, setWithdrawingArticleId] = useState("");
  const [deletingDraftId, setDeletingDraftId] = useState("");
  const [creationOpen, setCreationOpen] = useState(true);
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
  const contents = useMemo(() => sortCreatorContentsByUpdatedTime(overview?.contents ?? []), [overview?.contents]);
  const filteredContents = useMemo(() => filterCreatorContents(contents, contentFilter), [contents, contentFilter]);

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
    setWithdrawError("");
    setDeleteError("");
    setPendingWithdrawArticleId("");
    setPendingDeleteDraftId("");
    setWithdrawingArticleId("");
    setDeletingDraftId("");
  }

  async function withdrawArticle(articleId: string) {
    if (!token) return;

    setWithdrawError("");
    setWithdrawingArticleId(articleId);

    const response = await apiFetch(`/articles/${articleId}/withdraw`, {
      authToken: token,
      method: "POST",
    });
    const payload = await readApiJson<WithdrawArticleResponse | { message?: string | string[] }>(response);

    setWithdrawingArticleId("");

    if (response.status === 401) {
      clearAuthSession();
      setToken(null);
      setUser(null);
      setOverview(null);
      return;
    }

    if (!response.ok) {
      setWithdrawError(getApiErrorMessage(payload, "撤回失败，请稍后重试。"));
      return;
    }

    setPendingWithdrawArticleId("");
    await loadCreatorData(token);
  }

  async function deleteContent(draftId: string) {
    if (!token) return;

    setDeleteError("");
    setDeletingDraftId(draftId);

    const response = await apiFetch(`/drafts/${draftId}`, {
      authToken: token,
      method: "DELETE",
    });
    const payload = await readApiJson<DeleteDraftResponse | { message?: string | string[] }>(response);

    setDeletingDraftId("");

    if (response.status === 401) {
      clearAuthSession();
      setToken(null);
      setUser(null);
      setOverview(null);
      return;
    }

    if (!response.ok) {
      setDeleteError(getApiErrorMessage(payload, "删除失败，请稍后重试。"));
      return;
    }

    setPendingDeleteDraftId("");
    await loadCreatorData(token);
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
              <button
                className="flex items-center justify-between rounded-md px-4 py-3 text-left font-semibold text-[#4e5661] hover:bg-[#f6f7f9]"
                type="button"
                onClick={() => setCreationOpen((current) => !current)}
              >
                <span>创作</span>
                <span className="text-[#a8adb5]">{creationOpen ? "收起" : "展开"}</span>
              </button>
              {creationOpen ? (
                <div className="ml-3 grid gap-1 border-l border-[#eeeeee] pl-3 text-sm">
                  <Link className="rounded-md px-3 py-2 text-[#4e5661] hover:bg-[#f6f7f9]" href="/workspace">
                    文章工作台
                  </Link>
                  <Link className="rounded-md px-3 py-2 text-[#4e5661] hover:bg-[#f6f7f9]" href="/multimodal-workspace">
                    多模态生成
                  </Link>
                </div>
              ) : null}
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
                      activeSection === "contents" ? "bg-[#fff1f1] font-semibold text-[#ff4d4f]" : "text-[#4e5661] hover:bg-[#f6f7f9]",
                    ].join(" ")}
                    type="button"
                    onClick={() => setActiveSection("contents")}
                  >
                    我的内容
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

            <ContentPanel
              contents={filteredContents}
              deleteError={deleteError}
              deletingDraftId={deletingDraftId}
              filter={contentFilter}
              pendingDeleteDraftId={pendingDeleteDraftId}
              pendingWithdrawArticleId={pendingWithdrawArticleId}
              visible={activeSection === "contents" || activeSection === "overview"}
              withdrawError={withdrawError}
              withdrawingArticleId={withdrawingArticleId}
              onCancelDelete={() => setPendingDeleteDraftId("")}
              onCancelWithdraw={() => setPendingWithdrawArticleId("")}
              onDelete={(draftId) => void deleteContent(draftId)}
              onFilterChange={setContentFilter}
              onRequestDelete={setPendingDeleteDraftId}
              onRequestWithdraw={setPendingWithdrawArticleId}
              onWithdraw={(articleId) => void withdrawArticle(articleId)}
            />
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

const contentFilters: Array<{ id: CreatorContentFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "draft", label: "草稿" },
  { id: "published", label: "已发布" },
  { id: "withdrawn", label: "已撤回" },
];

function ContentPanel({
  contents,
  deleteError,
  deletingDraftId,
  filter,
  pendingDeleteDraftId,
  pendingWithdrawArticleId,
  visible,
  withdrawError,
  withdrawingArticleId,
  onCancelDelete,
  onCancelWithdraw,
  onDelete,
  onFilterChange,
  onRequestDelete,
  onRequestWithdraw,
  onWithdraw,
}: {
  contents: CreatorContentItem[];
  deleteError: string;
  deletingDraftId: string;
  filter: CreatorContentFilter;
  pendingDeleteDraftId: string;
  pendingWithdrawArticleId: string;
  visible: boolean;
  withdrawError: string;
  withdrawingArticleId: string;
  onCancelDelete: () => void;
  onCancelWithdraw: () => void;
  onDelete: (draftId: string) => void;
  onFilterChange: (filter: CreatorContentFilter) => void;
  onRequestDelete: (draftId: string) => void;
  onRequestWithdraw: (articleId: string) => void;
  onWithdraw: (articleId: string) => void;
}) {
  if (!visible) return null;

  return (
    <div className="rounded-lg bg-white px-6 py-7" id="works">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">我的内容</h2>
          <p className="mt-1 text-sm text-[#8f959e]">统一管理草稿、已发布和已撤回内容，二次编辑仍需重新审核。</p>
        </div>
        <Link className="rounded-md border border-[#ffb6b7] px-4 py-2 text-sm font-semibold text-[#ff4d4f] hover:bg-[#fff1f1]" href="/workspace">
          去工作台创作
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {contentFilters.map((item) => (
          <button
            className={[
              "rounded-md border px-3 py-2 text-sm font-semibold",
              filter === item.id
                ? "border-[#ff4d4f] bg-[#fff1f1] text-[#ff4d4f]"
                : "border-[#eeeeee] bg-white text-[#4e5661] hover:bg-[#f6f7f9]",
            ].join(" ")}
            key={item.id}
            type="button"
            onClick={() => onFilterChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {withdrawError ? (
        <div className="mb-4 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]" role="alert">
          {withdrawError}
        </div>
      ) : null}

      {deleteError ? (
        <div className="mb-4 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]" role="alert">
          {deleteError}
        </div>
      ) : null}

      {!contents.length ? (
        <div className="rounded-md border border-dashed border-[#dedede] px-5 py-12 text-center">
          <div className="text-base font-semibold">当前筛选下没有内容</div>
          <p className="mt-2 text-sm text-[#8f959e]">可以从工作台创建草稿，发布通过后会进入统一管理列表。</p>
          <Link className="mt-5 inline-flex rounded-md bg-[#ff4d4f] px-4 py-2 text-sm font-semibold text-white" href="/workspace">
            开始创作
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {contents.map((content) => (
            <article className="rounded-md border border-[#eeeeee] bg-[#fbfbfb] px-4 py-4" key={content.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="line-clamp-1 text-base font-semibold">{content.title}</h3>
                    <span className="rounded-md bg-[#fff1f1] px-2 py-1 text-xs font-medium text-[#ff4d4f]">
                      {getCreatorContentStatusLabel(content.status)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm leading-6 text-[#6b7280]">{content.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#8f959e]">
                    {content.publishedAt ? <span>{formatTime(content.publishedAt)} 发布</span> : null}
                    <span>{formatTime(content.updatedAt)} 更新</span>
                    {content.qualityScore !== undefined ? <span>质量分 {content.qualityScore}</span> : null}
                    {content.engagement ? (
                      <>
                        <span>阅读 {formatCreatorMetric(content.engagement.views)}</span>
                        <span>点赞 {formatCreatorMetric(content.engagement.likes)}</span>
                        <span>收藏 {formatCreatorMetric(content.engagement.favorites)}</span>
                      </>
                    ) : null}
                  </div>
                  {pendingWithdrawArticleId && pendingWithdrawArticleId === content.articleId ? (
                    <div className="mt-4 rounded-md border border-[#ffd4d4] bg-white px-3 py-3 text-sm text-[#4e5661]">
                      <div>撤回后读者将无法继续访问这篇文章，确认撤回？</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-md bg-[#ff4d4f] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={withdrawingArticleId === content.articleId}
                          type="button"
                          onClick={() => content.articleId && onWithdraw(content.articleId)}
                        >
                          {withdrawingArticleId === content.articleId ? "撤回中..." : "确认撤回"}
                        </button>
                        <button
                          className="rounded-md border border-[#dedede] px-3 py-2 text-sm font-semibold text-[#4e5661] hover:bg-[#f6f7f9]"
                          type="button"
                          onClick={onCancelWithdraw}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {getCreatorContentActions(content).filter((action) => action.kind !== "delete").map((action) => {
                    if (action.kind === "view" && content.articleId) {
                      return (
                        <Link
                          className="rounded-md bg-[#ff4d4f] px-3 py-2 text-sm font-semibold text-white hover:bg-[#f04446]"
                          href={`/articles/${content.articleId}`}
                          key={action.kind}
                        >
                          {action.label}
                        </Link>
                      );
                    }

                    if (action.kind === "edit" && content.draftId) {
                      return (
                        <Link
                          className="rounded-md border border-[#dedede] px-3 py-2 text-sm font-semibold text-[#4e5661] hover:bg-white"
                          href={`/drafts/${content.draftId}`}
                          key={action.kind}
                        >
                          {action.label}
                        </Link>
                      );
                    }

                    if (action.kind === "publish" && content.draftId) {
                      return (
                        <Link
                          className="rounded-md border border-[#ffb6b7] px-3 py-2 text-sm font-semibold text-[#ff4d4f] hover:bg-[#fff1f1]"
                          href={`/publish/${content.draftId}`}
                          key={action.kind}
                        >
                          {action.label}
                        </Link>
                      );
                    }

                    if (action.kind === "withdraw" && content.articleId) {
                      return (
                        <button
                          className="rounded-md border border-[#ffd4d4] px-3 py-2 text-sm font-semibold text-[#d92d2d] hover:bg-[#fff6f6]"
                          key={action.kind}
                          type="button"
                          onClick={() => content.articleId && onRequestWithdraw(content.articleId)}
                        >
                          {action.label}
                        </button>
                      );
                    }

                    return null;
                  })}
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                {pendingDeleteDraftId && pendingDeleteDraftId === content.draftId ? (
                  <div className="w-full rounded-md border border-[#ffd4d4] bg-white px-3 py-3 text-sm text-[#4e5661] sm:w-auto">
                    <div>
                      {content.articleId
                        ? "删除后会移除关联文章和草稿，读者将无法继续访问，确认删除？"
                        : "删除后草稿不可恢复，确认删除？"}
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button
                        className="rounded-md bg-[#d92d2d] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={deletingDraftId === content.draftId}
                        type="button"
                        onClick={() => content.draftId && onDelete(content.draftId)}
                      >
                        {deletingDraftId === content.draftId ? "删除中..." : "确认删除"}
                      </button>
                      <button
                        className="rounded-md border border-[#dedede] px-3 py-2 text-sm font-semibold text-[#4e5661] hover:bg-[#f6f7f9]"
                        type="button"
                        onClick={onCancelDelete}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="rounded-md border border-[#ffd4d4] px-3 py-2 text-sm font-semibold text-[#d92d2d] hover:bg-[#fff6f6] disabled:opacity-50"
                    disabled={!content.draftId || deletingDraftId === content.draftId}
                    type="button"
                    onClick={() => content.draftId && onRequestDelete(content.draftId)}
                  >
                    删除文章
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
