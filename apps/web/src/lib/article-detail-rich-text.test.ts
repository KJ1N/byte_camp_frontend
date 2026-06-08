import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const articlePageSource = readFileSync(new URL("../app/articles/[id]/page.tsx", import.meta.url), "utf8");

describe("article detail rich text rendering", () => {
  it("renders the published article body through RichTextViewer instead of flattening it to plain paragraphs", () => {
    assert.match(articlePageSource, /RichTextViewer/);
    assert.doesNotMatch(articlePageSource, /linesFromDoc/);
    assert.doesNotMatch(articlePageSource, /textFromNode/);
  });
});
