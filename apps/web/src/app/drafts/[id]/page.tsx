"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DraftDetail,
  DraftVersionSummary,
  RestoreDraftVersionResponse,
  AssetSummary,
  RichTextDocument,
  RichTextNode,
} from "@bytecamp-aigc/shared";

import { AiWritingAssistant } from "@/components/ai-writing-assistant";
import { AssetPanel } from "@/components/asset-panel";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import { clearAuthSession, getStoredToken, getStoredUser, type AuthUser } from "@/lib/auth";
import { getDraftEditorOverlayPresentation } from "@/lib/editor-overlay-state";
import {
  clearDraftOfflineState,
  createDraftOfflineState,
  getDraftOfflineStatusText,
  isDraftOfflineConflict,
  readDraftOfflineState,
  type DraftOfflineSaveReason,
  type DraftOfflineState,
  writeDraftOfflineState,
} from "@/lib/draft-offline-state";
import {
  appendDocumentAttachment,
  appendPlainTextParagraph,
  plainTextFromRichText,
  replaceWithPlainText,
} from "@/lib/rich-text-document";
import { formatAssetSize } from "@/lib/assets";

const emptyDoc: RichTextDocument = replaceWithPlainText("");

const assistantSuggestion =
  "可以补充一个具体案例，说明创作者如何从选题、生成、编辑、审核到发布形成闭环，让文章更有说服力。";

