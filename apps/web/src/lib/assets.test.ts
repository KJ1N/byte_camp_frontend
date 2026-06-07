import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AssetAuditStatus, AssetKind, type AssetSummary } from "@bytecamp-aigc/shared";
import {
  canInsertAssetIntoEditor,
  formatAssetAuditStatus,
  formatAssetSize,
  getAssetKindFromMimeType,
  getAssetUploadValidationError,
} from "./assets.ts";

describe("asset helpers", () => {
  it("maps supported MIME types to asset kinds", () => {
    assert.equal(getAssetKindFromMimeType("image/png"), AssetKind.Image);
    assert.equal(getAssetKindFromMimeType("image/jpeg"), AssetKind.Image);
    assert.equal(getAssetKindFromMimeType("text/markdown"), AssetKind.Document);
    assert.equal(getAssetKindFromMimeType("application/pdf"), AssetKind.Document);
    assert.equal(getAssetKindFromMimeType("application/zip"), null);
  });

  it("formats asset sizes for compact UI", () => {
    assert.equal(formatAssetSize(0), "0 B");
    assert.equal(formatAssetSize(512), "512 B");
    assert.equal(formatAssetSize(2048), "2.0 KB");
    assert.equal(formatAssetSize(2 * 1024 * 1024), "2.0 MB");
  });

  it("validates upload files before sending them to the API", () => {
    assert.equal(getAssetUploadValidationError(createFile("cover.png", "image/png", 1024)), "");
    assert.equal(getAssetUploadValidationError(createFile("brief.md", "text/markdown", 1024)), "");
    assert.equal(getAssetUploadValidationError(createFile("archive.zip", "application/zip", 1024)), "不支持的素材文件类型。");
    assert.equal(getAssetUploadValidationError(createFile("large.png", "image/png", 6 * 1024 * 1024)), "图片素材不能超过 5MB。");
    assert.equal(getAssetUploadValidationError(createFile("large.pdf", "application/pdf", 11 * 1024 * 1024)), "资料文件不能超过 10MB。");
  });

  it("formats audit status labels", () => {
    assert.equal(formatAssetAuditStatus(AssetAuditStatus.Passed), "审核通过");
    assert.equal(formatAssetAuditStatus(AssetAuditStatus.Warn), "需注意");
    assert.equal(formatAssetAuditStatus(AssetAuditStatus.Blocked), "已拦截");
  });

  it("allows only PASS and WARN images to be inserted into the editor", () => {
    assert.equal(canInsertAssetIntoEditor(createAsset(AssetKind.Image, AssetAuditStatus.Passed)), true);
    assert.equal(canInsertAssetIntoEditor(createAsset(AssetKind.Image, AssetAuditStatus.Warn)), true);
    assert.equal(canInsertAssetIntoEditor(createAsset(AssetKind.Image, AssetAuditStatus.Blocked)), false);
    assert.equal(canInsertAssetIntoEditor(createAsset(AssetKind.Document, AssetAuditStatus.Passed)), false);
  });
});

function createFile(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

function createAsset(kind: AssetKind, auditStatus: AssetAuditStatus): AssetSummary {
  return {
    id: "asset-1",
    kind,
    filename: "asset.png",
    mimeType: kind === AssetKind.Image ? "image/png" : "text/markdown",
    url: "https://cdn.example.com/assets/user-1/asset-1.png",
    auditStatus,
    metadata: {
      originalName: "asset.png",
      size: 1024,
      storageKey: "assets/user-1/asset-1.png",
      audit: {
        decision: auditStatus,
        riskLevel: "none",
        categories: [],
        evidence: [],
        summary: "审核完成",
        model: "vision-audit-mock",
        source: "MOCK",
      },
    },
    createdAt: "2026-06-07T10:00:00.000Z",
  };
}
