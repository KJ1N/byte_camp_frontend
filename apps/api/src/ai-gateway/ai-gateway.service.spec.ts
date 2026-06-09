import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuditDecision, RiskCategory } from "@bytecamp-aigc/shared";
import { AiGatewayService } from "./ai-gateway.service";
import type { AiRequestLogPayload } from "./ai-request-log";

type ConfigValues = Record<string, string | undefined>;

interface ProviderCall {
  model: string;
  messages: Array<{ role: string; content: string }>;
}

const ServiceCtor = AiGatewayService as unknown as new (...args: unknown[]) => AiGatewayService;

function createConfig(values: ConfigValues) {
  return {
    get: (key: string) => values[key],
  };
}

function createPromptsService() {
  return {
    getStarterPrompt: async () => ({
      systemPrompt: "You are a Chinese article assistant. Return JSON only.",
      userTemplate: "Topic: {{topic}}\nAudience: {{audience}}\nStyle: {{style}}",
    }),
    getUsablePrompt: async () => ({
      systemPrompt: "Use the selected prompt. Return JSON only.",
      userTemplate: "Selected topic: {{topic}} Audience: {{audience}} Style: {{style}}",
    }),
  };
}

function createProvider(content: string, tokenUsage?: AiRequestLogPayload["tokenUsage"]) {
  const calls: ProviderCall[] = [];

  return {
    calls,
    complete: async (input: ProviderCall) => {
      calls.push(input);
      return { model: "live-model", content, ...(tokenUsage ? { tokenUsage } : {}) };
    },
  };
}

function createStreamingProvider(
  firstChunk: string,
  restContent: string,
  tokenUsage?: AiRequestLogPayload["tokenUsage"],
) {
  const calls: ProviderCall[] = [];
  let releaseRest: (() => void) | undefined;
  const waitForRest = new Promise<void>((resolve) => {
    releaseRest = resolve;
  });

  return {
    calls,
    releaseRest: () => releaseRest?.(),
    complete: async () => {
      throw new Error("stream endpoints should not wait for complete provider output");
    },
    streamText: async function* (input: ProviderCall) {
      calls.push(input);
      yield { model: "live-model", content: firstChunk };
      await waitForRest;
      yield { model: "live-model", content: restContent };
      if (tokenUsage) {
        yield { model: "live-model", content: "", tokenUsage };
      }
    },
  };
}

function createRequestLogger() {
  const logs: AiRequestLogPayload[] = [];

  return {
    logs,
    log: (payload: AiRequestLogPayload) => {
      logs.push(payload);
    },
  };
}

const liveConfig = createConfig({
  AI_PROVIDER_MODE: "live",
  AI_API_KEY: "test-key",
  AI_MODEL: "test-model",
  AI_BASE_URL: "https://example.test/v1",
  AI_TIMEOUT_MS: "12000",
  AI_MAX_RETRIES: "0",
});

const generationInput = {
  topic: "AI writing",
  audience: "content creators",
  style: "practical",
};

