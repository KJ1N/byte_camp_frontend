import type { AssetSummary } from "@bytecamp-aigc/shared";

export type WorkspaceSidePanelTab = "ai" | "assets";

export interface EditorImageInsertRequest {
  id: string;
  src: string;
  alt?: string;
  assetId?: string;
}

export const workspaceSidePanelTabs: ReadonlyArray<{ id: WorkspaceSidePanelTab; label: string }> = [
  { id: "ai", label: "AI 创作" },
  { id: "assets", label: "素材" },
];

export function createWorkspaceImageInsertRequest(asset: AssetSummary): EditorImageInsertRequest {
  return {
    id: `${asset.id}-${Date.now()}`,
    src: asset.url,
    alt: asset.metadata.originalName || asset.filename,
    assetId: asset.id,
  };
}
