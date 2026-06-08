import type { RichTextDocument } from "@bytecamp-aigc/shared";

import { replaceWithPlainText } from "./rich-text-document.ts";

export function buildWorkspaceGeneratedBody(bodyText: string, fallbackBody?: RichTextDocument): RichTextDocument {
  if (bodyText.trim()) {
    return replaceWithPlainText(bodyText);
  }

  return fallbackBody ?? replaceWithPlainText("");
}
