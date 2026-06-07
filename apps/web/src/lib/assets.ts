import { AssetAuditStatus, AssetKind, type AssetSummary } from "@bytecamp-aigc/shared";

const imageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const documentMimeTypes = new Set(["text/plain", "text/markdown", "application/pdf"]);
const imageSizeLimit = 5 * 1024 * 1024;
const documentSizeLimit = 10 * 1024 * 1024;

export function getAssetKindFromMimeType(mimeType: string): AssetKind | null {
  if (imageMimeTypes.has(mimeType)) return AssetKind.Image;
  if (documentMimeTypes.has(mimeType)) return AssetKind.Document;
  return null;
}

export function formatAssetSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function getAssetUploadValidationError(file: Pick<File, "type" | "size">): string {
  const kind = getAssetKindFromMimeType(file.type);
  if (!kind) return "不支持的素材文件类型。";

  if (kind === AssetKind.Image && file.size > imageSizeLimit) return "图片素材不能超过 5MB。";
  if (kind === AssetKind.Document && file.size > documentSizeLimit) return "资料文件不能超过 10MB。";

  return "";
}

export function formatAssetAuditStatus(status: AssetAuditStatus): string {
  if (status === AssetAuditStatus.Passed) return "审核通过";
  if (status === AssetAuditStatus.Warn) return "需注意";
  return "已拦截";
}

export function getAssetAuditTone(status: AssetAuditStatus): "safe" | "warn" | "blocked" {
  if (status === AssetAuditStatus.Passed) return "safe";
  if (status === AssetAuditStatus.Warn) return "warn";
  return "blocked";
}

export function canInsertAssetIntoEditor(asset: AssetSummary): boolean {
  return asset.kind === AssetKind.Image && asset.auditStatus !== AssetAuditStatus.Blocked;
}
