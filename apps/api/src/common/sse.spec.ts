import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeSseEvent, writeSse } from "./sse";

function createResponse() {
  return {
    headers: new Map<string, string>(),
    chunks: [] as string[],
    ended: false,
    setHeader(key: string, value: string) {
      this.headers.set(key, value);
    },
    write(chunk: string) {
      this.chunks.push(chunk);
    },
    end() {
      this.ended = true;
    },
  };
}

describe("SSE helpers", () => {
  it("encodes named events as JSON data blocks", () => {
    assert.equal(
      encodeSseEvent({ event: "text-delta", data: { text: "hello" } }),
      'event: text-delta\ndata: {"text":"hello"}\n\n',
    );
  });

  it("writes stream headers, events, and closes the response", async () => {
    const response = createResponse();

    await writeSse(response, [
      { event: "meta", data: { model: "mock-model" } },
      { event: "done", data: { ok: true } },
    ]);

    assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8");
    assert.equal(response.headers.get("Cache-Control"), "no-cache");
    assert.equal(response.ended, true);
    assert.equal(response.chunks.length, 2);
    assert.match(response.chunks.join(""), /event: done/);
  });
});
