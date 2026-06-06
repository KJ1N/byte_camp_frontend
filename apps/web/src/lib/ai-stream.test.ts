import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAiSseParser, encodeParagraphsAsRichText, mergeTitleCandidate } from "./ai-stream.ts";

describe("createAiSseParser", () => {
  it("parses server-sent events across arbitrary chunks", () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const parser = createAiSseParser((event) => events.push(event));

    parser.feed('event: title\ndata: {"text":"First');
    parser.feed(' title"}\n\nevent: done\ndata: {"ok":true}\n\n');

    assert.deepEqual(events, [
      { event: "title", data: { text: "First title" } },
      { event: "done", data: { ok: true } },
    ]);
  });

  it("parses multi-line data payloads", () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const parser = createAiSseParser((event) => events.push(event));

    parser.feed('event: body-delta\ndata: "Line one"\ndata: "Line two"\n\n');

    assert.deepEqual(events, [{ event: "body-delta", data: "Line one\nLine two" }]);
  });
});

describe("encodeParagraphsAsRichText", () => {
  it("converts streamed plain text into a rich text document", () => {
    const doc = encodeParagraphsAsRichText("First paragraph.\n\nSecond paragraph.");

    assert.equal(doc.type, "doc");
    assert.equal(doc.content.length, 2);
    assert.equal(doc.content[0].content?.[0].text, "First paragraph.");
    assert.equal(doc.content[1].content?.[0].text, "Second paragraph.");
  });
});

describe("mergeTitleCandidate", () => {
  it("replaces a streamed title candidate by index", () => {
    const first = mergeTitleCandidate([], { text: "First", index: 0 });
    const updated = mergeTitleCandidate(first, { text: "First title", index: 0 });
    const second = mergeTitleCandidate(updated, { text: "Second title", index: 1 });

    assert.deepEqual(second, ["First title", "Second title"]);
  });

  it("keeps appending title candidates when the stream event has no index", () => {
    const candidates = mergeTitleCandidate(["First title"], { text: "Second title" });

    assert.deepEqual(candidates, ["First title", "Second title"]);
  });
});
