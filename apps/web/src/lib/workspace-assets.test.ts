import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AssetAuditStatus, AssetKind, type AssetSummary } from "@bytecamp-aigc/shared";
import { createWorkspaceImageInsertRequest, workspaceSidePanelTabs } from "./workspace-assets.ts";

const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

afterEach(() => {
  if (originalApiBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    return;
  }

  process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
});

describe("workspace asset helpers", () => {
  it("keeps the workspace side panel tabs including asset management", () => {
    assert.deepEqual(workspaceSidePanelTabs, [
      { id: "ai", label: "AI 创作" },
      { id: "assets", label: "素材" },
    ]);
  });

  it("creates a stable image insert request from an asset", () => {
    const request = createWorkspaceImageInsertRequest(createAsset());

    assert.equal(request.src, "https://cdn.example.com/assets/user-1/asset-1.png");
    assert.equal(request.alt, "cover.png");
    assert.equal(request.assetId, "asset-1");
    assert.match(request.id, /^asset-1-\d+$/);
  });

  it("falls back to filename when original name is missing", () => {
    const request = createWorkspaceImageInsertRequest(createAsset({ originalName: "" }));

    assert.equal(request.alt, "asset.png");
  });

  it("uses an absolute API URL when inserting a stable asset view URL", () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.com";

    const request = createWorkspaceImageInsertRequest(createAsset({}, "/assets/asset-1/view"));

    assert.equal(request.src, "https://api.example.com/assets/asset-1/view");
  });
});

function createAsset(
  metadata: Partial<AssetSummary["metadata"]> = {},
  url = "https://cdn.example.com/assets/user-1/asset-1.png",
): AssetSummary {
  return {
    id: "asset-1",
    kind: AssetKind.Image,
    filename: "asset.png",
    mimeType: "image/png",
    url,
    auditStatus: AssetAuditStatus.Passed,
    metadata: {
      originalName: "cover.png",
      size: 1024,
      storageKey: "assets/user-1/asset-1.png",
      audit: {
        decision: AssetAuditStatus.Passed,
        riskLevel: "none",
        categories: [],
        evidence: [],
        summary: "审核完成",
        model: "vision-audit-mock",
        source: "MOCK",
      },
      ...metadata,
    },
    createdAt: "2026-06-07T10:00:00.000Z",
  };
}
