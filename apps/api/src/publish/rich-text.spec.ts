import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { richTextToPlainText, type RichTextDocument } from "@bytecamp-aigc/shared";

describe("richTextToPlainText", () => {
  it("extracts readable text from nested ProseMirror nodes", () => {
    const doc: RichTextDocument = {
      type: "doc",
      content: [
        {
          type: "heading",
          content: [{ type: "text", text: "AI 创作流程" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "选题" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "审核" }] }],
            },
          ],
        },
      ],
    };

    assert.equal(richTextToPlainText(doc), "AI 创作流程\n选题\n审核");
  });

  it("returns an empty string for an empty document", () => {
    assert.equal(richTextToPlainText({ type: "doc", content: [] }), "");
  });
});