type SidePanelTab = "ai" | "suggestions" | "assets";

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
  const [offlineSnapshot, setOfflineSnapshot] = useState<DraftOfflineState | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineSyncState, setOfflineSyncState] = useState<
    "idle" | "local_pending" | "syncing" | "synced" | "sync_failed" | "conflict"
  >("idle");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>("ai");
  const [assetLayerOpen, setAssetLayerOpen] = useState(false);
  const [imageInsertRequest, setImageInsertRequest] = useState<{
    id: string;
    src: string;
    alt?: string;
    assetId?: string;
  } | null>(null);

  const bodyText = useMemo(() => plainTextFromRichText(body), [body]);
  const wordCount = useMemo(() => bodyText.length, [bodyText]);
  const overlayPresentation = useMemo(() => getDraftEditorOverlayPresentation(assetLayerOpen), [assetLayerOpen]);
  const hasLocalPending = hasRecovery || Boolean(offlineSnapshot);
  const canPublish = Boolean(
    draft &&
      !dirty &&
      !hasLocalPending &&
      offlineSyncState !== "syncing" &&
      offlineSyncState !== "conflict" &&
      !restoringVersionId &&
      status !== "saving" &&
      status !== "loading",
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

  useEffect(() => {
    setIsOnline(navigator.onLine);

    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
    const localSnapshot = readDraftOfflineState(window.localStorage, draftId);
    setOfflineSnapshot(localSnapshot);
    setHasRecovery(Boolean(localSnapshot));
    setOfflineSyncState(
      localSnapshot
        ? isDraftOfflineConflict(localSnapshot, { version: loadedDraft.version, updatedAt: loadedDraft.updatedAt })
          ? "conflict"
          : "local_pending"
        : "idle",
    );
    void loadVersions(authToken);
  }

  const writeLocalDraftSnapshot = useCallback(
    (reason: DraftOfflineSaveReason) => {
      if (!draft) return null;

      const snapshot = createDraftOfflineState({
        draftId: draft.id,
        title,
        body,
        baseVersion: draft.version,
        serverUpdatedAt: draft.updatedAt,
        localUpdatedAt: new Date().toISOString(),
        reason,
      });

      writeDraftOfflineState(window.localStorage, draft.id, snapshot);
      setOfflineSnapshot(snapshot);
      setHasRecovery(true);
      setOfflineSyncState(reason === "sync_failed" ? "sync_failed" : "local_pending");

      return snapshot;
    },
    [body, draft, title],
  );

  const syncOfflineDraft = useCallback(
    async (force = false) => {
      if (!token || !draft || status === "saving") return;

      const snapshot = offlineSnapshot ?? readDraftOfflineState(window.localStorage, draft.id);
      if (!snapshot) return;

      if (!force && isDraftOfflineConflict(snapshot, { version: draft.version, updatedAt: draft.updatedAt })) {
        setOfflineSyncState("conflict");
        setHasRecovery(true);
        setOfflineSnapshot(snapshot);
        return;
      }

      setStatus("saving");
      setOfflineSyncState("syncing");
      setError("");

      try {
        const response = await apiFetch(`/drafts/${draft.id}`, {
          method: "PATCH",
          authToken: token,
          body: JSON.stringify({ title: snapshot.title, body: snapshot.body }),
        });
        const payload = await readApiJson<DraftDetail | { message?: string | string[] }>(response);

        if (response.status === 401) {
          clearAuthSession();
          router.push("/login");
          return;
        }

        if (!response.ok || !payload || "message" in payload) {
          const failedSnapshot = createDraftOfflineState({
            ...snapshot,
            localUpdatedAt: new Date().toISOString(),
            reason: "sync_failed",
          });
          writeDraftOfflineState(window.localStorage, draft.id, failedSnapshot);
          setOfflineSnapshot(failedSnapshot);
          setHasRecovery(true);
          setOfflineSyncState("sync_failed");
          setError(getApiErrorMessage(payload, "本地暂存同步失败，请稍后重试。"));
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
        setOfflineSnapshot(null);
        setOfflineSyncState("synced");
        setRestoreMessage("本地暂存内容已同步到服务器。");
        clearDraftOfflineState(window.localStorage, draft.id);
        setStatus("idle");
        void loadVersions(token);
      } catch {
        const failedSnapshot = createDraftOfflineState({
          ...snapshot,
          localUpdatedAt: new Date().toISOString(),
          reason: "sync_failed",
        });
        writeDraftOfflineState(window.localStorage, draft.id, failedSnapshot);
        setOfflineSnapshot(failedSnapshot);
        setHasRecovery(true);
        setOfflineSyncState("sync_failed");
        setError("本地暂存同步失败，请稍后重试。");
        setStatus("idle");
      }
    },
    [draft, loadVersions, offlineSnapshot, router, status, token],
  );

  const saveDraft = useCallback(
    async (reason: "manual" | "auto" = "manual") => {
      if (!token || !draft || status === "saving") return;

      if (!navigator.onLine) {
        writeLocalDraftSnapshot("offline");
        setError(reason === "auto" ? "当前离线，自动保存内容已暂存到本地。" : "当前离线，内容已暂存到本地。");
        setStatus("idle");
        return;
      }

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
          writeLocalDraftSnapshot("save_failed");
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
        setOfflineSnapshot(null);
        setOfflineSyncState("idle");
        clearDraftOfflineState(window.localStorage, draft.id);
        setStatus("idle");
        void loadVersions(token);
      } catch {
        writeLocalDraftSnapshot("save_failed");
        setError(reason === "auto" ? "自动保存失败，已暂存到本地。" : "保存失败，已暂存到本地。");
        setStatus("idle");
      }
    },
    [draft, loadVersions, status, title, token, writeLocalDraftSnapshot],
  );

  useEffect(() => {
    if (
      !isOnline ||
      !offlineSnapshot ||
      offlineSyncState !== "local_pending" ||
      dirty ||
      status === "saving" ||
      !draft
    ) {
      return;
    }

    if (isDraftOfflineConflict(offlineSnapshot, { version: draft.version, updatedAt: draft.updatedAt })) {
      setOfflineSyncState("conflict");
      return;
    }

    void syncOfflineDraft(false);
  }, [dirty, draft, isOnline, offlineSnapshot, offlineSyncState, status, syncOfflineDraft]);

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

  function replaceDraftBody(text: string) {
    if (!text.trim()) return;
    updateBody(replaceWithPlainText(text));
  }

  function appendDraftBody(text: string) {
    if (!text.trim()) return;
    updateBody(appendPlainTextParagraph(body, text));
  }

  function insertAssetImage(asset: AssetSummary) {
    setImageInsertRequest({
      id: `${asset.id}-${Date.now()}`,
      src: asset.url,
      alt: asset.metadata.originalName || asset.filename,
      assetId: asset.id,
    });
    setDirty(true);
    setRestoreMessage("图片素材已插入正文，保存草稿后会同步到服务器。");
  }

  function insertAssetDocumentAttachment(asset: AssetSummary) {
    updateBody(
      appendDocumentAttachment(body, {
        name: asset.metadata.originalName || asset.filename,
        url: asset.url,
        sizeLabel: formatAssetSize(asset.metadata.size),
      }),
    );
    setRestoreMessage("资料附件卡片已插入正文，保存草稿后会同步到服务器。");
  }

  function insertAssetDocumentText(text: string) {
    appendDraftBody(text);
    setRestoreMessage("选中的资料文本已插入正文，保存草稿后会同步到服务器。");
  }

  function restoreOfflineDraft() {
    const payload = readDraftOfflineState(window.localStorage, draftId);
    if (!payload) return;

    setTitle(payload.title);
    setBody(payload.body);
    setDirty(true);
    setOfflineSnapshot(payload);
    setHasRecovery(true);
    setOfflineSyncState("local_pending");
    setRestoreMessage("已恢复本地暂存内容，请保存到服务器后再发布。");
  }

  function discardOfflineDraft() {
    clearDraftOfflineState(window.localStorage, draftId);
    setOfflineSnapshot(null);
    setHasRecovery(false);
    setOfflineSyncState("idle");
    setRestoreMessage("已放弃本地暂存内容，页面继续使用服务器草稿。");
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
      <header
        aria-hidden={overlayPresentation.backgroundAriaHidden}
        className={["sticky top-0 z-20 border-b border-[#ededed] bg-white", overlayPresentation.backgroundClassName].join(" ")}
        style={overlayPresentation.backgroundStyle}
      >
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

      <div
        aria-hidden={overlayPresentation.backgroundAriaHidden}
        className={[
          "mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]",
          overlayPresentation.backgroundClassName,
        ].join(" ")}
        style={overlayPresentation.backgroundStyle}
      >
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

              {!isOnline ? (
                <div className="mx-8 mt-6 rounded-md border border-[#d8e2f2] bg-[#f6f9ff] px-4 py-3 text-sm text-[#355581]">
                  当前处于离线状态，草稿会先保存在本地，恢复网络后再同步到服务器。
                </div>
              ) : null}

              {offlineSnapshot ? (
                <div className="mx-8 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#ffe0ad] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a5a00]">
                  <span>
                    {offlineSyncState === "conflict"
                      ? "检测到本地暂存内容，但服务器草稿已有更新。请确认是否覆盖同步。"
                      : offlineSyncState === "syncing"
                        ? "正在把本地暂存内容同步到服务器..."
                        : getDraftOfflineStatusText(offlineSnapshot)}
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      className="font-semibold text-[#ff4d4f] disabled:text-[#d6a4a5]"
                      disabled={offlineSyncState === "syncing"}
                      type="button"
                      onClick={restoreOfflineDraft}
                    >
                      恢复到页面
                    </button>
                    <button
                      className="font-semibold text-[#ff4d4f] disabled:text-[#d6a4a5]"
                      disabled={!isOnline || offlineSyncState === "syncing"}
                      type="button"
                      onClick={() => void syncOfflineDraft(offlineSyncState === "conflict")}
                    >
                      {offlineSyncState === "conflict" ? "覆盖同步" : "立即同步"}
                    </button>
                    <button
                      className="font-semibold text-[#6b7280] disabled:text-[#d6a4a5]"
                      disabled={offlineSyncState === "syncing"}
                      type="button"
                      onClick={discardOfflineDraft}
                    >
                      放弃暂存
                    </button>
                  </div>
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

              <RichTextEditor value={body} insertImageRequest={imageInsertRequest} onChange={updateBody} />
            </>
          )}

          <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-4 border-t border-[#eeeeee] bg-white px-8 py-4">
            <div className="flex flex-wrap items-center gap-6 text-sm text-[#8f959e]">
              <span>
                {restoringVersionId
                  ? "正在恢复历史版本"
                  : status === "saving"
                    ? "草稿保存中"
                    : offlineSyncState === "syncing"
                      ? "本地内容同步中"
                      : offlineSyncState === "conflict"
                        ? "本地暂存存在冲突"
                        : hasLocalPending
                          ? "有本地未同步内容"
                          : dirty
                            ? "有未保存修改"
                            : offlineSyncState === "synced"
                              ? "本地内容已同步"
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
                  发布
                </Link>
              ) : (
                <button
                  className="rounded-md border border-[#dedede] px-6 py-2.5 text-sm font-medium text-[#a8adb5]"
                  disabled
                  title="请先保存草稿并同步本地内容，再进入发布审核"
                  type="button"
                >
                  发布
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

        <aside className="hidden">
          <div className="mb-8 flex items-center justify-center gap-3">
            <span className="h-6 w-6 rounded-md bg-gradient-to-br from-[#ff5f62] to-[#8c7bff]" />
            <h2 className="text-lg font-semibold">AI创作助手</h2>
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
                    className="w-full text-left cursor-pointer"
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
                        className="mt-3 rounded-md bg-[#fff1f1] px-3 py-2 text-xs font-semibold text-[#ff4d4f] disabled:text-[#d6a4a5] cursor-pointer "
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
        <div className="grid h-fit gap-3">
          <div className="flex rounded-lg bg-white p-1 text-sm font-semibold">
            {[
              { id: "ai", label: "AI 创作" },
              { id: "assets", label: "素材" },
            ].map((item) => (
              <button
                className={[
                  "min-w-0 flex-1 rounded-md px-3 py-2",
                  sidePanelTab === item.id ? "bg-[#fff1f1] text-[#ff4d4f]" : "text-[#6b7280] hover:bg-[#f6f7f9]",
                ].join(" ")}
                key={item.id}
                type="button"
                onClick={() => setSidePanelTab(item.id as SidePanelTab)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {sidePanelTab === "assets" ? (
            <AssetPanel
              authToken={token}
              onLayerOpenChange={setAssetLayerOpen}
              onInsertDocumentAttachment={insertAssetDocumentAttachment}
              onInsertDocumentText={insertAssetDocumentText}
              onInsertImage={insertAssetImage}
            />
          ) : (
            <AiWritingAssistant
              authToken={token}
              topic={title || draft?.title || "草稿编辑"}
              audience="内容创作者"
              style="头条资讯"
              currentTitle={title}
              bodyText={bodyText}
              previewTitle={title}
              previewBodyText={bodyText}
              onSelectTitle={updateTitle}
              onReplaceBody={replaceDraftBody}
              onAppendBody={appendDraftBody}
              footer={
                <>
                  {restoreMessage ? (
                    <div className="rounded-md border border-[#d8ead8] bg-[#f5fbf5] px-4 py-3 text-sm text-[#2f6b37]">
                      {restoreMessage}
                    </div>
                  ) : null}
                  <div className="border-t border-[#eeeeee] pt-5">
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
                            className="w-full cursor-pointer text-left"
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
                                className="mt-3 cursor-pointer rounded-md bg-[#fff1f1] px-3 py-2 text-xs font-semibold text-[#ff4d4f] disabled:text-[#d6a4a5]"
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
                </>
              }
            />
          )}
        </div>
      </div>
    </main>
  );
}
