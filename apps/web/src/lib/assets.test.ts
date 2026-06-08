import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AssetAuditStatus,
  AssetFolderKind,
  AssetKind,
  type AssetFolderSummary,
  type AssetSummary,
} from "@bytecamp-aigc/shared";
import {
  canInsertDocumentAttachment,
  canInsertAssetIntoEditor,
  filterAssetFoldersByKind,
  formatAssetAuditStatus,
  formatAssetSize,
  getAssetKindFromMimeType,
  getAssetUploadValidationError,
  getDefaultAssetFolderId,
} from "./assets.ts";

describe("asset helpers", () => {
  it("maps supported MIME types to asset kinds", () => {
    assert.equal(getAssetKindFromMimeType("image/png"), AssetKind.Image);
    assert.equal(getAssetKindFromMimeType("image/jpeg"), AssetKind.Image);
    assert.equal(getAssetKindFromMimeType("text/markdown"), AssetKind.Document);
    assert.equal(
      getAssetKindFromMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      AssetKind.Document,
    );
    assert.equal(getAssetKindFromMimeType("application/pdf"), null);
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
    assert.equal(
      getAssetUploadValidationError(
        createFile("brief.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 1024),
      ),
      "",
    );
    assert.equal(getAssetUploadValidationError(createFile("archive.zip", "application/zip", 1024)), "不支持的素材文件类型。");
    assert.equal(getAssetUploadValidationError(createFile("large.png", "image/png", 6 * 1024 * 1024)), "图片素材不能超过 5MB。");
    assert.equal(getAssetUploadValidationError(createFile("legacy.pdf", "application/pdf", 1024)), "不支持的素材文件类型。");
    assert.equal(
      getAssetUploadValidationError(
        createFile("large.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 11 * 1024 * 1024),
      ),
      "资料文件不能超过 10MB。",
    );
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

  it("allows only PASS and WARN documents to be inserted as attachment cards", () => {
    assert.equal(canInsertDocumentAttachment(createAsset(AssetKind.Document, AssetAuditStatus.Passed)), true);
    assert.equal(canInsertDocumentAttachment(createAsset(AssetKind.Document, AssetAuditStatus.Warn)), true);
    assert.equal(canInsertDocumentAttachment(createAsset(AssetKind.Document, AssetAuditStatus.Blocked)), false);
    assert.equal(canInsertDocumentAttachment(createAsset(AssetKind.Image, AssetAuditStatus.Passed)), false);
  });

  it("filters folders by asset kind and picks the first matching folder", () => {
    const folders = createFolders();

    assert.deepEqual(filterAssetFoldersByKind(folders, AssetFolderKind.Image).map((folder) => folder.id), [
      "folder-image",
    ]);
    assert.deepEqual(filterAssetFoldersByKind(folders, AssetFolderKind.Document).map((folder) => folder.id), [
      "folder-document",
    ]);
    assert.equal(getDefaultAssetFolderId(folders, AssetFolderKind.Image), "folder-image");
    assert.equal(getDefaultAssetFolderId([], AssetFolderKind.Image), "");
  });
});

function createFile(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

function createAsset(kind: AssetKind, auditStatus: AssetAuditStatus): AssetSummary {
  return {
    id: "asset-1",
    kind,
    folderId: kind === AssetKind.Image ? "folder-image" : "folder-document",
    filename: "asset.png",
    mimeType: kind === AssetKind.Image ? "image/png" : "text/markdown",
    url: "https://cdn.example.com/assets/user-1/asset-1.png",
    auditStatus,
    metadata: {
      originalName: "asset.png",
      size: 1024,
      storageKey: "assets/user-1/asset-1.png",
      textPreview: kind === AssetKind.Document ? "资料摘要" : undefined,
      textContent: kind === AssetKind.Document ? "资料摘要" : undefined,
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

function createFolders(): AssetFolderSummary[] {
  return [
    {
      id: "folder-image",
      kind: AssetFolderKind.Image,
      name: "图片素材",
      assetCount: 2,
      createdAt: "2026-06-07T09:00:00.000Z",
      updatedAt: "2026-06-07T09:00:00.000Z",
    },
    {
      id: "folder-document",
      kind: AssetFolderKind.Document,
      name: "资料文件",
      assetCount: 1,
      createdAt: "2026-06-07T09:00:00.000Z",
      updatedAt: "2026-06-07T09:00:00.000Z",
    },
  ];
}
