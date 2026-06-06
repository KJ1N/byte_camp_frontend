import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDoubaoChatCompletionsBody,
  getDoubaoChatCompletionsUrl,
  parseDoubaoStreamText,
} from "./doubao-chat-format";

describe("doubao chat format", () => {
  it("builds the chat completions URL from the configured API v3 base URL", () => {
    assert.equal(
      getDoubaoChatCompletionsUrl("https://ark.cn-beijing.volces.com/api/v3"),
      "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    );
  });

  it("keeps a full chat completions URL unchanged", () => {
    assert.equal(
      getDoubaoChatCompletionsUrl("https://ark.cn-beijing.volces.com/api/v3/chat/completions"),
      "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    );
  });

  it("builds the request body required by the Doubao streaming API", () => {
    assert.deepEqual(
      buildDoubaoChatCompletionsBody({
        model: "doubao-seed-2-0-lite-260215",
        messages: [
          { role: "system", content: "只返回 JSON" },
          { role: "user", content: "生成文章" },
        ],
      }),
      {
        model: "doubao-seed-2-0-lite-260215",
        messages: [
          { role: "system", content: "只返回 JSON" },
          { role: "user", content: "生成文章" },
        ],
        stream: true,
        stream_options: {
          include_usage: true,
        },
        thinking: { type: "disabled" },
        temperature: 0.1,
      },
    );
  });

  it("parses raw JSON-line stream chunks into assistant content", () => {
    const content = parseDoubaoStreamText(
      [
        '{"choices":[{"delta":{"reasoning_content":"思考内容","content":"","role":"assistant"},"index":0}],"model":"m"}',
        '{"choices":[{"delta":{"content":"{\\"title\\":\\"标题\\",","role":"assistant"},"index":0}],"model":"m"}',
        '{"choices":[{"delta":{"content":"\\"outline\\":[\\"一\\"],\\"bodyText\\":\\"正文\\"}","role":"assistant"},"index":0}],"model":"m"}',
        '{"choices":[],"bot_usage":{"model_usage":[{"total_tokens":12}]}}',
        "[DONE]",
      ].join("\n"),
    );

    assert.equal(content, '{"title":"标题","outline":["一"],"bodyText":"正文"}');
  });

  it("parses SSE data-prefixed stream chunks into assistant content", () => {
    const content = parseDoubaoStreamText(
      [
        'data: {"choices":[{"delta":{"content":"Hello","role":"assistant"},"index":0}]}',
        'data: {"choices":[{"delta":{"content":" world","role":"assistant"},"index":0}]}',
        "data: [DONE]",
      ].join("\n\n"),
    );

    assert.equal(content, "Hello world");
  });
});
