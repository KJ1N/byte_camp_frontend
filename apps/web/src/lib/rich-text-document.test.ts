import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RichTextDocument } from "@bytecamp-aigc/shared";

import {
  appendPlainTextParagraph,
  normalizeRichTextDocument,
  plainTextFromRichText,
  replaceWithPlainText,
} from "./rich-text-document.ts";

describe("rich text document helpers", () => {
  it("replaces a document with paragraphs from plain text", () => {
    const doc = replaceWithPlainText("First paragraph.\n\nSecond paragraph.");

    assert.equal(doc.type, "doc");
    assert.equal(doc.content.length, 2);
    assert.equal(doc.content[0].content?.[0].text, "First paragraph.");
    assert.equal(doc.content[1].content?.[0].text, "Second paragraph.");
  });

  it("represents empty documents without empty text nodes", () => {
    const doc = replaceWithPlainText("");

    assert.deepEqual(doc, {
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    });
  });

  it("normalizes legacy empty text nodes before passing content to TipTap", () => {
    const doc = normalizeRichTextDocument({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    });

    assert.deepEqual(doc, {
      type: "doc",
      content: [
        { type: "paragraph", content: [] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    });
  });

  it("does not add child content to leaf nodes while normalizing", () => {
    const doc = normalizeRichTextDocument({
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://example.com/image.png" } }],
    });

    assert.deepEqual(doc, {
      type: "doc",
      content: [{ type: "image", attrs: { src: "https://example.com/image.png" } }],
    });
  });

  it("appends a non-empty assistant suggestion as a paragraph", () => {
    const current: RichTextDocument = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Existing" }] }],
    };

    const next = appendPlainTextParagraph(current, " Add this suggestion. ");

    assert.equal(next.content.length, 2);
    assert.equal(next.content[1].content?.[0].text, "Add this suggestion.");
  });

  it("keeps the original document when appending empty text", () => {
    const current: RichTextDocument = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Existing" }] }],
    };

    assert.equal(appendPlainTextParagraph(current, "   "), current);
  });

  it("extracts text from nested rich text nodes", () => {
    const doc: RichTextDocument = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Heading" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    };

    assert.equal(plainTextFromRichText(doc), "Heading\nBody");
  });
});
