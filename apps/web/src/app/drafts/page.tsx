"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DraftStatus, type DeleteDraftResponse, type DraftSummary } from "@bytecamp-aigc/shared";

import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function DraftsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "idle">("loading");
  const [error, setError] = useState("");
  const [deletingDraftId, setDeletingDraftId] = useState("");

  useEffect(() => {
    const storedToken = getStoredToken();
    const storedUser = getStoredUser();
    setToken(storedToken);
    setUser(storedUser);

    if (!storedToken) {
      setStatus("idle");
      return;
    }

    void loadDrafts(storedToken);
  }, []);

  async function loadDrafts(authToken: string) {
    const response = await apiFetch("/drafts/mine", { authToken });
    const payload = await readApiJson<DraftSummary[] | { message?: string | string[] }>(response);

    if (response.status === 401) {
      clearAuthSession();
      router.push("/login");
      return;
    }

    if (!response.ok) {
      setError(getApiErrorMessage(payload, "草稿加载失败，请稍后重试。"));
      setStatus("idle");
      return;
    }

    setDrafts(Array.isArray(payload) ? payload : []);
    setStatus("idle");
  }

  async function deleteDraft(draft: DraftSummary) {
    if (!token || deletingDraftId) return;

    const confirmed = window.confirm(
      draft.status === DraftStatus.Published
        ? "删除后会同时移除已发布文章，确认继续吗？"
        : "确认删除这篇草稿吗？",
    );
    if (!confirmed) return;

    setDeletingDraftId(draft.id);
    setError("");

    const response = await apiFetch(`/drafts/${draft.id}`, {
      authToken: token,
      method: "DELETE",
    });
    const payload = await readApiJson<DeleteDraftResponse | { message?: string | string[] }>(response);

    setDeletingDraftId("");

    if (response.status === 401) {
      clearAuthSession();
      router.push("/login");
      return;
    }

    if (!response.ok) {
      setError(getApiErrorMessage(payload, "删除失败，请稍后重试。"));
      return;
    }

    setDrafts((items) => items.filter((item) => item.id !== draft.id));
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Link
              aria-label="返回创作者主页"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-xl text-[#7b8088] hover:bg-[#eeeeee]"
              href="/creator"
            >
              ←
            </Link>
            <div className="absolute left-1/2 -translate-x-1/2 text-center">
              <div className="text-lg font-semibold">我的草稿</div>
              <div className="text-xs text-[#8f959e]">草稿、版本和继续编辑入口</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden font-bold text-[#4e5661] sm:block">{user?.nickname ?? "未登录"}</span>
            <Link className="rounded-md bg-[#ff4d4f] px-4 py-2 font-bold text-white" href="/workspace">
              新建文章
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1280px] px-5 py-6">
        <div className="bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eeeeee] px-6 py-5">
            <div>
              <h1 className="text-xl font-semibold">草稿箱</h1>
              <p className="mt-1 text-sm text-[#8f959e]">按最近更新时间排序，进入后可继续编辑并自动保存版本。</p>
            </div>
            <div className="text-sm text-[#8f959e]">共 {drafts.length} 篇</div>
          </div>

          {error ? (
            <div className="m-6 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
              {error}
            </div>
          ) : null}

          {status === "loading" ? (
            <div className="px-6 py-16 text-center text-sm text-[#8f959e]">草稿加载中...</div>
          ) : null}

          {!token && status === "idle" ? (
            <div className="px-6 py-16 text-center">
              <h2 className="text-2xl font-semibold">登录后查看草稿</h2>
              <p className="mt-3 text-sm text-[#8f959e]">草稿归属当前创作者账号，请先登录。</p>
              <Link className="mt-6 inline-flex rounded-md bg-[#ff4d4f] px-5 py-3 text-sm font-semibold text-white" href="/login">
                进入登录
              </Link>
            </div>
          ) : null}

          {token && status === "idle" && !drafts.length ? (
            <div className="px-6 py-16 text-center">
              <h2 className="text-2xl font-semibold">还没有草稿</h2>
              <p className="mt-3 text-sm text-[#8f959e]">回到工作台生成第一篇文章初稿。</p>
              <Link className="mt-6 inline-flex rounded-md bg-[#ff4d4f] px-5 py-3 text-sm font-semibold text-white" href="/workspace">
                开始创作
              </Link>
            </div>
          ) : null}

          {drafts.length ? (
            <div className="divide-y divide-[#eeeeee]">
              {drafts.map((draft) => (
                <article
                  className="grid gap-3 px-6 py-5 transition hover:bg-[#fafafa] md:grid-cols-[minmax(0,1fr)_120px_120px_140px_auto]"
                  key={draft.id}
                >
                  <Link className="min-w-0" href={`/drafts/${draft.id}`}>
                    <div className="line-clamp-1 text-base font-semibold text-[#1f2329]">{draft.title}</div>
                    <div className="mt-2 text-sm text-[#8f959e]">草稿 ID：{draft.id}</div>
                  </Link>
                  <div className="text-sm">
                    <div className="text-[#8f959e]">状态</div>
                    <div className="mt-2 font-medium">{draft.status}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-[#8f959e]">版本</div>
                    <div className="mt-2 font-medium">v{draft.version}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-[#8f959e]">更新时间</div>
                    <div className="mt-2 font-medium">{formatTime(draft.updatedAt)}</div>
                  </div>
                  <div className="flex items-start justify-end">
                    <button
                      className="rounded-md border border-[#ffd4d4] px-3 py-2 text-sm font-semibold text-[#d92d2d] hover:bg-[#fff6f6] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={deletingDraftId === draft.id}
                      type="button"
                      onClick={() => void deleteDraft(draft)}
                    >
                      {deletingDraftId === draft.id
                        ? "删除中..."
                        : draft.status === DraftStatus.Published
                          ? "删除文章"
                          : "删除草稿"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
