"use client";

import { useEffect, useRef, useState } from "react";
import { AssetAuditStatus, AssetKind, type AssetSummary, type ListAssetsResponse, type UploadAssetResponse } from "@bytecamp-aigc/shared";
import { apiFetch, getApiErrorMessage, readApiJson } from "@/lib/api";
import {
  canInsertAssetIntoEditor,
  formatAssetAuditStatus,
  formatAssetSize,
  getAssetAuditTone,
  getAssetUploadValidationError,
} from "@/lib/assets";

type AssetPanelState = "loading" | "idle" | "uploading" | "failed";

interface AssetPanelProps {
  authToken: string | null;
  onInsertImage: (asset: AssetSummary) => void;
}

export function AssetPanel({ authToken, onInsertImage }: AssetPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [state, setState] = useState<AssetPanelState>("idle");
  const [error, setError] = useState("");
  const [copiedAssetId, setCopiedAssetId] = useState("");
  const [deletingAssetId, setDeletingAssetId] = useState("");

  useEffect(() => {
    if (!authToken) {
      setAssets([]);
      return;
    }

    void loadAssets();
  }, [authToken]);

  async function loadAssets() {
    if (!authToken) return;

    setState("loading");
    setError("");

    const response = await apiFetch("/assets/mine", { authToken });
    const payload = await readApiJson<ListAssetsResponse | { message?: string | string[] }>(response);

    if (!response.ok || !payload || !("items" in payload)) {
      setError(getApiErrorMessage(payload, "素材加载失败，请稍后重试。"));
      setState("failed");
      return;
    }

    setAssets(payload.items);
    setState("idle");
  }

  async function uploadFile(file: File) {
    if (!authToken) return;

    const validationError = getAssetUploadValidationError(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setState("uploading");
    setError("");

    const response = await apiFetch("/assets", {
      method: "POST",
      authToken,
      body: formData,
    });
    const payload = await readApiJson<UploadAssetResponse | { message?: string | string[] }>(response);

    if (!response.ok || !payload || !("asset" in payload)) {
      setError(getApiErrorMessage(payload, "素材上传或视觉审核失败，请稍后重试。"));
      setState("failed");
      return;
    }

    setAssets((items) => [payload.asset, ...items.filter((item) => item.id !== payload.asset.id)]);
    setState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function deleteAsset(assetId: string) {
    if (!authToken || deletingAssetId) return;
    const confirmed = window.confirm("删除素材后，已插入正文的旧图片可能无法继续显示。确认删除？");
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
  }

  async function copyAssetUrl(asset: AssetSummary) {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(asset.url);
    setCopiedAssetId(asset.id);
    window.setTimeout(() => setCopiedAssetId(""), 1400);
  }

  const images = assets.filter((asset) => asset.kind === AssetKind.Image);
  const documents = assets.filter((asset) => asset.kind === AssetKind.Document);

  return (
    <div className="h-fit min-h-[calc(100vh-8rem)] rounded-lg bg-[#fbfdff] px-6 py-8 lg:sticky lg:top-20">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">素材库</h2>
        <p className="mt-2 text-sm leading-6 text-[#8f959e]">图片会先经过视觉审核，通过后写入云存储并返回 CDN 地址。</p>
      </div>

      {error ? (
        <div className="mb-5 rounded-md border border-[#ffd4d4] bg-[#fff6f6] px-4 py-3 text-sm text-[#d92d2d]" role="alert">
          {error}
        </div>
      ) : null}

      <div className="rounded-md border border-dashed border-[#d9dce2] bg-white px-4 py-5">
        <input
          className="block w-full text-sm text-[#4e5661] file:mr-4 file:rounded-md file:border-0 file:bg-[#ff4d4f] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
          disabled={!authToken || state === "uploading"}
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,text/plain,text/markdown,application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />
        <div className="mt-3 text-xs leading-5 text-[#8f959e]">
          图片不超过 5MB；资料文件不超过 10MB。{state === "uploading" ? "正在视觉审核并上传到云存储..." : null}
        </div>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1f2329]">图片素材</h3>
          <button className="text-xs font-semibold text-[#ff4d4f]" type="button" onClick={() => void loadAssets()}>
            刷新
          </button>
        </div>
        <div className="grid gap-3">
          {images.map((asset) => (
            <AssetCard
              asset={asset}
              copied={copiedAssetId === asset.id}
              deleting={deletingAssetId === asset.id}
              key={asset.id}
              onCopy={() => void copyAssetUrl(asset)}
              onDelete={() => void deleteAsset(asset.id)}
              onInsert={() => onInsertImage(asset)}
            />
          ))}
          {!images.length ? <div className="rounded-md bg-white px-4 py-8 text-center text-sm text-[#8f959e]">还没有图片素材。</div> : null}
        </div>
      </section>

      <section className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-[#1f2329]">资料文件</h3>
        <div className="grid gap-3">
          {documents.map((asset) => (
            <AssetCard
              asset={asset}
              copied={copiedAssetId === asset.id}
              deleting={deletingAssetId === asset.id}
              key={asset.id}
              onCopy={() => void copyAssetUrl(asset)}
              onDelete={() => void deleteAsset(asset.id)}
            />
          ))}
          {!documents.length ? <div className="rounded-md bg-white px-4 py-6 text-center text-sm text-[#8f959e]">资料文件会保留 CDN 地址，后续可用于多模态生成。</div> : null}
        </div>
      </section>

      <div className="mt-6 rounded-md border border-[#eeeeee] bg-white px-4 py-4">
        <div className="text-sm font-semibold text-[#1f2329]">多模态生成</div>
        <p className="mt-2 text-sm leading-6 text-[#8f959e]">入口已预留，后续可基于图片和资料生成正文、摘要或配图说明。</p>
        <button className="mt-3 rounded-md bg-[#f0f1f3] px-3 py-2 text-xs font-semibold text-[#8f959e]" disabled type="button">
          即将开放
        </button>
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  copied,
  deleting,
  onCopy,
  onDelete,
  onInsert,
}: {
  asset: AssetSummary;
  copied: boolean;
  deleting: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onInsert?: () => void;
}) {
  const tone = getAssetAuditTone(asset.auditStatus);
  const auditClass =
    tone === "safe"
      ? "bg-[#f5fbf5] text-[#2f6b37]"
      : tone === "warn"
        ? "bg-[#fffaf0] text-[#8a5a00]"
        : "bg-[#fff6f6] text-[#d92d2d]";

  return (
    <article className="rounded-md border border-[#eeeeee] bg-white p-3">
      {asset.kind === AssetKind.Image ? (
        <img alt={asset.metadata.originalName} className="mb-3 max-h-44 w-full rounded-md object-contain bg-[#f6f7f9]" src={asset.url} />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[#1f2329]">{asset.metadata.originalName || asset.filename}</div>
          <div className="mt-1 text-xs text-[#8f959e]">{formatAssetSize(asset.metadata.size)}</div>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${auditClass}`}>
          {formatAssetAuditStatus(asset.auditStatus)}
        </span>
      </div>
      {asset.auditStatus === AssetAuditStatus.Warn ? (
        <p className="mt-2 text-xs leading-5 text-[#8a5a00]">{asset.metadata.audit.summary}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {onInsert && canInsertAssetIntoEditor(asset) ? (
          <button className="rounded-md bg-[#ff4d4f] px-3 py-2 text-xs font-semibold text-white" type="button" onClick={onInsert}>
            插入正文
          </button>
        ) : null}
        <button className="rounded-md bg-[#f0f1f3] px-3 py-2 text-xs font-semibold text-[#4e5661]" type="button" onClick={onCopy}>
          {copied ? "已复制" : "复制 URL"}
        </button>
        <button
          className="rounded-md bg-[#fff6f6] px-3 py-2 text-xs font-semibold text-[#d92d2d] disabled:opacity-50"
          disabled={deleting}
          type="button"
          onClick={onDelete}
        >
          {deleting ? "删除中" : "删除"}
        </button>
      </div>
    </article>
  );
}