describe("AiGatewayService", () => {
  it("uses the live provider and parses structured article JSON", async () => {
    const logger = createRequestLogger();
    const provider = createProvider(
      JSON.stringify({
        title: "How AI changes content creation",
        outline: ["Efficiency", "Workflow", "Risk control"],
        bodyText: "AI helps creators draft faster.\n\nCreators still edit and decide.",
      }),
      { totalTokens: 42, promptTokens: 20, completionTokens: 22 },
    );
    const service = new ServiceCtor(liveConfig, createPromptsService(), provider, logger);

    const response = await service.generateArticleDraft(generationInput);

    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].model, "test-model");
    assert.match(provider.calls[0].messages[1].content, /AI writing/);
    assert.equal(response.model, "live-model");
    assert.equal(response.title, "How AI changes content creation");
    assert.deepEqual(response.outline, ["Efficiency", "Workflow", "Risk control"]);
    assert.match(response.bodyText, /draft faster/);
    assert.equal(response.body.type, "doc");
    assert.equal(response.body.content.length, 2);
    assert.equal(logger.logs.length, 1);
    assert.equal(logger.logs[0].feature, "article_generation");
    assert.equal(logger.logs[0].providerMode, "live");
    assert.equal(logger.logs[0].model, "live-model");
    assert.equal(logger.logs[0].status, "success");
    assert.deepEqual(logger.logs[0].tokenUsage, { totalTokens: 42, promptTokens: 20, completionTokens: 22 });
    assert.ok(logger.logs[0].requestId);
    assert.ok(logger.logs[0].durationMs >= 0);
  });

  it("extracts JSON when the live provider wraps it in a markdown code block", async () => {
    const provider = createProvider(`\`\`\`json
{
  "title": "From idea to publish",
  "outline": ["Input", "Draft", "Audit"],
  "bodyText": "First paragraph.\\n\\nSecond paragraph."
}
\`\`\``);
    const service = new ServiceCtor(liveConfig, createPromptsService(), provider);

    const response = await service.generateArticleDraft(generationInput);

    assert.equal(response.title, "From idea to publish");
    assert.deepEqual(response.outline, ["Input", "Draft", "Audit"]);
    assert.equal(response.body.content.length, 2);
  });

  it("falls back to mock output in auto mode when credentials are placeholders", async () => {
    const logger = createRequestLogger();
    const provider = createProvider(
      JSON.stringify({
        title: "Should not call live provider",
        outline: ["Should not appear"],
        bodyText: "Should not appear",
      }),
    );
    const service = new ServiceCtor(
      createConfig({
        AI_PROVIDER_MODE: "auto",
        AI_API_KEY: "replace-with-your-key",
        AI_MODEL: "replace-with-your-model",
      }),
      createPromptsService(),
      provider,
      logger,
    );

    const response = await service.generateArticleDraft(generationInput);

    assert.equal(provider.calls.length, 0);
    assert.equal(response.model, "mock-model");
    assert.match(response.title, /AI writing/);
    assert.equal(logger.logs.length, 1);
    assert.equal(logger.logs[0].providerMode, "mock");
    assert.equal(logger.logs[0].status, "success");
    assert.deepEqual(logger.logs[0].tokenUsage, { totalTokens: null, promptTokens: null, completionTokens: null });
  });

  it("throws a service unavailable error when live mode is missing credentials", async () => {
    const service = new ServiceCtor(
      createConfig({
        AI_PROVIDER_MODE: "live",
        AI_MODEL: "test-model",
      }),
      createPromptsService(),
      createProvider("{}"),
    );

    await assert.rejects(
      () => service.generateArticleDraft(generationInput),
      (error: unknown) => {
        assert.equal((error as { getStatus?: () => number }).getStatus?.(), 503);
        return true;
      },
    );
  });

  it("throws a bad gateway error when live provider output is not valid article JSON", async () => {
    const logger = createRequestLogger();
    const service = new ServiceCtor(liveConfig, createPromptsService(), createProvider("not json"), logger);

    await assert.rejects(
      () => service.generateArticleDraft(generationInput),
      (error: unknown) => {
        assert.equal((error as { getStatus?: () => number }).getStatus?.(), 502);
        return true;
      },
    );
    assert.equal(logger.logs.length, 1);
    assert.equal(logger.logs[0].status, "error");
    assert.match(logger.logs[0].errorCode ?? "", /AiProviderBadOutputException|BadGatewayException/);
  });

  it("uses the live provider for structured content audit", async () => {
    const provider = createProvider(
      JSON.stringify({
        decision: "WARN",
        riskLevel: "medium",
        categories: ["SENSITIVE_INFO"],
        evidence: [{ text: "手机号", reason: "包含敏感个人信息" }],
        rewriteSuggestions: ["删除或脱敏个人信息"],
        summary: "内容需要修改后重新审核。",
      }),
    );
    const service = new ServiceCtor(liveConfig, createPromptsService(), provider);

    const result = await service.auditContent("案例里包含手机号，需要发布前处理。");

    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].model, "test-model");
    assert.match(provider.calls[0].messages[0].content, /内容安全审核助理/);
    assert.match(provider.calls[0].messages[1].content, /手机号/);
    assert.equal(result.decision, AuditDecision.Warn);
    assert.equal(result.riskLevel, "medium");
    assert.deepEqual(result.categories, [RiskCategory.SensitiveInfo]);
    assert.equal(result.model, "live-model");
    assert.equal(result.source, "MODEL");
  });

  it("returns deterministic mock content audit results in mock mode", async () => {
    const service = new ServiceCtor(
      createConfig({
        AI_PROVIDER_MODE: "mock",
        AI_MODEL: "mock-model",
      }),
      createPromptsService(),
      createProvider("{}"),
    );

    const block = await service.auditContent("参与赌博可以快速回本。");
    const warn = await service.auditContent("案例里包含身份证号和手机号。");
    const pass = await service.auditContent("AI 可以帮助创作者梳理选题并优化表达。");

    assert.equal(block.decision, AuditDecision.Block);
    assert.equal(block.source, "MOCK");
    assert.ok(block.categories.includes(RiskCategory.Gambling));
    assert.equal(warn.decision, AuditDecision.Warn);
    assert.ok(warn.categories.includes(RiskCategory.SensitiveInfo));
    assert.equal(pass.decision, AuditDecision.Pass);
    assert.deepEqual(pass.categories, []);
  });

  it("returns creator inspirations with topics that can prefill the workspace", async () => {
    const service = new AiGatewayService({
      get: (key: string) => (key === "AI_MODEL" ? "mock-model" : undefined),
    } as never);

    const response = await (service as unknown as {
      generateCreatorInspirations: () => Promise<{
        model: string;
        items: Array<{ id: string; topic: string; reason: string; category: string }>;
      }>;
    }).generateCreatorInspirations();

    assert.equal(response.model, "mock-model");
    assert.ok(response.items.length >= 5);

    for (const item of response.items) {
      assert.ok(item.id.trim());
      assert.ok(item.topic.trim());
      assert.ok(item.reason.trim());
      assert.ok(item.category.trim());
    }
  });

  it("streams mock article generation events in render order", async () => {
    const service = new ServiceCtor(
      createConfig({
        AI_PROVIDER_MODE: "mock",
        AI_MODEL: "mock-model",
      }),
      createPromptsService(),
      createProvider("{}"),
    );

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    for await (const event of service.streamArticleDraft({ ...generationInput, promptId: "prompt-1" }, "user-1")) {
      events.push(event);
    }

    assert.deepEqual(
      events.map((event) => event.event),
      ["meta", "title", "outline", "body-delta", "body-delta", "body-delta", "body-delta", "done"],
    );
    assert.equal(events[0].data.model, "mock-model");
    assert.ok("text" in events[1].data);
    assert.ok("body" in events.at(-1)!.data);
  });

  it("streams mock title candidates one by one", async () => {
    const service = new ServiceCtor(
      createConfig({
        AI_PROVIDER_MODE: "mock",
        AI_MODEL: "mock-model",
      }),
      createPromptsService(),
      createProvider("{}"),
    );

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    for await (const event of service.streamTitleOptimization(generationInput)) {
      events.push(event);
    }

    assert.deepEqual(events.map((event) => event.event), ["meta", "title", "title", "title", "done"]);
    assert.match(String(events[1].data.text), /AI writing/);
  });

  it("streams mock rewrite text before suggestions and done", async () => {
    const service = new ServiceCtor(
      createConfig({
        AI_PROVIDER_MODE: "mock",
        AI_MODEL: "mock-model",
      }),
      createPromptsService(),
      createProvider("{}"),
    );

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    for await (const event of service.streamRewrite({
      text: "Original paragraph",
      mode: "POLISH" as never,
      topic: "AI writing",
      audience: "creators",
    })) {
      events.push(event);
    }

    assert.deepEqual(
      events.map((event) => event.event),
      ["meta", "text-delta", "suggestion", "suggestion", "done"],
    );
    assert.match(String(events[1].data.text), /Original paragraph/);
    assert.ok("suggestions" in events.at(-1)!.data);
  });

  it("streams mock compliance rewrite text with a rich-text body in done", async () => {
    const service = new ServiceCtor(
      createConfig({
        AI_PROVIDER_MODE: "mock",
        AI_MODEL: "mock-model",
      }),
      createPromptsService(),
      createProvider("{}"),
    );

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    for await (const event of service.streamComplianceRewrite({
      title: "发布前安全检查",
      bodyText: "文章包含身份证号和手机号，需要发布前处理。",
      audit: {
        decision: AuditDecision.Warn,
        riskLevel: "medium",
        categories: [RiskCategory.SensitiveInfo],
        evidence: [{ text: "身份证号和手机号", reason: "包含敏感个人信息" }],
        rewriteSuggestions: ["删除或脱敏个人信息"],
        summary: "内容需要修改后重新审核。",
      },
    })) {
      events.push(event);
    }

    assert.deepEqual(
      events.map((event) => event.event),
      ["meta", "text-delta", "suggestion", "done"],
    );
    assert.match(String(events[1].data.text), /合规改写后/);
    assert.ok("bodyText" in events.at(-1)!.data);
    assert.deepEqual((events.at(-1)!.data.body as { type: string }).type, "doc");
  });

  it("streams live article body deltas before the provider stream finishes", async () => {
    const logger = createRequestLogger();
    const provider = createStreamingProvider(
      '{"title":"Live title","outline":["Intro"],"bodyText":"First ',
      'paragraph."}',
      { totalTokens: 31, promptTokens: 14, completionTokens: 17 },
    );
    const service = new ServiceCtor(liveConfig, createPromptsService(), provider, logger);
    const iterator = service.streamArticleDraft(generationInput, "user-1")[Symbol.asyncIterator]();

    assert.equal((await iterator.next()).value.event, "meta");

    const title = await iterator.next();
    const bodyDelta = await iterator.next();

    assert.deepEqual(title.value, { event: "title", data: { text: "Live title" } });
    assert.deepEqual(bodyDelta.value, { event: "body-delta", data: { text: "First " } });

    provider.releaseRest();
    for await (const _event of iterator) {
      // drain the stream after releasing the provider remainder
    }
    assert.equal(logger.logs.length, 1);
    assert.equal(logger.logs[0].feature, "article_generation");
    assert.equal(logger.logs[0].providerMode, "live");
    assert.equal(logger.logs[0].status, "success");
    assert.deepEqual(logger.logs[0].tokenUsage, { totalTokens: 31, promptTokens: 14, completionTokens: 17 });
  });

  it("streams live title candidates before the provider stream finishes", async () => {
    const provider = createStreamingProvider('{"titles":["First ', 'title","Second title","Third title"]}');
    const service = new ServiceCtor(liveConfig, createPromptsService(), provider);
    const iterator = service.streamTitleOptimization(generationInput)[Symbol.asyncIterator]();

    assert.equal((await iterator.next()).value.event, "meta");

    const firstTitle = await iterator.next();

    assert.deepEqual(firstTitle.value, { event: "title", data: { text: "First ", index: 0, partial: true } });

    provider.releaseRest();
    for await (const _event of iterator) {
      // drain the stream after releasing the provider remainder
    }
  });

  it("streams live rewrite text deltas before the provider stream finishes", async () => {
    const provider = createStreamingProvider('{"text":"Polished ', 'text","suggestions":["Add evidence"]}');
    const service = new ServiceCtor(liveConfig, createPromptsService(), provider);
    const iterator = service.streamRewrite({
      text: "Original paragraph",
      mode: "POLISH" as never,
      topic: "AI writing",
      audience: "creators",
    })[Symbol.asyncIterator]();

    assert.equal((await iterator.next()).value.event, "meta");

    const textDelta = await iterator.next();

    assert.deepEqual(textDelta.value, { event: "text-delta", data: { text: "Polished " } });

    provider.releaseRest();
    for await (const _event of iterator) {
      // drain the stream after releasing the provider remainder
    }
  });
});
