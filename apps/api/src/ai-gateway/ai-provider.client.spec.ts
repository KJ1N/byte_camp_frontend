import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiProviderClient, getProviderErrorDetail, type AiProviderTextDelta } from "./ai-provider.client";

const ClientCtor = AiProviderClient as unknown as new (...args: unknown[]) => AiProviderClient;

describe("AiProviderClient", () => {
  it("yields Doubao delta content before the upstream stream finishes", async () => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    const client = new ClientCtor(async () => new Response(stream, { status: 200 }));

    controller?.enqueue(
      encoder.encode('data: {"choices":[{"delta":{"content":"first "},"index":0}]}\n\n'),
    );

    const iterator = client
      .streamText({
        apiKey: "test-key",
        model: "test-model",
        messages: [{ role: "user", content: "only JSON" }],
        timeoutMs: 12_000,
        maxRetries: 0,
      })[Symbol.asyncIterator]();

    const first = await iterator.next();

    assert.deepEqual(first, {
      done: false,
      value: { model: "test-model", content: "first " },
    });

    controller?.enqueue(
      encoder.encode('data: {"choices":[{"delta":{"content":"second"},"index":0}]}\n\n'),
    );
    controller?.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller?.close();

    const second = await iterator.next();
    const done = await iterator.next();

    assert.deepEqual(second, {
      done: false,
      value: { model: "test-model", content: "second" },
    });
    assert.deepEqual(done, { done: true, value: undefined });
  });

  it("sends a Doubao streaming chat completions request and joins delta content", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new ClientCtor(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        [
          '{"choices":[{"delta":{"content":"{\\"title\\":\\"ok\\",","role":"assistant"},"index":0}],"model":"actual-model"}',
          '{"choices":[{"delta":{"content":"\\"outline\\":[\\"一\\"],\\"bodyText\\":\\"正文\\"}","role":"assistant"},"index":0}],"model":"actual-model"}',
          "[DONE]",
        ].join("\n"),
        { status: 200 },
      );
    });

    const response = await client.complete({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      model: "test-model",
      messages: [{ role: "user", content: "只返回 JSON" }],
      timeoutMs: 12_000,
      maxRetries: 0,
    });

    assert.equal(response.model, "test-model");
    assert.equal(response.content, '{"title":"ok","outline":["一"],"bodyText":"正文"}');
    assert.equal(calls[0].url, "https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(Object.fromEntries(new Headers(calls[0].init.headers).entries()), {
      authorization: "Bearer test-key",
      "content-type": "application/json",
    });
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      model: "test-model",
      messages: [{ role: "user", content: "只返回 JSON" }],
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: "disabled" },
      temperature: 0.1,
    });
  });

  it("returns token usage when the provider stream includes usage chunks", async () => {
    const client = new ClientCtor(async () => {
      return new Response(
        [
          'data: {"choices":[{"delta":{"content":"{\\"title\\":\\"ok\\"}","role":"assistant"},"index":0}]}',
          'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":6,"total_tokens":16}}',
          "data: [DONE]",
        ].join("\n\n"),
        { status: 200 },
      );
    });

    const response = await client.complete({
      apiKey: "test-key",
      model: "test-model",
      messages: [{ role: "user", content: "只返回 JSON" }],
      timeoutMs: 12_000,
      maxRetries: 0,
    });

    assert.deepEqual(response, {
      model: "test-model",
      content: '{"title":"ok"}',
      tokenUsage: {
        totalTokens: 16,
        promptTokens: 10,
        completionTokens: 6,
      },
    });
  });

  it("emits a usage-only delta for stream diagnostics", async () => {
    const client = new ClientCtor(async () => {
      return new Response(
        [
          'data: {"choices":[{"delta":{"content":"正文","role":"assistant"},"index":0}]}',
          'data: {"choices":[],"bot_usage":{"model_usage":[{"total_tokens":9}]}}',
          "data: [DONE]",
        ].join("\n\n"),
        { status: 200 },
      );
    });

    const deltas: AiProviderTextDelta[] = [];
    for await (const delta of client.streamText({
      apiKey: "test-key",
      model: "test-model",
      messages: [{ role: "user", content: "只返回 JSON" }],
      timeoutMs: 12_000,
      maxRetries: 0,
    })) {
      deltas.push(delta);
    }

    assert.deepEqual(deltas, [
      { model: "test-model", content: "正文" },
      { model: "test-model", content: "", tokenUsage: { totalTokens: 9, promptTokens: null, completionTokens: null } },
    ]);
  });

  it("maps provider timeout failures to a gateway timeout error", async () => {
    const client = new ClientCtor(async () => {
      throw new Error("Request timed out");
    });

    await assert.rejects(
      () =>
        client.complete({
          apiKey: "test-key",
          model: "test-model",
          messages: [{ role: "user", content: "只返回 JSON" }],
          timeoutMs: 1,
          maxRetries: 0,
        }),
      (error: unknown) => {
        assert.equal((error as { getStatus?: () => number }).getStatus?.(), 504);
        return true;
      },
    );
  });

  it("maps provider response read timeouts to a gateway timeout error", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull() {
          throw new DOMException("The operation was aborted.", "AbortError");
        },
      }),
      { status: 200 },
    );
    const client = new ClientCtor(async () => response);

    await assert.rejects(
      () =>
        client.complete({
          apiKey: "test-key",
          model: "test-model",
          messages: [{ role: "user", content: "只返回 JSON" }],
          timeoutMs: 1,
          maxRetries: 0,
        }),
      (error: unknown) => {
        assert.equal((error as { getStatus?: () => number }).getStatus?.(), 504);
        return true;
      },
    );
  });

  it("maps malformed provider stream chunks to a bad gateway error", async () => {
    const client = new ClientCtor(async () => new Response("not-json", { status: 200 }));

    await assert.rejects(
      () =>
        client.complete({
          apiKey: "test-key",
          model: "test-model",
          messages: [{ role: "user", content: "只返回 JSON" }],
          timeoutMs: 12_000,
          maxRetries: 0,
        }),
      (error: unknown) => {
        assert.equal((error as { getStatus?: () => number }).getStatus?.(), 502);
        return true;
      },
    );
  });

  it("keeps safe provider error details for diagnostics", () => {
    const detail = getProviderErrorDetail({
      status: 404,
      code: "model_not_found",
      message: "The model does not exist or you do not have access to it.",
      headers: { authorization: "Bearer secret" },
    });

    assert.deepEqual(detail, {
      providerStatus: 404,
      providerCode: "model_not_found",
      providerMessage: "The model does not exist or you do not have access to it.",
    });
  });
});
