import type { CSSProperties } from "react";

export interface DraftEditorOverlayPresentation {
  backgroundAriaHidden: boolean;
  backgroundClassName: string;
  backgroundStyle?: CSSProperties;
  layerClassName: string;
}

const backgroundTransitionClass = "transition duration-150 ease-out";
const dimmedBackgroundClass = `${backgroundTransitionClass} pointer-events-none select-none blur-[3px] opacity-50`;
const activeLayerClass = "fixed inset-0 z-[1000] bg-[rgba(31,35,41,0.34)] px-4 py-8 backdrop-blur-md";

export function getDraftEditorOverlayPresentation(isLayerOpen: boolean): DraftEditorOverlayPresentation {
  return {
    backgroundAriaHidden: isLayerOpen,
    backgroundClassName: isLayerOpen ? dimmedBackgroundClass : backgroundTransitionClass,
    backgroundStyle: isLayerOpen ? { filter: "blur(3px)", opacity: 0.5 } : undefined,
    layerClassName: activeLayerClass,
  };
}
