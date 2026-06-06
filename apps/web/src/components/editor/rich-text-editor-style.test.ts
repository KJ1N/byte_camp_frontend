import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { richTextEditorContentClass } from "./rich-text-editor-style.ts";

describe("rich text editor styles", () => {
  it("keeps block formatting visible inside the editor canvas", () => {
    assert.match(richTextEditorContentClass, /\[\&_h2\]:text-\[24px\]/);
    assert.match(richTextEditorContentClass, /\[\&_blockquote\]:border-l-4/);
    assert.match(richTextEditorContentClass, /\[\&_ul\]:list-disc/);
    assert.match(richTextEditorContentClass, /\[\&_ol\]:list-decimal/);
  });
});
