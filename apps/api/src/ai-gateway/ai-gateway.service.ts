import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CreatorInspirationsResponse,
  GeneratedArticleDraft,
  GenerateArticleInput,
  RichTextDocument,
} from "@bytecamp-aigc/shared";
import { PromptsService } from "../prompts/prompts.service";
import { AiProviderClient } from "./ai-provider.client";
import { AiProviderConfigurationException } from "./ai-gateway.errors";
import {
  ARTICLE_GENERATION_CATEGORY,
  buildArticleGenerationMessages,
  defaultArticleGenerationPrompt,
  parseArticleGenerationJson,
  type ArticleGenerationPrompt,
} from "./ai-gateway.prompts";

type ProviderMode = "auto" | "mock" | "live";

interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

@Injectable()
export class AiGatewayService {
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly promptsService?: PromptsService,
    @Optional() private readonly providerClient?: AiProviderClient,
  ) {}

  async generateArticleDraft(input: GenerateArticleInput): Promise<GeneratedArticleDraft> {
    if (!this.shouldUseLiveProvider()) {
      return this.generateMockArticleDraft(input);
    }

    const providerConfig = this.getRequiredProviderConfig();
    const prompt = await this.getArticleGenerationPrompt();
    const completion = await this.getProviderClient().complete({
      ...providerConfig,
      messages: buildArticleGenerationMessages(input, prompt),
    });
    const article = parseArticleGenerationJson(completion.content);

    return {
      model: completion.model,
      title: article.title,
      outline: article.outline,
      bodyText: article.bodyText,
      body: this.toRichTextDocument(this.paragraphsFromText(article.bodyText)),
    };
  }

  private async generateMockArticleDraft(input: GenerateArticleInput): Promise<GeneratedArticleDraft> {
    const model = this.getMockModel();
    const outline = ["趋势背景", "核心机会", "实践方法", "风险与边界", "行动建议"];
    const bodyText = [
      `面向${input.audience}，${input.topic}正在从单点工具升级为完整的内容生产链路。`,
      `在${input.style}风格下，创作者可以先用 AI 形成标题、大纲和正文，再通过人工编辑补充真实案例、观点和表达节奏。`,
      "真正有价值的创作流程不是把内容完全交给模型，而是让模型负责初稿、改写和校对，让创作者负责判断、取舍和最终表达。",
      "发布前仍需要经过内容安全审核和质量评分，确保文章既有可读性，也符合平台规则。",
    ].join("\n\n");
    const body = this.toRichTextDocument([
      `围绕「${input.topic}」的创作方向`,
      ...bodyText.split("\n\n"),
      "下一步建议：补充一个具体案例，并用更明确的行动建议收束全文。",
    ]);

    return {
      model,
      title: `${input.topic}：创作者需要知道的 5 个变化`,
      outline,
      bodyText,
      body,
    };
  }

  async generateCreatorInspirations(): Promise<CreatorInspirationsResponse> {
    const model = this.getMockModel();

    return {
      model,
      items: [
        {
          id: "inspiration-1",
          topic: "普通人如何用 AI 建立稳定的写作流程",
          reason: "适合从效率、步骤和工具边界展开，能直接转成方法型图文。",
          category: "AI 创作",
        },
        {
          id: "inspiration-2",
          topic: "为什么优质内容需要先写大纲再写正文",
          reason: "贴合新手创作者痛点，也能自然引出 AI 辅助生成大纲的价值。",
          category: "写作方法",
        },
        {
          id: "inspiration-3",
          topic: "一篇图文发布前应该检查哪些风险",
          reason: "能连接平台审核、事实表达、敏感信息和发布前自查流程。",
          category: "内容安全",
        },
        {
          id: "inspiration-4",
          topic: "如何把零散灵感整理成可发布的长图文",
          reason: "适合演示从主题到标题、大纲、正文、草稿保存的完整闭环。",
          category: "创作流程",
        },
        {
          id: "inspiration-5",
          topic: "AI 生成内容为什么仍然需要人工编辑",
          reason: "容易形成观点型文章，强调创作者判断、取舍和最终表达。",
          category: "人机协作",
        },
      ],
    };
  }

  private toRichTextDocument(paragraphs: string[]): RichTextDocument {
    return {
      type: "doc",
      content: paragraphs.map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text }],
      })),
    };
  }

  private async getArticleGenerationPrompt(): Promise<ArticleGenerationPrompt> {
    return (
      (await this.promptsService?.getStarterPrompt(ARTICLE_GENERATION_CATEGORY)) ??
      defaultArticleGenerationPrompt
    );
  }

  private shouldUseLiveProvider() {
    const mode = this.getProviderMode();

    if (mode === "mock") return false;
    if (mode === "live") return true;

    return this.hasUsableLiveConfig();
  }

  private getRequiredProviderConfig(): ProviderConfig {
    const apiKey = this.readConfig("AI_API_KEY");
    const model = this.readConfig("AI_MODEL");

    if (!apiKey || !model || this.isPlaceholder(apiKey) || this.isPlaceholder(model)) {
      throw new AiProviderConfigurationException();
    }

    return {
      apiKey,
      baseUrl: this.optionalConfig("AI_BASE_URL"),
      model,
      timeoutMs: this.readPositiveInt("AI_TIMEOUT_MS", 60_000),
      maxRetries: this.readNonNegativeInt("AI_MAX_RETRIES", 1),
    };
  }

  private hasUsableLiveConfig() {
    return !this.isPlaceholder(this.readConfig("AI_API_KEY")) && !this.isPlaceholder(this.readConfig("AI_MODEL"));
  }

  private getProviderClient() {
    return this.providerClient ?? new AiProviderClient();
  }

  private getProviderMode(): ProviderMode {
    const rawMode = this.readConfig("AI_PROVIDER_MODE")?.toLowerCase();

    if (rawMode === "live" || rawMode === "mock" || rawMode === "auto") {
      return rawMode;
    }

    return "auto";
  }

  private getMockModel() {
    const configuredModel = this.readConfig("AI_MODEL");
    if (this.isPlaceholder(configuredModel)) return "mock-model";
    return configuredModel ?? "mock-model";
  }

  private paragraphsFromText(text: string) {
    return text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
  }

  private readConfig(key: string) {
    const value = this.config.get<string>(key);
    return typeof value === "string" ? value.trim() : undefined;
  }

  private optionalConfig(key: string) {
    const value = this.readConfig(key);
    return this.isPlaceholder(value) ? undefined : value;
  }

  private readPositiveInt(key: string, fallback: number) {
    const value = Number.parseInt(this.readConfig(key) ?? "", 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private readNonNegativeInt(key: string, fallback: number) {
    const value = Number.parseInt(this.readConfig(key) ?? "", 10);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private isPlaceholder(value: string | undefined) {
    return !value || value.startsWith("replace-with-") || value.includes("your-");
  }
}
