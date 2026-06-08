import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RichTextDocument } from "@bytecamp-aigc/shared";

import { buildWorkspaceGeneratedBody } from "./workspace-generated-body.ts";

describe("workspace generated body helper", () => {
  it("rebuilds the final workspace body from bodyText so markdown images stay parsed", () => {
    const fallbackBody: RichTextDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "![AI scene](https://via.placeholder.com/800x450?text=AI+scene)" }],
        },
      ],
    };

    const result = buildWorkspaceGeneratedBody(
      "![AI scene](https://via.placeholder.com/800x450?text=AI+scene)",
      fallbackBody,
    );

    assert.deepEqual(result, {
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://via.placeholder.com/800x450?text=AI+scene", alt: "AI scene" } }],
    });
  });

  it("falls back to the provided body when bodyText is empty", () => {
    const fallbackBody: RichTextDocument = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Existing body" }] }],
    };

    assert.deepEqual(buildWorkspaceGeneratedBody("", fallbackBody), fallbackBody);
  });
});
