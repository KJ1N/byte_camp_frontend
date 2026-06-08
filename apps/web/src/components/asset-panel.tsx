"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  AssetAuditStatus,
  AssetFolderKind,
  AssetKind,
  type AssetFolderMutationResponse,
  type AssetFolderSummary,
  type AssetSummary,
  type DeleteAssetFolderResponse,
  type ListAssetFoldersResponse,
  type ListAssetsResponse,
  type UploadAssetResponse,
} from "@bytecamp-aigc/shared";
import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import {
  canInsertAssetIntoEditor,
  canInsertDocumentAttachment,
  filterAssetFoldersByKind,
  formatAssetAuditStatus,
  formatAssetSize,
  getAssetAuditTone,
  getAssetUploadValidationError,
} from "@/lib/assets";
import { getDraftEditorOverlayPresentation } from "@/lib/editor-overlay-state";

type AssetPanelState = "loading" | "idle" | "uploading" | "failed";

interface AssetPanelProps {
  authToken: string | null;
  onInsertImage: (asset: AssetSummary) => void;
  onInsertDocumentAttachment?: (asset: AssetSummary) => void;
  onInsertDocumentText?: (text: string) => void;
  onLayerOpenChange?: (isOpen: boolean) => void;
}

const folderKindLabels: Record<AssetFolderKind, string> = {
  [AssetFolderKind.Image]: "图片素材",
  [AssetFolderKind.Document]: "资料文件",
};

const acceptByFolderKind: Record<AssetFolderKind, string> = {
  [AssetFolderKind.Image]: "image/png,image/jpeg,image/webp,image/gif",
  [AssetFolderKind.Document]:
    "text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.md,.docx",
};

