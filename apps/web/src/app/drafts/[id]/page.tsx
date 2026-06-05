"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DraftDetail,
  DraftVersionSummary,
  RestoreDraftVersionResponse,
  RichTextDocument,
  RichTextNode,
} from "@bytecamp-aigc/shared";

import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";
import {
  clearDraftOfflineState,
  readDraftOfflineState,
  writeDraftOfflineState,
} from "@/lib/draft-offline-state";

const emptyDoc: RichTextDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
};

const assistantSuggestion =
  "可以补充一个具体案例，说明创作者如何从选题、生成、编辑、审核到发布形成闭环，让文章更有说服力。";

function textFromNode(node: RichTextNode): string {
  return [node.text ?? "", ...(node.content ?? []).map((child) => textFromNode(child))].join("");
}

function textFromDoc(doc: RichTextDocument) {
  return doc.content.map((node) => textFromNode(node)).join("");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function DraftEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const draftId = params.id;
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState<RichTextDocument>(emptyDoc);
  const [versions, setVersions] = useState<DraftVersionSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "saving">("loading");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  const wordCount = useMemo(() => textFromDoc(body).length, [body]);
  const canPublish = Boolean(
    draft && !dirty && !hasRecovery && !restoringVersionId && status !== "saving" && status !== "loading",
  );

  useEffect(() => {
    const storedToken = getStoredToken();
    setToken(storedToken);
    setUser(getStoredUser());

    if (!storedToken) {
      router.push("/login");
      return;
    }

    void loadDraft(storedToken);
  }, [draftId, router]);

  const loadVersions = useCallback(
    async (authToken: string) => {
      const response = await apiFetch(`/drafts/${draftId}/versions`, { authToken });
      const payload = await readApiJson<DraftVersionSummary[] | { message?: string | string[] }>(response);
      if (response.ok && Array.isArray(payload)) setVersions(payload);
    },
    [draftId],
  );

  async function loadDraft(authToken: string) {
    setStatus("loading");
    setError("");

    const response = await apiFetch(`/drafts/${draftId}`, { authToken });
    const payload = await readApiJson<DraftDetail | { message?: string | string[] }>(response);

    if (response.status === 401) {
      clearAuthSession();
      router.push("/login");
      return;
    }

    if (!response.ok || !payload || "message" in payload) {
      setError(getApiErrorMessage(payload, "草稿加载失败，请稍后重试。"));
      setStatus("idle");
      return;
    }

    const loadedDraft = payload as DraftDetail;
    setDraft(loadedDraft);
    setTitle(loadedDraft.title);
    setBody(loadedDraft.body);
    setLastSavedAt(loadedDraft.updatedAt);
    setDirty(false);
    setStatus("idle");
    setHasRecovery(Boolean(readDraftOfflineState(window.localStorage, draftId)));
    void loadVersions(authToken);
  }

  const saveDraft = useCallback(
    async (reason: "manual" | "auto" = "manual") => {
      if (!token || !draft || status === "saving") return;

      setStatus("saving");
      setError("");

      try {
        const response = await apiFetch(`/drafts/${draft.id}`, {
          method: "PATCH",
          authToken: token,
          body: JSON.stringify({ title, body }),
        });
        const payload = await readApiJson<DraftDetail | { message?: string | string[] }>(response);

        if (!response.ok || !payload || "message" in payload) {
          const message = getApiErrorMessage(payload, reason === "auto" ? "自动保存失败，已暂存到本地。" : "保存失败，请稍后重试。");
          writeDraftOfflineState(window.localStorage, draft.id, { title, body });
          setHasRecovery(true);
          setError(message);
          setStatus("idle");
          return;
        }

        const savedDraft = payload as DraftDetail;
        setDraft(savedDraft);
        setTitle(savedDraft.title);
        setBody(savedDraft.body);
        setLastSavedAt(savedDraft.updatedAt);
        setDirty(false);
        setHasRecovery(false);
        clearDraftOfflineState(window.localStorage, draft.id);
        setStatus("idle");
        void loadVersions(token);
      } catch {
        writeDraftOfflineState(window.localStorage, draft.id, { title, body });
        setHasRecovery(true);
        setError(reason === "auto" ? "自动保存失败，已暂存到本地。" : "保存失败，已暂存到本地。");
        setStatus("idle");
      }
    },
    [body, draft, loadVersions, status, title, token],
  );

  useEffect(() => {
    if (!dirty || status === "saving" || restoringVersionId) return;
    const timer = window.setInterval(() => {
      void saveDraft("auto");
    }, 30000);

    return () => window.clearInterval(timer);
  }, [dirty, restoringVersionId, saveDraft, status]);

  function updateTitle(nextTitle: string) {
    setTitle(nextTitle);
    setDirty(true);
  }

  function updateBody(nextBody: RichTextDocument) {
    setBody(nextBody);
    setDirty(true);
  }

  function restoreOfflineDraft() {
    const payload = readDraftOfflineState(window.localStorage, draftId);
    if (!payload) return;

    setTitle(payload.title);
    setBody(payload.body);
    setDirty(true);
    setHasRecovery(false);
    setRestoreMessage("已恢复本地暂存内容，请保存到服务器后再发布。");
  }

  async function restoreServerVersion(version: DraftVersionSummary) {
    if (!token || !draft || restoringVersionId) return;

    if (dirty || hasRecovery) {
      const confirmed = window.confirm("恢复历史版本会覆盖当前页面上的未保存修改。确认继续吗？");
      if (!confirmed) return;
    }

    setRestoringVersionId(version.id);
    setError("");
    setRestoreMessage("");

    const response = await apiFetch(`/drafts/${draft.id}/restore`, {
      method: "POST",
      authToken: token,
      body: JSON.stringify({ versionId: version.id }),
    });
    const payload = await readApiJson<RestoreDraftVersionResponse | { message?: string | string[] }>(response);

    if (response.status === 401) {
      clearAuthSession();
      router.push("/login");
      return;
    }

    if (!response.ok || !payload || "message" in payload) {
      setError(getApiErrorMessage(payload, "版本恢复失败，请稍后重试。"));
      setRestoringVersionId(null);
      return;
    }

    const restoredDraft = payload as RestoreDraftVersionResponse;
    setDraft(restoredDraft);
    setTitle(restoredDraft.title);
    setBody(restoredDraft.body);
    setLastSavedAt(restoredDraft.updatedAt);
    setDirty(false);
    setHasRecovery(false);
    clearDraftOfflineState(window.localStorage, draft.id);
    setSelectedVersionId(null);
    setRestoreMessage(`已从 v${restoredDraft.restoredFromVersion} 恢复，并保存为 v${restoredDraft.version}。`);
    setRestoringVersionId(null);
    void loadVersions(token);
  }

  function appendAssistantSuggestion() {
    setBody((current) => ({
      ...current,
      content: [
        ...current.content,
        {
          type: "paragraph",
          content: [{ type: "text", text: assistantSuggestion }],
        },
      ],
    }));
    setDirty(true);
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
      <header className="sticky top-0 z-20 border-b border-[#ededed] bg-white">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Link
              aria-label="返回草稿列表"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f5f5] text-xl text-[#7b8088] hover:bg-[#eeeeee]"
              href="/drafts"
            >
              ‹
            </Link>
            <div className="absolute left-1/2 -translate-x-1/2 text-center">
              <div className="text-lg font-semibold">发布文章</div>
              <div className="text-xs text-[#8f959e]">草稿编辑 · {user?.nickname ?? "创作者"}</div>
            </div>
          </div>

          <div className="flex items-center gap-5 text-sm text-[#4e5661]">
            <Link className="hidden hover:text-[#ff4d4f] sm:block" href="/docs">
              头条号发文规范
            </Link>
            <span className="hidden sm:block">消息</span>
            <Link className="rounded-md bg-[#f6f7f9] px-3 py-2 font-medium hover:bg-[#eeeeee]" href="/creator">
              {user ? user.nickname : "--"}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-h-[calc(100vh-8rem)] bg-white">
          {status === "loading" ? (
            <div className="px-8 py-16 text-center text-sm text-[#8f959e]">草稿加载中...</div>
          ) : (
            <>
              {error ? (
                <div className="mx-8 mt-6 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]">
                  {error}
                </div>
              ) : null}

              {hasRecovery ? (
                <div className="mx-8 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#ffe0ad] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a5a00]">
                  <span>检测到本地未同步内容，可以恢复后再保存。</span>
                  <button className="font-semibold text-[#ff4d4f]" type="button" onClick={restoreOfflineDraft}>
                    恢复本地内容
                  </button>
                </div>
              ) : null}

              <div className="mx-auto max-w-[920px] px-8 py-9">
                <input
                  className="w-full border-0 border-b border-[#eeeeee] px-0 pb-6 text-[30px] font-semibold text-[#1f2329] outline-none placeholder:text-[#a8adb5]"
                  placeholder="请输入文章标题（2～30个字）"
                  value={title}
                  onChange={(event) => updateTitle(event.target.value)}
                />
              </div>

              <RichTextEditor value={body} onChange={updateBody} />
            </>
          )}

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-[#eeeeee] bg-white px-8 py-4">
            <div className="flex flex-wrap items-center gap-6 text-sm text-[#8f959e]">
              <span>
                {restoringVersionId
                  ? "正在恢复历史版本"
                  : status === "saving"
                    ? "草稿保存中"
                    : hasRecovery
                      ? "有本地未同步内容"
                      : dirty
                        ? "有未保存修改"
                        : "草稿已保存"}
              </span>
              <span>共 {wordCount} 字</span>
              <span>v{draft?.version ?? "-"}</span>
              <span>{lastSavedAt ? formatTime(lastSavedAt) : "尚未保存"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {canPublish ? (
                <Link
                  className="rounded-md border border-[#dedede] px-6 py-2.5 text-sm font-medium text-[#4e5661] hover:border-[#ffb2b3] hover:text-[#ff4d4f]"
                  href={`/publish/${draft?.id}`}
                >
                  预览并发布
                </Link>
              ) : (
                <button
                  className="rounded-md border border-[#dedede] px-6 py-2.5 text-sm font-medium text-[#a8adb5]"
                  disabled
                  title="请先保存草稿并同步本地内容，再进入发布审核"
                  type="button"
                >
                  预览并发布
                </button>
              )}
              <button
                className="rounded-md bg-[#ff4d4f] px-6 py-2.5 text-sm font-semibold text-white disabled:bg-[#f3a5a6]"
                disabled={!draft || status === "saving" || Boolean(restoringVersionId) || !dirty}
                type="button"
                onClick={() => void saveDraft("manual")}
              >
                {status === "saving" ? "保存中..." : "保存草稿"}
              </button>
            </div>
          </div>
        </section>

        <aside className="h-fit min-h-[calc(100vh-8rem)] bg-[#fbfdff] px-6 py-8 lg:sticky lg:top-20">
          <div className="mb-8 flex items-center justify-center gap-3">
            <span className="h-6 w-6 rounded-md bg-gradient-to-br from-[#ff5f62] to-[#8c7bff]" />
            <h2 className="text-lg font-semibold">头条创作助手</h2>
          </div>

          {restoreMessage ? (
            <div className="mb-6 rounded-md border border-[#d8ead8] bg-[#f5fbf5] px-4 py-3 text-sm text-[#2f6b37]">
              {restoreMessage}
            </div>
          ) : null}

          <div className="mb-8 flex gap-8 border-b border-transparent text-sm">
            <button className="border-b-2 border-[#1f2329] pb-3 font-semibold text-[#1f2329]" type="button">
              AI 创作
            </button>
            <button className="pb-3 text-[#8f959e]" type="button">
              内容建议
            </button>
          </div>

          <div className="max-h-[52vh] overflow-y-auto pr-2 text-[15px] leading-8 text-[#2f3640]">
            <h3 className="mb-4 text-base font-semibold">让内容更完整</h3>
            <p className="mb-4">{assistantSuggestion}</p>
            <p className="mb-4">
              当前草稿已经进入编辑阶段，建议重点检查标题是否具体、段落是否过长，以及结尾是否有明确行动建议。
            </p>
            <p className="text-xs text-[#a8adb5]">以上文本由 AI 基于用户指令生成，请谨慎参考和使用</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="rounded-md bg-gradient-to-r from-[#ff4d4f] to-[#8c7bff] px-4 py-2 text-sm font-semibold text-white"
              type="button"
              onClick={appendAssistantSuggestion}
            >
              添加到正文
            </button>
            <button className="rounded-md bg-[#f0f1f3] px-4 py-2 text-sm font-medium text-[#4e5661]" type="button">
              复制
            </button>
            <button className="rounded-md bg-[#f0f1f3] px-4 py-2 text-sm font-medium text-[#4e5661]" type="button">
              重试
            </button>
          </div>

          <div className="mt-7 rounded-md bg-white p-3 shadow-[0_8px_28px_rgba(31,35,41,0.06)]">
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 border-0 px-2 py-3 text-sm outline-none placeholder:text-[#b5bac2]"
                placeholder="输入创作主题、观点或大纲，AI 帮你写"
              />
              <button
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ffe4ea] font-semibold text-[#ff4d4f]"
                type="button"
              >
                ↑
              </button>
            </div>
          </div>

          <div className="mt-8 border-t border-[#eeeeee] pt-5">
            <div className="mb-3 text-sm font-semibold text-[#4e5661]">版本记录</div>
            <div className="grid gap-2">
              {versions.map((version) => (
                <div
                  className={[
                    "rounded-md border bg-white px-3 py-2 text-sm transition",
                    selectedVersionId === version.id ? "border-[#ffb2b3]" : "border-[#eeeeee]",
                  ].join(" ")}
                  key={version.id}
                >
                  <button
                    className="w-full text-left"
                    type="button"
                    onClick={() => setSelectedVersionId(selectedVersionId === version.id ? null : version.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-[#1f2329]">v{version.version}</div>
                      <div className="text-xs text-[#8f959e]">{formatTime(version.createdAt)}</div>
                    </div>
                    <div className="mt-1 truncate text-xs text-[#6b7280]">{version.title}</div>
                  </button>
                  {selectedVersionId === version.id ? (
                    <div className="mt-3 border-t border-[#f0f0f0] pt-3">
                      <p className="max-h-24 overflow-hidden text-xs leading-6 text-[#6b7280]">
                        {textFromDoc(version.snapshot) || "该版本暂无正文内容"}
                      </p>
                      <button
                        className="mt-3 rounded-md bg-[#fff1f1] px-3 py-2 text-xs font-semibold text-[#ff4d4f] disabled:text-[#d6a4a5]"
                        disabled={Boolean(restoringVersionId)}
                        type="button"
                        onClick={() => void restoreServerVersion(version)}
                      >
                        {restoringVersionId === version.id ? "恢复中..." : "恢复此版本"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              {!versions.length ? <div className="text-sm text-[#8f959e]">暂无版本记录</div> : null}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
