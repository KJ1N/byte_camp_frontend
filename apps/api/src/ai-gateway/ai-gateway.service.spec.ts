import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiGatewayService } from "./ai-gateway.service";

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
      systemPrompt: "你是 AI Creator Hub 的中文创作助手，只返回 JSON。",
      userTemplate: "主题：{{topic}}\n受众：{{audience}}\n风格：{{style}}\n请生成文章。",
    }),
  };
}

function createProvider(content: string) {
  const calls: ProviderCall[] = [];

  return {
    calls,
    complete: async (input: ProviderCall) => {
      calls.push(input);
      return { model: "live-model", content };
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
  topic: "AI 如何改变内容创作",
  audience: "内容创作者",
  style: "科普",
};

describe("AiGatewayService", () => {
  it("uses the live provider and parses structured article JSON", async () => {
    const provider = createProvider(
      JSON.stringify({
        title: "AI 改变内容创作的三个关键变化",
        outline: ["效率提升", "流程重组", "风险控制"],
        bodyText: "AI 让创作者更快形成初稿。\n\n创作者仍然需要负责判断和编辑。",
      }),
    );
    const service = new ServiceCtor(liveConfig, createPromptsService(), provider);

    const response = await service.generateArticleDraft(generationInput);

    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].model, "test-model");
    assert.match(provider.calls[0].messages[1].content, /AI 如何改变内容创作/);
    assert.equal(response.model, "live-model");
    assert.equal(response.title, "AI 改变内容创作的三个关键变化");
    assert.deepEqual(response.outline, ["效率提升", "流程重组", "风险控制"]);
    assert.match(response.bodyText, /更快形成初稿/);
    assert.equal(response.body.type, "doc");
    assert.equal(response.body.content.length, 2);
  });

  it("extracts JSON when the live provider wraps it in a markdown code block", async () => {
    const provider = createProvider(`\`\`\`json
{
  "title": "从灵感到发布的 AI 工作流",
  "outline": ["输入", "生成", "审核"],
  "bodyText": "第一段正文。\\n\\n第二段正文。"
}
\`\`\``);
    const service = new ServiceCtor(liveConfig, createPromptsService(), provider);

    const response = await service.generateArticleDraft(generationInput);

    assert.equal(response.title, "从灵感到发布的 AI 工作流");
    assert.deepEqual(response.outline, ["输入", "生成", "审核"]);
    assert.equal(response.body.content.length, 2);
  });

  it("falls back to mock output in auto mode when credentials are placeholders", async () => {
    const provider = createProvider(
      JSON.stringify({
        title: "不应调用真实模型",
        outline: ["不应出现"],
        bodyText: "不应出现",
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
    );

    const response = await service.generateArticleDraft(generationInput);

    assert.equal(provider.calls.length, 0);
    assert.equal(response.model, "mock-model");
    assert.match(response.title, /AI 如何改变内容创作/);
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
        assert.match((error as Error).message, /AI 配置缺失/);
        return true;
      },
    );
  });

  it("throws a bad gateway error when live provider output is not valid article JSON", async () => {
    const service = new ServiceCtor(liveConfig, createPromptsService(), createProvider("这不是 JSON"));

    await assert.rejects(
      () => service.generateArticleDraft(generationInput),
      (error: unknown) => {
        assert.equal((error as { getStatus?: () => number }).getStatus?.(), 502);
        assert.match((error as Error).message, /模型输出解析失败/);
        return true;
      },
    );
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
});