export function AssetPanel({
  authToken,
  onInsertImage,
  onInsertDocumentAttachment,
  onInsertDocumentText,
  onLayerOpenChange,
}: AssetPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const documentTextRef = useRef<HTMLTextAreaElement | null>(null);
  const [folders, setFolders] = useState<AssetFolderSummary[]>([]);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [state, setState] = useState<AssetPanelState>("idle");
  const [error, setError] = useState("");
  const [copiedAssetId, setCopiedAssetId] = useState("");
  const [deletingAssetId, setDeletingAssetId] = useState("");
  const [activeFolder, setActiveFolder] = useState<AssetFolderSummary | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetSummary | null>(null);
  const [uploadKind, setUploadKind] = useState<AssetFolderKind | null>(null);
  const [pendingUploadFolderId, setPendingUploadFolderId] = useState("");
  const [newFolderNames, setNewFolderNames] = useState<Record<AssetFolderKind, string>>({
    [AssetFolderKind.Image]: "",
    [AssetFolderKind.Document]: "",
  });

  useEffect(() => {
    if (!authToken) {
      setFolders([]);
      setAssets([]);
      return;
    }

    void loadFolders();
  }, [authToken]);

  const imageFolders = useMemo(() => filterAssetFoldersByKind(folders, AssetFolderKind.Image), [folders]);
  const documentFolders = useMemo(() => filterAssetFoldersByKind(folders, AssetFolderKind.Document), [folders]);
  const uploadFolders = uploadKind ? filterAssetFoldersByKind(folders, uploadKind) : [];
  const isLayerOpen = Boolean(uploadKind || activeFolder);

  useEffect(() => {
    onLayerOpenChange?.(isLayerOpen);

    return () => onLayerOpenChange?.(false);
  }, [isLayerOpen, onLayerOpenChange]);

  async function loadFolders() {
    if (!authToken) return;

    setState("loading");
    setError("");

    const response = await apiFetch("/assets/folders", { authToken });
    const payload = await readApiJson<ListAssetFoldersResponse | { message?: string | string[] }>(response);

    if (!response.ok || !payload || !("items" in payload)) {
      setError(getApiErrorMessage(payload, "素材文件夹加载失败，请稍后重试。"));
      setState("failed");
      return;
    }

    setFolders(payload.items);
    setState("idle");
  }

  async function loadAssets(folder: AssetFolderSummary) {
    if (!authToken) return;

    setActiveFolder(folder);
    setSelectedAsset(null);
    setState("loading");
    setError("");

    const response = await apiFetch(`/assets/mine?folderId=${encodeURIComponent(folder.id)}`, { authToken });
    const payload = await readApiJson<ListAssetsResponse | { message?: string | string[] }>(response);

    if (!response.ok || !payload || !("items" in payload)) {
      setError(getApiErrorMessage(payload, "素材加载失败，请稍后重试。"));
      setState("failed");
      return;
    }

    setAssets(payload.items);
    setState("idle");
  }

  async function createFolder(kind: AssetFolderKind) {
    if (!authToken) return;
    const name = newFolderNames[kind].trim();
    if (!name) {
      setError("请输入文件夹名称。");
      return;
    }

    setError("");
    const response = await apiFetch("/assets/folders", {
      method: "POST",
      authToken,
      body: JSON.stringify({ kind, name }),
    });
    const payload = await readApiJson<AssetFolderMutationResponse | { message?: string | string[] }>(response);

    if (!response.ok || !payload || !("folder" in payload)) {
      setError(getApiErrorMessage(payload, "文件夹创建失败，请稍后重试。"));
      return;
    }

    setFolders((items) => [...items, payload.folder]);
    setNewFolderNames((current) => ({ ...current, [kind]: "" }));
  }

  async function renameFolder(folder: AssetFolderSummary) {
    if (!authToken) return;
    const name = window.prompt("请输入新的文件夹名称", folder.name)?.trim();
    if (!name || name === folder.name) return;

    setError("");
    const response = await apiFetch(`/assets/folders/${folder.id}`, {
      method: "PATCH",
      authToken,
      body: JSON.stringify({ name }),
    });
    const payload = await readApiJson<AssetFolderMutationResponse | { message?: string | string[] }>(response);

    if (!response.ok || !payload || !("folder" in payload)) {
      setError(getApiErrorMessage(payload, "文件夹重命名失败，请稍后重试。"));
      return;
    }

    setFolders((items) => items.map((item) => (item.id === folder.id ? payload.folder : item)));
    if (activeFolder?.id === folder.id) setActiveFolder(payload.folder);
  }

  async function deleteFolder(folder: AssetFolderSummary) {
    if (!authToken) return;
    const confirmed = window.confirm("删除文件夹前请确认其中没有素材。确认删除这个文件夹？");
    if (!confirmed) return;

    setError("");
    const response = await apiFetch(`/assets/folders/${folder.id}`, {
      method: "DELETE",
      authToken,
    });
    const payload = await readApiJson<DeleteAssetFolderResponse | { message?: string | string[] }>(response);

    if (!response.ok) {
      setError(getApiErrorMessage(payload, "文件夹删除失败，请先清空其中素材。"));
      return;
    }

    setFolders((items) => items.filter((item) => item.id !== folder.id));
    if (activeFolder?.id === folder.id) {
      setActiveFolder(null);
      setAssets([]);
      setSelectedAsset(null);
    }
  }

  function startUpload(kind: AssetFolderKind) {
    if (!authToken) return;
    setUploadKind(kind);
    setPendingUploadFolderId("");
    setError("");
  }

  function chooseUploadFolder(folderId: string) {
    setPendingUploadFolderId(folderId);
    setUploadKind(null);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function uploadFile(file: File) {
    if (!authToken || !pendingUploadFolderId) return;

    const validationError = getAssetUploadValidationError(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folderId", pendingUploadFolderId);
    setState("uploading");
    setError("");

    const response = await apiFetch("/assets", {
      method: "POST",
      authToken,
      body: formData,
    });
    const payload = await readApiJson<UploadAssetResponse | { message?: string | string[] }>(response);

    if (!response.ok || !payload || !("asset" in payload)) {
      setError(getApiErrorMessage(payload, "素材上传或审核失败，请稍后重试。"));
      setState("failed");
      return;
    }

    setState("idle");
    setPendingUploadFolderId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadFolders();
    const currentFolder = activeFolder;
    if (currentFolder && currentFolder.id === payload.asset.folderId) {
      await loadAssets(currentFolder);
      setSelectedAsset(payload.asset);
    }
  }

  async function deleteAsset(assetId: string) {
    if (!authToken || deletingAssetId) return;
    const confirmed = window.confirm("删除素材后，已经插入正文的旧引用可能无法继续访问。确认删除？");
    if (!confirmed) return;

    setDeletingAssetId(assetId);
    setError("");

    const response = await apiFetch(`/assets/${assetId}`, {
      method: "DELETE",
      authToken,
    });
    const payload = await readApiJson<{ message?: string | string[] }>(response);

    setDeletingAssetId("");

    if (!response.ok) {
      setError(getApiErrorMessage(payload, "素材删除失败，请稍后重试。"));
      return;
    }

    setAssets((items) => items.filter((item) => item.id !== assetId));
    if (selectedAsset?.id === assetId) setSelectedAsset(null);
    await loadFolders();
  }

  async function copyAssetUrl(asset: AssetSummary) {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(asset.url);
    setCopiedAssetId(asset.id);
    window.setTimeout(() => setCopiedAssetId(""), 1400);
  }

  function insertSelectedDocumentText() {
    const textarea = documentTextRef.current;
    const text = textarea?.value.slice(textarea.selectionStart, textarea.selectionEnd).trim() ?? "";
    if (!text) {
      setError("请先在资料预览中选中要插入正文的文字。");
      return;
    }

    onInsertDocumentText?.(text);
    setError("");
  }

  return (
    <div className="h-fit min-h-[calc(100vh-8rem)] rounded-lg bg-[#fbfdff] px-6 py-8 lg:sticky lg:top-20">
      <input
        className="hidden"
        disabled={!authToken || state === "uploading"}
        ref={fileInputRef}
        type="file"
        accept={pendingUploadFolderId ? acceptByFolderKind[folders.find((folder) => folder.id === pendingUploadFolderId)?.kind ?? AssetFolderKind.Image] : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadFile(file);
        }}
      />

      <div className="mb-6">
        <h2 className="text-lg font-semibold">素材库</h2>
        <p className="mt-2 text-sm leading-6 text-[#8f959e]">
          图片和资料按文件夹管理；资料文件会先抽取文字并通过合规检查后再进入云存储。
        </p>
      </div>

      {error ? (
        <div className="mb-5 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-2">
        <button
          className="rounded-md bg-[#ff4d4f] px-3 py-2 text-sm font-semibold text-white disabled:bg-[#f3a5a6]"
          disabled={!authToken || state === "uploading"}
          type="button"
          onClick={() => startUpload(AssetFolderKind.Image)}
        >
          上传图片
        </button>
        <button
          className="rounded-md border border-[#ffb6b7] px-3 py-2 text-sm font-semibold text-[#ff4d4f] hover:bg-[#fff1f1] disabled:text-[#d6a4a5]"
          disabled={!authToken || state === "uploading"}
          type="button"
          onClick={() => startUpload(AssetFolderKind.Document)}
        >
          上传资料
        </button>
      </div>

      {state === "uploading" ? (
        <div className="mb-5 rounded-md border border-[#d8e2f2] bg-[#f6f9ff] px-4 py-3 text-sm text-[#355581]">
          正在审核并上传到云存储...
        </div>
      ) : null}

      <div className="grid gap-6">
        <FolderSection
          folders={imageFolders}
          kind={AssetFolderKind.Image}
          newFolderName={newFolderNames[AssetFolderKind.Image]}
          state={state}
          onCreateFolder={() => void createFolder(AssetFolderKind.Image)}
          onDeleteFolder={(folder) => void deleteFolder(folder)}
          onFolderNameChange={(name) => setNewFolderNames((current) => ({ ...current, [AssetFolderKind.Image]: name }))}
          onOpenFolder={(folder) => void loadAssets(folder)}
          onRenameFolder={(folder) => void renameFolder(folder)}
        />
        <FolderSection
          folders={documentFolders}
          kind={AssetFolderKind.Document}
          newFolderName={newFolderNames[AssetFolderKind.Document]}
          state={state}
          onCreateFolder={() => void createFolder(AssetFolderKind.Document)}
          onDeleteFolder={(folder) => void deleteFolder(folder)}
          onFolderNameChange={(name) => setNewFolderNames((current) => ({ ...current, [AssetFolderKind.Document]: name }))}
          onOpenFolder={(folder) => void loadAssets(folder)}
          onRenameFolder={(folder) => void renameFolder(folder)}
        />
      </div>

      {uploadKind ? (
        <Layer title={`选择${folderKindLabels[uploadKind]}文件夹`} onClose={() => setUploadKind(null)}>
          <div className="grid gap-3">
            {uploadFolders.map((folder) => (
              <button
                className="rounded-md border border-[#eeeeee] bg-white px-4 py-3 text-left hover:border-[#ffb6b7] hover:bg-[#fff7f7]"
                key={folder.id}
                type="button"
                onClick={() => chooseUploadFolder(folder.id)}
              >
                <div className="font-semibold text-[#1f2329]">{folder.name}</div>
                <div className="mt-1 text-xs text-[#8f959e]">{folder.assetCount} 个素材</div>
              </button>
            ))}
            {!uploadFolders.length ? (
              <div className="rounded-md border border-dashed border-[#dedede] px-4 py-8 text-center text-sm text-[#8f959e]">
                先在侧栏创建一个{folderKindLabels[uploadKind]}文件夹。
              </div>
            ) : null}
          </div>
        </Layer>
      ) : null}

      {activeFolder ? (
        <Layer title={activeFolder.name} onClose={() => setActiveFolder(null)}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid gap-2">
                {assets.map((asset) => (
                  <button
                    className={[
                      "rounded-md border px-3 py-3 text-left transition",
                      selectedAsset?.id === asset.id
                        ? "border-[#ffb6b7] bg-[#fff7f7]"
                        : "border-[#eeeeee] bg-white hover:bg-[#fafafa]",
                    ].join(" ")}
                    key={asset.id}
                    type="button"
                    onClick={() => setSelectedAsset(asset)}
                  >
                    <div className="line-clamp-1 text-sm font-semibold text-[#1f2329]">
                      {asset.metadata.originalName || asset.filename}
                    </div>
                    <div className="mt-1 text-xs text-[#8f959e]">{formatAssetSize(asset.metadata.size)}</div>
                  </button>
                ))}
                {!assets.length ? (
                  <div className="rounded-md border border-dashed border-[#dedede] px-4 py-10 text-center text-sm text-[#8f959e]">
                    这个文件夹还没有素材。
                  </div>
                ) : null}
              </div>
            </div>

            <AssetDetail
              asset={selectedAsset}
              copied={Boolean(selectedAsset && copiedAssetId === selectedAsset.id)}
              deleting={Boolean(selectedAsset && deletingAssetId === selectedAsset.id)}
              documentTextRef={documentTextRef}
              onCopy={(asset) => void copyAssetUrl(asset)}
              onDelete={(asset) => void deleteAsset(asset.id)}
              onInsertDocumentAttachment={(asset) => onInsertDocumentAttachment?.(asset)}
              onInsertDocumentText={insertSelectedDocumentText}
              onInsertImage={(asset) => onInsertImage(asset)}
            />
          </div>
        </Layer>
      ) : null}
    </div>
  );
}

function FolderSection({
  folders,
  kind,
  newFolderName,
  state,
  onCreateFolder,
  onDeleteFolder,
  onFolderNameChange,
  onOpenFolder,
  onRenameFolder,
}: {
  folders: AssetFolderSummary[];
  kind: AssetFolderKind;
  newFolderName: string;
  state: AssetPanelState;
  onCreateFolder: () => void;
  onDeleteFolder: (folder: AssetFolderSummary) => void;
  onFolderNameChange: (name: string) => void;
  onOpenFolder: (folder: AssetFolderSummary) => void;
  onRenameFolder: (folder: AssetFolderSummary) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1f2329]">{folderKindLabels[kind]}</h3>
        <span className="text-xs text-[#8f959e]">{folders.length} 个文件夹</span>
      </div>

      <div className="mb-3 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border border-[#dedede] bg-white px-3 py-2 text-sm outline-none focus:border-[#ff4d4f]"
          placeholder="新建文件夹"
          value={newFolderName}
          onChange={(event) => onFolderNameChange(event.target.value)}
        />
        <button
          className="rounded-md bg-[#f0f1f3] px-3 py-2 text-sm font-semibold text-[#4e5661] hover:bg-[#e9eaed]"
          type="button"
          onClick={onCreateFolder}
        >
          创建
        </button>
      </div>

      <div className="grid gap-2">
        {folders.map((folder) => (
          <div className="rounded-md border border-[#eeeeee] bg-white p-3" key={folder.id}>
            <button className="w-full text-left" type="button" onClick={() => onOpenFolder(folder)}>
              <div className="flex items-center justify-between gap-3">
                <span className="line-clamp-1 text-sm font-semibold text-[#1f2329]">{folder.name}</span>
                <span className="rounded-md bg-[#f6f7f9] px-2 py-1 text-xs text-[#8f959e]">{folder.assetCount}</span>
              </div>
            </button>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-md bg-[#f6f7f9] px-2.5 py-1.5 text-xs font-semibold text-[#4e5661] hover:bg-[#eeeeee]"
                type="button"
                onClick={() => onRenameFolder(folder)}
              >
                重命名
              </button>
              <button
                className="rounded-md bg-[#fff6f6] px-2.5 py-1.5 text-xs font-semibold text-[#d92d2d] hover:bg-[#ffecec]"
                disabled={state === "uploading"}
                type="button"
                onClick={() => onDeleteFolder(folder)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
        {!folders.length ? (
          <div className="rounded-md border border-dashed border-[#dedede] bg-white px-4 py-6 text-center text-sm text-[#8f959e]">
            暂无文件夹。
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Layer({ children, title, onClose }: { children: ReactNode; title: string; onClose: () => void }) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const presentation = getDraftEditorOverlayPresentation(true);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  if (!portalRoot) return null;

  return createPortal(
    <div className={presentation.layerClassName}>
      <div className="mx-auto max-h-[88vh] max-w-[920px] overflow-hidden rounded-lg bg-white shadow-[0_24px_80px_rgba(31,35,41,0.24)]">
        <div className="flex items-center justify-between gap-4 border-b border-[#eeeeee] px-5 py-4">
          <h3 className="text-base font-semibold text-[#1f2329]">{title}</h3>
          <button
            aria-label="关闭弹窗"
            className="flex h-8 w-8 items-center justify-center rounded-md text-xl text-[#8f959e] hover:bg-[#f6f7f9]"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="max-h-[calc(88vh-4.5rem)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    portalRoot,
  );
}

function AssetDetail({
  asset,
  copied,
  deleting,
  documentTextRef,
  onCopy,
  onDelete,
  onInsertDocumentAttachment,
  onInsertDocumentText,
  onInsertImage,
}: {
  asset: AssetSummary | null;
  copied: boolean;
  deleting: boolean;
  documentTextRef: RefObject<HTMLTextAreaElement | null>;
  onCopy: (asset: AssetSummary) => void;
  onDelete: (asset: AssetSummary) => void;
  onInsertDocumentAttachment: (asset: AssetSummary) => void;
  onInsertDocumentText: () => void;
  onInsertImage: (asset: AssetSummary) => void;
}) {
  if (!asset) {
    return (
      <div className="rounded-md border border-dashed border-[#dedede] px-5 py-16 text-center text-sm text-[#8f959e]">
        点击左侧素材名称卡片后查看详情。
      </div>
    );
  }

  const tone = getAssetAuditTone(asset.auditStatus);
  const auditClass =
    tone === "safe"
      ? "bg-[#f5fbf5] text-[#2f6b37]"
      : tone === "warn"
        ? "bg-[#fffaf0] text-[#8a5a00]"
        : "bg-[#fff6f6] text-[#d92d2d]";
  const textContent = asset.metadata.textContent ?? asset.metadata.textPreview ?? "";

  return (
    <article className="rounded-md border border-[#eeeeee] bg-[#fbfbfb] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-base font-semibold text-[#1f2329]">{asset.metadata.originalName || asset.filename}</h4>
          <div className="mt-2 text-xs text-[#8f959e]">{formatAssetSize(asset.metadata.size)}</div>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${auditClass}`}>
          {formatAssetAuditStatus(asset.auditStatus)}
        </span>
      </div>

      {asset.kind === AssetKind.Image ? (
        <img alt={asset.metadata.originalName} className="mt-4 max-h-80 w-full rounded-md bg-[#f6f7f9] object-contain" src={asset.url} />
      ) : (
        <textarea
          className="mt-4 min-h-64 w-full resize-y rounded-md border border-[#dedede] bg-white px-3 py-3 text-sm leading-7 text-[#2f3640] outline-none focus:border-[#ff4d4f]"
          readOnly
          ref={documentTextRef}
          value={textContent || "资料文件没有可展示的抽取文本。"}
        />
      )}

      {asset.auditStatus === AssetAuditStatus.Warn ? (
        <p className="mt-3 text-xs leading-5 text-[#8a5a00]">{asset.metadata.audit.summary}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {asset.kind === AssetKind.Image && canInsertAssetIntoEditor(asset) ? (
          <button className="rounded-md bg-[#ff4d4f] px-3 py-2 text-xs font-semibold text-white" type="button" onClick={() => onInsertImage(asset)}>
            插入正文
          </button>
        ) : null}
        {asset.kind === AssetKind.Document && canInsertDocumentAttachment(asset) ? (
          <>
            <button
              className="rounded-md bg-[#ff4d4f] px-3 py-2 text-xs font-semibold text-white"
              type="button"
              onClick={() => onInsertDocumentAttachment(asset)}
            >
              插入附件卡片
            </button>
            <button
              className="rounded-md bg-[#fff1f1] px-3 py-2 text-xs font-semibold text-[#d92d2d]"
              type="button"
              onClick={onInsertDocumentText}
            >
              插入选中文本
            </button>
          </>
        ) : null}
        <button className="rounded-md bg-[#f0f1f3] px-3 py-2 text-xs font-semibold text-[#4e5661]" type="button" onClick={() => onCopy(asset)}>
          {copied ? "已复制" : "复制 URL"}
        </button>
        <button
          className="rounded-md bg-[#fff6f6] px-3 py-2 text-xs font-semibold text-[#d92d2d] disabled:opacity-50"
          disabled={deleting}
          type="button"
          onClick={() => onDelete(asset)}
        >
          {deleting ? "删除中..." : "删除"}
        </button>
      </div>
    </article>
  );
}
