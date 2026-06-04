"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CreatorInspirationsResponse, CreatorInspiration, DraftSummary } from "@bytecamp-aigc/shared";

import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";
import { buildWorkspaceTopicHref } from "@/lib/workspace-topic";

type LoadState = "loading" | "idle";

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

export default function CreatorHomePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [inspirations, setInspirations] = useState<CreatorInspiration[]>([]);
  const [status, setStatus] = useState<LoadState>("loading");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
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

  const recentDrafts = useMemo(() => drafts.slice(0, 2), [drafts]);

  async function loadCreatorData(authToken: string) {
    setStatus("loading");
    setError("");

    const [draftResponse, inspirationResponse] = await Promise.all([
      apiFetch("/drafts/mine", { authToken }),
      apiFetch("/ai/creator-inspirations", { authToken }),
    ]);

    if (draftResponse.status === 401 || inspirationResponse.status === 401) {
      clearAuthSession();
      setToken(null);
      setUser(null);
      setDrafts([]);
      setInspirations([]);
      setStatus("idle");
      return;
    }

    const draftPayload = await readApiJson<DraftSummary[] | { message?: string | string[] }>(draftResponse);
    const inspirationPayload = await readApiJson<CreatorInspirationsResponse | { message?: string | string[] }>(
      inspirationResponse,
    );

    if (!draftResponse.ok) {
      setError(getApiErrorMessage(draftPayload, "草稿动态加载失败，请稍后重试。"));
    } else {
      setDrafts(Array.isArray(draftPayload) ? draftPayload : []);
    }

    if (!inspirationResponse.ok || !isCreatorInspirationsResponse(inspirationPayload)) {
      setError(getApiErrorMessage(inspirationPayload, "创作灵感加载失败，请稍后重试。"));
      setInspirations([]);
    } else {
      setInspirations(inspirationPayload.items);
    }

    setStatus("idle");
  }

  function openWorksPlaceholder() {
    setNotice("作品管理将在发布功能完成后开放，当前请先在草稿箱管理内容。");
  }

  function logout() {
    clearAuthSession();
    setToken(null);
    setUser(null);
    setDrafts([]);
    setInspirations([]);
    setNotice("");
    setError("");
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-30 border-b border-[#ededed] bg-white">
        <div className="mx-auto grid h-16 max-w-[1500px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 lg:grid-cols-[220px_minmax(0,1fr)_380px]">
          <Link className="justify-self-start text-2xl font-black tracking-tight text-[#ff3b3f]" href="/">
            HEADLINE
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
              创作者主页会汇总草稿动态、创作入口和 AI 灵感建议，先登录即可继续。
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
              <Link className="rounded-md bg-[#fff1f1] px-4 py-3 font-semibold text-[#ff4d4f]" href="/creator">
                主页
              </Link>
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
                    className="rounded-md px-3 py-2 text-left text-[#8f959e] hover:bg-[#fafafa]"
                    type="button"
                    onClick={openWorksPlaceholder}
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
           

            {notice ? (
              <div className="rounded-md border border-[#ffe1b8] bg-[#fffaf0] px-4 py-3 text-sm text-[#9a5b00]" role="status">
                {notice}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]" role="alert">
                {error}
              </div>
            ) : null}

            <div className="rounded-lg bg-white px-6 py-7">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="text-center">
                  <div className="text-sm font-medium text-[#8f959e]">粉丝数</div>
                  <div className="mt-5 text-5xl font-semibold">0</div>
                  <div className="mx-auto mt-5 w-fit rounded-md bg-[#fafafa] px-4 py-2 text-sm text-[#8f959e]">昨日无变化</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium text-[#8f959e]">总阅读量</div>
                  <div className="mt-5 text-5xl font-semibold">0</div>
                  <div className="mx-auto mt-5 w-fit rounded-md bg-[#fafafa] px-4 py-2 text-sm text-[#8f959e]">发布后开始统计</div>
                </div>
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
                    {recentDrafts.map((draft) => (
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
