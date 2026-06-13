import { BadRequestException, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AiStreamEvent,
  AuditResult,
  ComplianceRewriteContext,
  CreatorInspirationsResponse,
  GeneratedArticleDraft,
  GeneratedImageResult,
  GeneratedMultimodalDraft,
  GenerateArticleInput,
  GenerateMultimodalInput,
  MultimodalGenerationProgress,
  MultimodalGenerationProgressImage,
  MultimodalImagePlan,
  MultimodalImageResult,
  OptimizeTitlesInput,
  QualityScore,
  RichTextDocument,
  RichTextNode,
  RewriteArticleInput,
  RewriteArticleResponse,
} from "@bytecamp-aigc/shared";
import { AuditDecision, RiskCategory, qualityWeights } from "@bytecamp-aigc/shared";
import { GeneratedImageStorageService } from "../assets/generated-image-storage.service";
import { PromptsService } from "../prompts/prompts.service";
import {
  AiProviderClient,
  type AiChatMessage,
  type AiProviderTextDelta,
  type AiTokenUsage,
} from "./ai-provider.client";
import { AiProviderConfigurationException } from "./ai-gateway.errors";
import {
  AiRequestLogger,
  createAiRequestMetric,
  createEmptyAiTokenUsage,
  finishAiRequestMetric,
  mergeAiTokenUsage,
  type AiRequestFeature,
  type AiRequestMetric,
  type AiRequestProviderMode,
} from "./ai-request-log";
import {
  ARTICLE_GENERATION_CATEGORY,
  buildArticleGenerationMessages,
  buildComplianceRewriteMessages,
  buildContentAuditMessages,
  buildMultimodalGenerationMessages,
  buildQualityScoringMessages,
  buildRewriteMessages,
  buildTitleOptimizationMessages,
  defaultArticleGenerationPrompt,
  defaultMultimodalGenerationPrompt,
  MULTIMODAL_GENERATION_CATEGORY,
  parseAuditJson,
  parseArticleGenerationJson,
  parseMultimodalGenerationJson,
  parseQualityScoreJson,
  parseRewriteJson,
  parseTitleOptimizationJson,
  type ArticleGenerationPrompt,
} from "./ai-gateway.prompts";

type ProviderMode = "auto" | "mock" | "live";
type RewriteModeValue = "POLISH" | "EXPAND" | "SHORTEN" | "CHANGE_STYLE";
const rewriteModes = new Set(["POLISH", "EXPAND", "SHORTEN", "CHANGE_STYLE"]);

interface MockAuditRule {
  pattern: RegExp;
  decision: AuditDecision.Warn | AuditDecision.Block;
  riskLevel: "medium" | "high";
  category: RiskCategory;
  reason: string;
  suggestion: string;
}

const mockAuditRules: MockAuditRule[] = [
  {
    pattern: /赌博|博彩|赌场/,
    decision: AuditDecision.Block,
    riskLevel: "high",
    category: RiskCategory.Gambling,
    reason: "命中赌博或博彩引导表达，发布风险高。",
    suggestion: "删除赌博相关表达，改为中性的风险提示或合规案例。",
  },
  {
    pattern: /毒品|违禁品/,
    decision: AuditDecision.Block,
    riskLevel: "high",
    category: RiskCategory.Drugs,
    reason: "命中毒品或违禁品相关表达，禁止发布。",
    suggestion: "删除违禁品相关内容，避免任何引导、交易或使用描述。",
  },
  {
    pattern: /违法犯罪|犯罪教程|绕过监管/,
    decision: AuditDecision.Block,
    riskLevel: "high",
    category: RiskCategory.Illegal,
    reason: "命中违法犯罪引导表达，禁止发布。",
    suggestion: "改为合法合规的风险教育表达，不提供操作细节。",
  },
  {
    pattern: /身份证号|手机号|银行卡|住址|微信号|联系方式/,
    decision: AuditDecision.Warn,
    riskLevel: "medium",
    category: RiskCategory.SensitiveInfo,
    reason: "内容可能包含敏感个人信息，需要脱敏或删除。",
    suggestion: "将个人信息替换为脱敏表达，例如“某用户”或“尾号后四位”。",
  },
  {
    pattern: /低俗|露骨|色情|擦边/,
    decision: AuditDecision.Warn,
    riskLevel: "medium",
    category: RiskCategory.Adult,
    reason: "内容包含低俗或露骨表达，需要调整措辞。",
    suggestion: "删除刺激性描述，改为客观、中性的内容说明。",
  },
  {
    pattern: /绝对稳赚|包治百病|医疗偏方|稳赚不赔|百分百见效|无需就医/,
    decision: AuditDecision.Warn,
    riskLevel: "medium",
    category: RiskCategory.Misleading,
    reason: "内容可能包含绝对化、医疗或金融误导表达。",
    suggestion: "补充来源和风险提示，避免承诺收益或疗效。",
  },
  {
    pattern: /私聊我|加微信|刷粉|引流|私下交易/,
    decision: AuditDecision.Warn,
    riskLevel: "medium",
    category: RiskCategory.LowQuality,
    reason: "内容可能包含广告导流或低质量营销表达。",
    suggestion: "删除导流话术，保留与文章主题直接相关的客观信息。",
  },
];

interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

const defaultImageModel = "doubao-seedream-4-5-251128";

interface MultimodalGenerationPlan {
  textModel: string;
  imageModel: string;
  title: string;
  outline: string[];
  bodyText: string;
  images: MultimodalImagePlan[];
}

export class MultimodalGenerationCancelledError extends Error {
  constructor() {
    super("多模态生成任务已取消。");
    this.name = "MultimodalGenerationCancelledError";
  }
}

export interface MultimodalGenerationProgressOptions {
  reportProgress?: (progress: MultimodalGenerationProgress) => void | Promise<void>;
  shouldCancel?: () => boolean | Promise<boolean>;
}

@Injectable()
export class AiGatewayService {
  private readonly fallbackRequestLogger = new AiRequestLogger();

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly promptsService?: PromptsService,
    @Optional() private readonly providerClient?: AiProviderClient,
    @Optional() private readonly requestLogger?: AiRequestLogger,
    @Optional() private readonly generatedImageStorage?: GeneratedImageStorageService,
  ) {}

  async generateArticleDraft(input: GenerateArticleInput, userId?: string): Promise<GeneratedArticleDraft> {
    if (!this.shouldUseLiveProvider()) {
      const metric = this.createAiRequestMetric("article_generation", "mock", this.getMockModel());

      try {
        const article = this.generateMockArticleDraft(input);
        this.logAiRequestSuccess(metric, article.model);
        return article;
      } catch (error) {
        this.logAiRequestError(metric, error);
        throw error;
      }
    }

    const metric = this.createAiRequestMetric("article_generation", "live", this.getConfiguredModelForLog());

    try {
      const providerConfig = this.getRequiredProviderConfig();
      const prompt = await this.getArticleGenerationPrompt(input.promptId, userId);
      const completion = await this.getProviderClient().complete({
        ...providerConfig,
        messages: buildArticleGenerationMessages(input, prompt),
      });
      const article = parseArticleGenerationJson(completion.content);

      this.logAiRequestSuccess(metric, completion.model, completion.tokenUsage);

      return {
        model: completion.model,
        title: article.title,
        outline: article.outline,
        bodyText: article.bodyText,
        body: this.toRichTextDocument(this.paragraphsFromText(article.bodyText)),
      };
    } catch (error) {
      this.logAiRequestError(metric, error);
      throw error;
    }
  }

  async auditContent(text: string): Promise<AuditResult> {
    const normalizedText = text.trim();

    if (!normalizedText || !this.shouldUseLiveProvider()) {
      const metric = this.createAiRequestMetric("content_audit", "mock", this.getMockModel());

      try {
        const result = this.auditMockContent(normalizedText);
        this.logAiRequestSuccess(metric, result.model ?? this.getMockModel());
        return result;
      } catch (error) {
        this.logAiRequestError(metric, error);
        throw error;
      }
    }

    const metric = this.createAiRequestMetric("content_audit", "live", this.getConfiguredModelForLog());

    try {
      const providerConfig = this.getRequiredProviderConfig();
      const completion = await this.getProviderClient().complete({
        ...providerConfig,
        messages: buildContentAuditMessages(normalizedText),
      });
      const result = parseAuditJson(completion.content, {
        model: completion.model,
        source: "MODEL",
      });

      this.logAiRequestSuccess(metric, completion.model, completion.tokenUsage);
      return result;
    } catch (error) {
      this.logAiRequestError(metric, error);
      throw error;
    }
  }

  async scoreArticleQuality(input: { title: string; text: string; safetyScore?: number }): Promise<QualityScore> {
    if (!this.shouldUseLiveProvider()) {
      const metric = this.createAiRequestMetric("quality_scoring", "mock", this.getMockModel());

      try {
        const score = this.scoreMockArticleQuality(input);
        this.logAiRequestSuccess(metric, this.getMockModel());
        return score;
      } catch (error) {
        this.logAiRequestError(metric, error);
        throw error;
      }
    }

    const metric = this.createAiRequestMetric("quality_scoring", "live", this.getConfiguredModelForLog());

    try {
      const providerConfig = this.getRequiredProviderConfig();
      const completion = await this.getProviderClient().complete({
        ...providerConfig,
        messages: buildQualityScoringMessages(input),
      });
      const score = parseQualityScoreJson(completion.content, input.safetyScore);

      this.logAiRequestSuccess(metric, completion.model, completion.tokenUsage);
      return score;
    } catch (error) {
      this.logAiRequestError(metric, error);
      throw error;
    }
  }

  async *streamArticleDraft(input: GenerateArticleInput, userId: string): AsyncGenerator<AiStreamEvent> {
    const shouldUseLiveProvider = this.shouldUseLiveProvider();
    const metric = this.createAiRequestMetric(
      "article_generation",
      shouldUseLiveProvider ? "live" : "mock",
      shouldUseLiveProvider ? this.getConfiguredModelForLog() : this.getMockModel(),
    );
    let model = metric.model;
    let tokenUsage = createEmptyAiTokenUsage();

    try {
      if (shouldUseLiveProvider) {
        yield* this.streamLiveArticleDraft(input, userId, (delta) => {
          model = delta.model;
          tokenUsage = mergeAiTokenUsage(tokenUsage, delta.tokenUsage);
        });
        this.logAiRequestSuccess(metric, model, tokenUsage);
        return;
      }

      const article = this.generateMockArticleDraft(input);
      model = article.model;

      yield { event: "meta", data: { model: article.model } };
      yield { event: "title", data: { text: article.title } };
      yield { event: "outline", data: { items: article.outline } };

      for (const paragraph of this.paragraphsFromText(article.bodyText)) {
        yield { event: "body-delta", data: { text: `${paragraph}\n\n` } };
      }

      yield {
        event: "done",
        data: {
          title: article.title,
          outline: article.outline,
          bodyText: article.bodyText,
          body: article.body,
        },
      };
      this.logAiRequestSuccess(metric, model, tokenUsage);
    } catch (error) {
      this.logAiRequestError(metric, error, model, tokenUsage);
      throw error;
    }
  }

  async generateMultimodalDraftWithProgress(
    input: GenerateMultimodalInput,
    userId: string,
    options: MultimodalGenerationProgressOptions = {},
  ): Promise<GeneratedMultimodalDraft> {
    const shouldUseLiveProvider = this.shouldUseLiveProvider();
    const textModel = shouldUseLiveProvider ? this.getConfiguredModelForLog() : this.getMockModel();
    const imageModel = this.getConfiguredImageModel();
    const metric = this.createAiRequestMetric(
      "multimodal_generation",
      shouldUseLiveProvider ? "live" : "mock",
      textModel,
    );
    let tokenUsage = createEmptyAiTokenUsage();
    let title = "";
    let outline: string[] = [];
    let bodyText = "";
    let progressImages: MultimodalGenerationProgressImage[] = [];

    try {
      await this.assertMultimodalGenerationNotCancelled(options, {
        stage: "cancelled",
        percent: 0,
        textModel,
        imageModel,
        images: progressImages,
        updatedAt: new Date().toISOString(),
      });

      await this.reportMultimodalGenerationProgress(options, {
        stage: "planning",
        percent: 10,
        textModel,
        imageModel,
        images: progressImages,
        updatedAt: new Date().toISOString(),
      });

      const plan = shouldUseLiveProvider
        ? await this.generateLiveMultimodalPlan(input, userId, (usage) => {
            tokenUsage = mergeAiTokenUsage(tokenUsage, usage);
          })
        : this.generateMockMultimodalPlan(input);

      title = plan.title;
      outline = plan.outline;
      bodyText = plan.bodyText;
      progressImages = plan.images.map((image, index) => ({
        ...image,
        index,
        status: "pending",
      }));

      await this.assertMultimodalGenerationNotCancelled(options, {
        stage: "cancelled",
        percent: 40,
        textModel: plan.textModel,
        imageModel: plan.imageModel,
        title,
        outline,
        bodyText,
        images: progressImages,
        updatedAt: new Date().toISOString(),
      });

      await this.reportMultimodalGenerationProgress(options, {
        stage: "text_ready",
        percent: progressImages.length ? 40 : 90,
        textModel: plan.textModel,
        imageModel: plan.imageModel,
        title,
        outline,
        bodyText,
        images: progressImages,
        updatedAt: new Date().toISOString(),
      });

      const completedImages: GeneratedImageResult[] = [];
      const imageResults: MultimodalImageResult[] = [];

      for (const [index, imagePlan] of plan.images.entries()) {
        await this.assertMultimodalGenerationNotCancelled(options, {
          stage: "cancelled",
          percent: this.calculateMultimodalImagePercent(index, plan.images.length),
          textModel: plan.textModel,
          imageModel: plan.imageModel,
          title,
          outline,
          bodyText,
          images: progressImages,
          updatedAt: new Date().toISOString(),
        });

        progressImages = progressImages.map((image) =>
          image.index === index ? { ...image, status: "generating" } : image,
        );

        await this.reportMultimodalGenerationProgress(options, {
          stage: "generating_images",
          percent: this.calculateMultimodalImagePercent(index, plan.images.length),
          textModel: plan.textModel,
          imageModel: plan.imageModel,
          title,
          outline,
          bodyText,
          images: progressImages,
          updatedAt: new Date().toISOString(),
        });

        const image = shouldUseLiveProvider
          ? await this.generateLiveImageResult(imagePlan, index, userId)
          : this.generateMockImageResult(imagePlan, index);

        imageResults.push(image);

        if (image.status === "completed") {
          completedImages.push(image);
        }

        progressImages = progressImages.map((item) =>
          item.index === index ? this.toMultimodalProgressImage(image) : item,
        );

        await this.reportMultimodalGenerationProgress(options, {
          stage: "generating_images",
          percent: this.calculateMultimodalImagePercent(index + 1, plan.images.length),
          textModel: plan.textModel,
          imageModel: plan.imageModel,
          title,
          outline,
          bodyText,
          images: progressImages,
          updatedAt: new Date().toISOString(),
        });
      }

      const finalDraft: GeneratedMultimodalDraft = {
        textModel: plan.textModel,
        imageModel: plan.imageModel,
        title: plan.title,
        outline: plan.outline,
        bodyText: plan.bodyText,
        images: imageResults,
        body: this.toMultimodalRichTextDocument(plan.bodyText, completedImages),
      };

      await this.reportMultimodalGenerationProgress(options, {
        stage: "completed",
        percent: 100,
        textModel: plan.textModel,
        imageModel: plan.imageModel,
        title,
        outline,
        bodyText,
        images: progressImages,
        updatedAt: new Date().toISOString(),
      });

      this.logAiRequestSuccess(metric, plan.textModel, tokenUsage);
      return finalDraft;
    } catch (error) {
      if (!(error instanceof MultimodalGenerationCancelledError)) {
        await this.reportMultimodalGenerationProgress(options, {
          stage: "failed",
          percent: progressImages.length ? 95 : 10,
          textModel,
          imageModel,
          ...(title ? { title } : {}),
          ...(outline.length ? { outline } : {}),
          ...(bodyText ? { bodyText } : {}),
          images: progressImages,
          updatedAt: new Date().toISOString(),
        });
      }

      this.logAiRequestError(metric, error, textModel, tokenUsage);
      throw error;
    }
  }

  async *streamMultimodalDraft(input: GenerateMultimodalInput, userId: string): AsyncGenerator<AiStreamEvent> {
    const shouldUseLiveProvider = this.shouldUseLiveProvider();
    const textModel = shouldUseLiveProvider ? this.getConfiguredModelForLog() : this.getMockModel();
    const imageModel = this.getConfiguredImageModel();
    const metric = this.createAiRequestMetric(
      "multimodal_generation",
      shouldUseLiveProvider ? "live" : "mock",
      textModel,
    );
    let tokenUsage = createEmptyAiTokenUsage();

    try {
      const plan = shouldUseLiveProvider
        ? await this.generateLiveMultimodalPlan(input, userId, (usage) => {
            tokenUsage = mergeAiTokenUsage(tokenUsage, usage);
          })
        : this.generateMockMultimodalPlan(input);

      yield { event: "meta", data: { textModel: plan.textModel, imageModel: plan.imageModel } };
      yield { event: "title", data: { text: plan.title } };
      yield { event: "outline", data: { items: plan.outline } };

      for (const paragraph of this.paragraphsFromText(plan.bodyText)) {
        yield { event: "body-delta", data: { text: `${paragraph}\n\n` } };
      }

      yield { event: "image-plan", data: { images: plan.images } };

      const completedImages: GeneratedImageResult[] = [];
      const imageResults: MultimodalImageResult[] = [];
      for (const [index, imagePlan] of plan.images.entries()) {
        yield { event: "image-status", data: { index, status: "generating" } };

        const image = shouldUseLiveProvider
          ? await this.generateLiveImageResult(imagePlan, index, userId)
          : this.generateMockImageResult(imagePlan, index);

        imageResults.push(image);

        if (image.status === "completed") {
          completedImages.push(image);
          yield { event: "image", data: image };
        } else {
          yield {
            event: "image-status",
            data: { index: image.index, status: "failed", message: image.message },
          };
        }
      }

      const finalDraft = {
        textModel: plan.textModel,
        imageModel: plan.imageModel,
        title: plan.title,
        outline: plan.outline,
        bodyText: plan.bodyText,
        images: imageResults,
        body: this.toMultimodalRichTextDocument(plan.bodyText, completedImages),
      };
      yield { event: "done", data: finalDraft as unknown as Record<string, unknown> };
      this.logAiRequestSuccess(metric, plan.textModel, tokenUsage);
    } catch (error) {
      this.logAiRequestError(metric, error, textModel, tokenUsage);
      throw error;
    }
  }

  async *streamTitleOptimization(input: OptimizeTitlesInput): AsyncGenerator<AiStreamEvent> {
    const shouldUseLiveProvider = this.shouldUseLiveProvider();
    const metric = this.createAiRequestMetric(
      "title_optimization",
      shouldUseLiveProvider ? "live" : "mock",
      shouldUseLiveProvider ? this.getConfiguredModelForLog() : this.getMockModel(),
    );
    let model = metric.model;
    let tokenUsage = createEmptyAiTokenUsage();

    try {
      if (shouldUseLiveProvider) {
        yield* this.streamLiveTitleOptimization(input, (delta) => {
          model = delta.model;
          tokenUsage = mergeAiTokenUsage(tokenUsage, delta.tokenUsage);
        });
        this.logAiRequestSuccess(metric, model, tokenUsage);
        return;
      }

      const response = await this.optimizeTitles(input);
      model = response.model;

      yield { event: "meta", data: { model: response.model } };
      for (const title of response.titles) {
        yield { event: "title", data: { text: title } };
      }
      yield { event: "done", data: { titles: response.titles } };
      this.logAiRequestSuccess(metric, model, tokenUsage);
    } catch (error) {
      this.logAiRequestError(metric, error, model, tokenUsage);
      throw error;
    }
  }

  async *streamRewrite(input: RewriteArticleInput): AsyncGenerator<AiStreamEvent> {
    const shouldUseLiveProvider = this.shouldUseLiveProvider();
    const metric = this.createAiRequestMetric(
      "article_rewrite",
      shouldUseLiveProvider ? "live" : "mock",
      shouldUseLiveProvider ? this.getConfiguredModelForLog() : this.getMockModel(),
    );
    let model = metric.model;
    let tokenUsage = createEmptyAiTokenUsage();

    try {
      if (shouldUseLiveProvider) {
        yield* this.streamLiveRewrite(input, (delta) => {
          model = delta.model;
          tokenUsage = mergeAiTokenUsage(tokenUsage, delta.tokenUsage);
        });
        this.logAiRequestSuccess(metric, model, tokenUsage);
        return;
      }

      const response = await this.rewriteArticle(input);
      model = response.model;

      yield { event: "meta", data: { model: response.model } };
      yield { event: "text-delta", data: { text: response.text } };
      for (const suggestion of response.suggestions) {
        yield { event: "suggestion", data: { text: suggestion } };
      }
      yield { event: "done", data: { text: response.text, suggestions: response.suggestions } };
      this.logAiRequestSuccess(metric, model, tokenUsage);
    } catch (error) {
      this.logAiRequestError(metric, error, model, tokenUsage);
      throw error;
    }
  }

  async *streamComplianceRewrite(input: ComplianceRewriteContext): AsyncGenerator<AiStreamEvent> {
    const shouldUseLiveProvider = this.shouldUseLiveProvider();
    const metric = this.createAiRequestMetric(
      "compliance_rewrite",
      shouldUseLiveProvider ? "live" : "mock",
      shouldUseLiveProvider ? this.getConfiguredModelForLog() : this.getMockModel(),
    );
    let model = metric.model;
    let tokenUsage = createEmptyAiTokenUsage();

    try {
      if (shouldUseLiveProvider) {
        yield* this.streamLiveComplianceRewrite(input, (delta) => {
          model = delta.model;
          tokenUsage = mergeAiTokenUsage(tokenUsage, delta.tokenUsage);
        });
        this.logAiRequestSuccess(metric, model, tokenUsage);
        return;
      }

      const response = this.rewriteMockComplianceText(input);
      model = this.getMockModel();

      yield { event: "meta", data: { model } };
      yield { event: "text-delta", data: { text: response.text } };
      for (const suggestion of response.suggestions) {
        yield { event: "suggestion", data: { text: suggestion } };
      }
      yield {
        event: "done",
        data: {
          bodyText: response.text,
          body: this.toRichTextDocument(this.paragraphsFromText(response.text)),
          suggestions: response.suggestions,
        },
      };
      this.logAiRequestSuccess(metric, model, tokenUsage);
    } catch (error) {
      this.logAiRequestError(metric, error, model, tokenUsage);
      throw error;
    }
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
          category: "人机协同",
        },
      ],
    };
  }

  private async generateLiveMultimodalPlan(
    input: GenerateMultimodalInput,
    userId: string,
    onTokenUsage?: (usage?: AiTokenUsage) => void,
  ): Promise<MultimodalGenerationPlan> {
    const providerConfig = this.getRequiredProviderConfig();
    const prompt = await this.getMultimodalGenerationPrompt(input.promptId, userId);
    const completion = await this.getProviderClient().complete({
      ...providerConfig,
      messages: buildMultimodalGenerationMessages(input, prompt),
    });
    const parsed = parseMultimodalGenerationJson(completion.content, this.normalizeImageCount(input.imageCount));
    onTokenUsage?.(completion.tokenUsage);

    return {
      textModel: completion.model,
      imageModel: this.getConfiguredImageModel(),
      title: parsed.title,
      outline: parsed.outline,
      bodyText: parsed.bodyText,
      images: parsed.images,
    };
  }

  private generateMockMultimodalPlan(input: GenerateMultimodalInput): MultimodalGenerationPlan {
    const imageCount = this.normalizeImageCount(input.imageCount);
    const title = `${input.topic}: 图文创作初稿`;
    const outline = ["主题背景", "核心内容", "配图建议", "发布前检查"];
    const bodyText = [
      `${input.topic}适合做成一篇短图文内容。面向${input.audience}, 文章可以先用简洁语言交代背景, 再用配图帮助读者形成直观印象。`,
      `在${input.style}风格下, 正文需要控制信息密度, 图片则负责补充场景、氛围和细节。`,
    ].join("\n\n");

    return {
      textModel: this.getMockModel(),
      imageModel: this.getConfiguredImageModel(),
      title,
      outline,
      bodyText,
      images: Array.from({ length: imageCount }, (_, index) => ({
        prompt: input.imagePrompt?.trim()
          ? `${input.imagePrompt.trim()} 第 ${index + 1} 张, 与「${input.topic}」主题匹配`
          : `${input.topic} 相关图文配图 ${index + 1}, 写实风格, 清晰构图, 适合内容发布页`,
        caption: `${input.topic}配图 ${index + 1}`,
        alt: `${input.topic}配图 ${index + 1}`,
      })),
    };
  }

  private async generateLiveImageResult(
    plan: MultimodalImagePlan,
    index: number,
    userId: string,
  ): Promise<MultimodalImageResult> {
    const imageMetric = this.createAiRequestMetric("image_generation", "live", this.getConfiguredImageModel());

    try {
      const completion = await this.getProviderClient().generateImage({
        ...this.getRequiredImageProviderConfig(),
        prompt: plan.prompt,
      });
      if (!this.generatedImageStorage) {
        throw new ServiceUnavailableException("AI 生成图片存储服务未配置。");
      }
      const storedImage = await this.generatedImageStorage.storeGeneratedImage(userId, completion.url);
      const result: GeneratedImageResult = {
        ...plan,
        index,
        status: "completed",
        model: completion.model,
        url: storedImage.url,
      };

      this.logAiRequestSuccess(imageMetric, completion.model);
      return result;
    } catch (error) {
      this.logAiRequestError(imageMetric, error, this.getConfiguredImageModel());
      return {
        ...plan,
        index,
        status: "failed",
        model: this.getConfiguredImageModel(),
        message: error instanceof Error ? error.message : "图片生成失败。",
      };
    }
  }

  private generateMockImageResult(plan: MultimodalImagePlan, index: number): GeneratedImageResult {
    return {
      ...plan,
      index,
      status: "completed",
      model: this.getConfiguredImageModel(),
      url: this.createMockImageUrl(plan.caption || plan.alt || `配图 ${index + 1}`),
    };
  }

  private async optimizeTitles(input: OptimizeTitlesInput) {
    if (!input.topic?.trim()) {
      throw new BadRequestException("Topic is required");
    }

    if (!this.shouldUseLiveProvider()) {
      return {
        model: this.getMockModel(),
        titles: [
          `${input.topic}: 创作者的效率提升指南`,
          `从灵感到发布: ${input.topic}的完整链路`,
          `内容创作者如何看懂${input.topic}`,
        ],
      };
    }

    const providerConfig = this.getRequiredProviderConfig();
    const completion = await this.getProviderClient().complete({
      ...providerConfig,
      messages: buildTitleOptimizationMessages(input),
    });

    return {
      model: completion.model,
      titles: parseTitleOptimizationJson(completion.content).titles,
    };
  }

  private async rewriteArticle(input: RewriteArticleInput): Promise<RewriteArticleResponse> {
    const normalizedInput = this.normalizeRewriteInput(input);

    if (!this.shouldUseLiveProvider()) {
      return this.rewriteMockArticle(normalizedInput);
    }

    const providerConfig = this.getRequiredProviderConfig();
    const completion = await this.getProviderClient().complete({
      ...providerConfig,
      messages: buildRewriteMessages(normalizedInput),
    });
    const parsed = parseRewriteJson(completion.content);

    return {
      model: completion.model,
      text: parsed.text,
      suggestions: parsed.suggestions,
    };
  }

  private async *streamLiveArticleDraft(
    input: GenerateArticleInput,
    userId: string,
    onProviderDelta?: (delta: AiProviderTextDelta) => void,
  ): AsyncGenerator<AiStreamEvent> {
    const providerConfig = this.getRequiredProviderConfig();
    const prompt = await this.getArticleGenerationPrompt(input.promptId, userId);
    const stream = this.streamProviderText(providerConfig, buildArticleGenerationMessages(input, prompt), onProviderDelta);
    let rawContent = "";
    let emittedTitle = "";
    let emittedBodyText = "";

    for await (const delta of stream) {
      if (!rawContent) {
        yield { event: "meta", data: { model: delta.model } };
      }

      rawContent += delta.content;

      const title = extractJsonStringPrefix(rawContent, "title");
      if (title && title !== emittedTitle) {
        emittedTitle = title;
        yield { event: "title", data: { text: title } };
      }

      const bodyText = extractJsonStringPrefix(rawContent, "bodyText");
      if (bodyText.length > emittedBodyText.length) {
        yield { event: "body-delta", data: { text: bodyText.slice(emittedBodyText.length) } };
        emittedBodyText = bodyText;
      }
    }

    const article = parseArticleGenerationJson(rawContent);
    if (article.bodyText.length > emittedBodyText.length) {
      yield { event: "body-delta", data: { text: article.bodyText.slice(emittedBodyText.length) } };
    }

    yield { event: "outline", data: { items: article.outline } };
    yield {
      event: "done",
      data: {
        title: article.title,
        outline: article.outline,
        bodyText: article.bodyText,
        body: this.toRichTextDocument(this.paragraphsFromText(article.bodyText)),
      },
    };
  }

  private async *streamLiveTitleOptimization(
    input: OptimizeTitlesInput,
    onProviderDelta?: (delta: AiProviderTextDelta) => void,
  ): AsyncGenerator<AiStreamEvent> {
    if (!input.topic?.trim()) {
      throw new BadRequestException("Topic is required");
    }

    const providerConfig = this.getRequiredProviderConfig();
    const stream = this.streamProviderText(providerConfig, buildTitleOptimizationMessages(input), onProviderDelta);
    let rawContent = "";
    const emittedTitles: string[] = [];

    for await (const delta of stream) {
      if (!rawContent) {
        yield { event: "meta", data: { model: delta.model } };
      }

      rawContent += delta.content;
      const titles = extractJsonStringArrayPrefixes(rawContent, "titles");

      for (const title of titles) {
        if (emittedTitles[title.index] === title.text) continue;
        emittedTitles[title.index] = title.text;
        yield {
          event: "title",
          data: { text: title.text, index: title.index, partial: !title.closed },
        };
      }
    }

    const titles = parseTitleOptimizationJson(rawContent).titles;
    for (const [index, title] of titles.entries()) {
      if (emittedTitles[index] === title) continue;
      emittedTitles[index] = title;
      yield { event: "title", data: { text: title, index, partial: false } };
    }
    yield { event: "done", data: { titles } };
  }

  private async *streamLiveRewrite(
    input: RewriteArticleInput,
    onProviderDelta?: (delta: AiProviderTextDelta) => void,
  ): AsyncGenerator<AiStreamEvent> {
    const normalizedInput = this.normalizeRewriteInput(input);
    const providerConfig = this.getRequiredProviderConfig();
    const stream = this.streamProviderText(providerConfig, buildRewriteMessages(normalizedInput), onProviderDelta);
    let rawContent = "";
    let emittedText = "";

    for await (const delta of stream) {
      if (!rawContent) {
        yield { event: "meta", data: { model: delta.model } };
      }

      rawContent += delta.content;
      const text = extractJsonStringPrefix(rawContent, "text");
      if (text.length > emittedText.length) {
        yield { event: "text-delta", data: { text: text.slice(emittedText.length) } };
        emittedText = text;
      }
    }

    const parsed = parseRewriteJson(rawContent);
    if (parsed.text.length > emittedText.length) {
      yield { event: "text-delta", data: { text: parsed.text.slice(emittedText.length) } };
    }

    for (const suggestion of parsed.suggestions) {
      yield { event: "suggestion", data: { text: suggestion } };
    }
    yield { event: "done", data: { text: parsed.text, suggestions: parsed.suggestions } };
  }

  private async *streamLiveComplianceRewrite(
    input: ComplianceRewriteContext,
    onProviderDelta?: (delta: AiProviderTextDelta) => void,
  ): AsyncGenerator<AiStreamEvent> {
    const providerConfig = this.getRequiredProviderConfig();
    const stream = this.streamProviderText(providerConfig, buildComplianceRewriteMessages(input), onProviderDelta);
    let rawContent = "";
    let emittedText = "";

    for await (const delta of stream) {
      if (!rawContent) {
        yield { event: "meta", data: { model: delta.model } };
      }

      rawContent += delta.content;
      const text = extractJsonStringPrefix(rawContent, "text");
      if (text.length > emittedText.length) {
        yield { event: "text-delta", data: { text: text.slice(emittedText.length) } };
        emittedText = text;
      }
    }

    const parsed = parseRewriteJson(rawContent);
    if (parsed.text.length > emittedText.length) {
      yield { event: "text-delta", data: { text: parsed.text.slice(emittedText.length) } };
    }

    for (const suggestion of parsed.suggestions) {
      yield { event: "suggestion", data: { text: suggestion } };
    }
    yield {
      event: "done",
      data: {
        bodyText: parsed.text,
        body: this.toRichTextDocument(this.paragraphsFromText(parsed.text)),
        suggestions: parsed.suggestions,
      },
    };
  }

  private async *streamProviderText(
    providerConfig: ProviderConfig,
    messages: AiChatMessage[],
    onProviderDelta?: (delta: AiProviderTextDelta) => void,
  ) {
    for await (const delta of this.getProviderClient().streamText({
      ...providerConfig,
      messages,
    })) {
      onProviderDelta?.(delta);
      if (delta.content) {
        yield delta;
      }
    }
  }

  private createAiRequestMetric(
    feature: AiRequestFeature,
    providerMode: AiRequestProviderMode,
    model: string,
  ): AiRequestMetric {
    return createAiRequestMetric({
      feature,
      providerMode,
      model,
    });
  }

  private logAiRequestSuccess(metric: AiRequestMetric, model?: string, tokenUsage?: AiTokenUsage) {
    this.logAiRequest(
      finishAiRequestMetric(metric, {
        status: "success",
        model,
        tokenUsage,
      }),
    );
  }

  private logAiRequestError(
    metric: AiRequestMetric,
    error: unknown,
    model?: string,
    tokenUsage?: AiTokenUsage,
  ) {
    this.logAiRequest(
      finishAiRequestMetric(metric, {
        status: "error",
        model,
        tokenUsage,
        error,
      }),
    );
  }

  private logAiRequest(payload: Parameters<AiRequestLogger["log"]>[0]) {
    (this.requestLogger ?? this.fallbackRequestLogger).log(payload);
  }

  private getConfiguredModelForLog() {
    const configuredModel = this.readConfig("AI_MODEL");
    return this.isPlaceholder(configuredModel) ? "unknown-model" : configuredModel ?? "unknown-model";
  }

  private normalizeRewriteInput(input: RewriteArticleInput): RewriteArticleInput {
    const text = input.text?.trim();
    if (!text) {
      throw new BadRequestException("Rewrite text is required");
    }
    if (text.length > 2000) {
      throw new BadRequestException("Rewrite text is too long");
    }
    if (!rewriteModes.has(input.mode)) {
      throw new BadRequestException("Rewrite mode is invalid");
    }

    return { ...input, text };
  }

  private rewriteMockArticle(input: RewriteArticleInput): RewriteArticleResponse {
    const prefixByMode: Record<RewriteModeValue, string> = {
      POLISH: "润色后",
      EXPAND: "扩写后",
      SHORTEN: "缩写后",
      CHANGE_STYLE: `转换为${input.targetStyle || "目标"}风格后`,
    };

    return {
      model: this.getMockModel(),
      text: `${prefixByMode[input.mode as RewriteModeValue]}: ${input.text}`,
      suggestions: ["补充一个具体案例", "结尾增加行动建议"],
    };
  }

  private rewriteMockComplianceText(input: ComplianceRewriteContext): RewriteArticleResponse {
    const evidenceText = input.audit.evidence.map((item) => item.text).filter(Boolean).join("、");
    const text = `合规改写后: ${input.bodyText}`;

    return {
      model: this.getMockModel(),
      text,
      suggestions: [
        evidenceText ? `已根据审核证据处理风险表达: ${evidenceText}` : "已根据审核建议降低风险表达",
      ],
    };
  }

  private auditMockContent(text: string): AuditResult {
    const matchedRules = mockAuditRules.filter((rule) => rule.pattern.test(text));
    const decision = this.getMockAuditDecision(matchedRules);

    if (decision === AuditDecision.Pass) {
      return {
        decision,
        riskLevel: "none",
        categories: [],
        evidence: [],
        rewriteSuggestions: [],
        summary: "未发现明显风险。",
        model: this.getMockModel(),
        source: "MOCK",
      };
    }

    return {
      decision,
      riskLevel: matchedRules.some((rule) => rule.riskLevel === "high") ? "high" : "medium",
      categories: [...new Set(matchedRules.map((rule) => rule.category))],
      evidence: matchedRules.map((rule) => ({
        text: this.extractMockAuditEvidence(text, rule.pattern),
        reason: rule.reason,
      })),
      rewriteSuggestions: [...new Set(matchedRules.map((rule) => rule.suggestion))],
      summary:
        decision === AuditDecision.Block
          ? "内容命中高风险规则，禁止发布，请修改后重新审核。"
          : "内容存在中风险，需要修改后重审。",
      model: this.getMockModel(),
      source: "MOCK",
    };
  }

  private scoreMockArticleQuality(input: { title: string; text: string; safetyScore?: number }): QualityScore {
    const base = Math.min(95, Math.max(60, Math.round(input.text.length / 20) + 65));
    const score = {
      contentValue: base,
      expressionQuality: base - 2,
      readerExperience: base - 4,
      spreadPotential: base - 8,
      safetyScore: input.safetyScore ?? 95,
    };

    return {
      ...score,
      overall: Math.round(
        score.contentValue * qualityWeights.contentValue +
          score.expressionQuality * qualityWeights.expressionQuality +
          score.readerExperience * qualityWeights.readerExperience +
          score.spreadPotential * qualityWeights.spreadPotential +
          score.safetyScore * qualityWeights.safetyScore,
      ),
      reasons: ["鍐呭缁撴瀯瀹屾暣", "閫傚悎杩涘叆鍙戝竷鍓嶄汉宸ョ‘璁?"],
      suggestions: ["琛ュ厖鐪熷疄妗堜緥", "浼樺寲鏍囬鐨勫叿浣撳埄鐩婄偣"],
    };
  }

  private getMockAuditDecision(rules: MockAuditRule[]) {
    if (rules.some((rule) => rule.decision === AuditDecision.Block)) return AuditDecision.Block;
    if (rules.length) return AuditDecision.Warn;
    return AuditDecision.Pass;
  }

  private extractMockAuditEvidence(text: string, pattern: RegExp) {
    const match = text.match(pattern);
    if (!match?.index) return match?.[0] ?? text.slice(0, 80);

    const start = Math.max(0, match.index - 12);
    const end = Math.min(text.length, match.index + match[0].length + 12);
    return text.slice(start, end);
  }

  private generateMockArticleDraft(input: GenerateArticleInput): GeneratedArticleDraft {
    const model = this.getMockModel();
    const outline = ["趋势背景", "核心机会", "实践方法", "风险边界", "行动建议"];
    const bodyText = [
      `面向${input.audience}, ${input.topic}正在从单点工具升级为完整的内容生产链路。`,
      `在${input.style}风格下, 创作者可以先用 AI 形成标题、大纲和正文, 再通过人工编辑补充真实案例、观点和表达节奏。`,
      "真正有价值的创作流程不是把内容完全交给模型, 而是让模型负责初稿、改写和校对, 让创作者负责判断、取舍和最终表达。",
      "发布前仍需要经过内容安全审核和质量评分, 确保文章既有可读性, 也符合平台规则。",
    ].join("\n\n");
    const body = this.toRichTextDocument(this.paragraphsFromText(bodyText));

    return {
      model,
      title: `${input.topic}: 创作者需要知道的 5 个变化`,
      outline,
      bodyText,
      body,
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

  private toMultimodalRichTextDocument(bodyText: string, images: GeneratedImageResult[]): RichTextDocument {
    const content: RichTextNode[] = this.paragraphsFromText(bodyText).map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    }));

    const validImages = images.filter((image) => /^https?:\/\//i.test(image.url));
    if (!validImages.length) {
      return {
        type: "doc",
        content: content.length ? content : [{ type: "paragraph", content: [] }],
      };
    }

    const baseContent = content.length ? content : [{ type: "paragraph", content: [] }];
    const output: RichTextNode[] = [];
    const insertIndexes = this.getImageInsertIndexes(baseContent.length, validImages.length);
    let imageCursor = 0;

    for (const [index, node] of baseContent.entries()) {
      output.push(node);

      while (insertIndexes[imageCursor] === index) {
        const image = validImages[imageCursor];
        output.push({
          type: "image",
          attrs: {
            src: image.url,
            alt: image.alt,
            title: image.caption,
          },
        });
        if (image.caption.trim()) {
          output.push({
            type: "paragraph",
            content: [{ type: "text", text: `图 ${image.index + 1}: ${image.caption.trim()}` }],
          });
        }
        imageCursor += 1;
      }
    }

    return {
      type: "doc",
      content: output,
    };
  }

  private getImageInsertIndexes(paragraphCount: number, imageCount: number) {
    return Array.from({ length: imageCount }, (_, imageIndex) => {
      const ratio = (imageIndex + 1) / (imageCount + 1);
      return Math.max(0, Math.min(paragraphCount - 1, Math.floor(ratio * paragraphCount)));
    });
  }

  private async assertMultimodalGenerationNotCancelled(
    options: MultimodalGenerationProgressOptions,
    progress: MultimodalGenerationProgress,
  ) {
    if (!(await options.shouldCancel?.())) return;

    await this.reportMultimodalGenerationProgress(options, progress);
    throw new MultimodalGenerationCancelledError();
  }

  private async reportMultimodalGenerationProgress(
    options: MultimodalGenerationProgressOptions,
    progress: MultimodalGenerationProgress,
  ) {
    await options.reportProgress?.(progress);
  }

  private toMultimodalProgressImage(result: MultimodalImageResult): MultimodalGenerationProgressImage {
    if (result.status === "completed") {
      return {
        index: result.index,
        prompt: result.prompt,
        caption: result.caption,
        alt: result.alt,
        status: "completed",
        url: result.url,
        model: result.model,
      };
    }

    return {
      index: result.index,
      prompt: result.prompt,
      caption: result.caption,
      alt: result.alt,
      status: "failed",
      model: result.model,
      message: result.message,
    };
  }

  private calculateMultimodalImagePercent(completedOrCurrentIndex: number, totalImages: number) {
    if (!totalImages) return 90;
    const ratio = Math.max(0, Math.min(1, completedOrCurrentIndex / totalImages));
    return Math.min(95, Math.round(45 + ratio * 45));
  }

  private async getArticleGenerationPrompt(promptId: string | undefined, userId: string | undefined): Promise<ArticleGenerationPrompt> {
    if (promptId) {
      if (!userId || !this.promptsService) {
        throw new BadRequestException("Prompt template cannot be used");
      }
      return this.promptsService.getUsablePrompt(promptId, userId, ARTICLE_GENERATION_CATEGORY);
    }

    return (
      (await this.promptsService?.getStarterPrompt(ARTICLE_GENERATION_CATEGORY)) ??
      defaultArticleGenerationPrompt
    );
  }

  private async getMultimodalGenerationPrompt(
    promptId: string | undefined,
    userId: string | undefined,
  ): Promise<ArticleGenerationPrompt> {
    if (promptId) {
      if (!userId || !this.promptsService) {
        throw new BadRequestException("Prompt template cannot be used");
      }
      return this.promptsService.getUsablePrompt(promptId, userId, MULTIMODAL_GENERATION_CATEGORY);
    }

    return (
      (await this.promptsService?.getStarterPrompt(MULTIMODAL_GENERATION_CATEGORY)) ??
      defaultMultimodalGenerationPrompt
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

  private getRequiredImageProviderConfig(): ProviderConfig & { size: string } {
    const apiKey = this.readConfig("AI_API_KEY");
    const model = this.getConfiguredImageModel();

    if (!apiKey || this.isPlaceholder(apiKey) || this.isPlaceholder(model)) {
      throw new AiProviderConfigurationException();
    }

    return {
      apiKey,
      baseUrl: this.optionalConfig("AI_IMAGE_BASE_URL"),
      model,
      timeoutMs: this.readPositiveInt("AI_IMAGE_TIMEOUT_MS", 120_000),
      maxRetries: this.readNonNegativeInt("AI_IMAGE_MAX_RETRIES", 1),
      size: this.readConfig("AI_IMAGE_SIZE") ?? "2K",
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

  private getConfiguredImageModel() {
    const configuredModel = this.readConfig("AI_IMAGE_MODEL");
    if (this.isPlaceholder(configuredModel)) return defaultImageModel;
    return configuredModel ?? defaultImageModel;
  }

  private normalizeImageCount(value: number | undefined) {
    const parsed = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 2;
    return Math.max(1, Math.min(4, parsed));
  }

  private createMockImageUrl(label: string) {
    return `https://placehold.co/960x540/fff1f1/ff4d4f.png?text=${encodeURIComponent(label.slice(0, 24))}`;
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

function extractJsonStringPrefix(rawJson: string, fieldName: string) {
  const quoteIndex = findJsonStringValueStart(rawJson, fieldName);
  if (quoteIndex < 0) return "";

  return readJsonString(rawJson, quoteIndex).value;
}

function extractJsonStringArrayValues(rawJson: string, fieldName: string) {
  return extractJsonStringArrayPrefixes(rawJson, fieldName)
    .filter((value) => value.closed)
    .map((value) => value.text);
}

function extractJsonStringArrayPrefixes(rawJson: string, fieldName: string) {
  const fieldIndex = findJsonFieldIndex(rawJson, fieldName);
  if (fieldIndex < 0) return [];

  const colonIndex = rawJson.indexOf(":", fieldIndex);
  if (colonIndex < 0) return [];

  const arrayStart = skipJsonWhitespace(rawJson, colonIndex + 1);
  if (rawJson[arrayStart] !== "[") return [];

  const values: Array<{ index: number; text: string; closed: boolean }> = [];
  let index = arrayStart + 1;

  while (index < rawJson.length) {
    index = skipJsonWhitespace(rawJson, index);
    if (rawJson[index] === "]") return values;
    if (rawJson[index] === ",") {
      index += 1;
      continue;
    }
    if (rawJson[index] !== '"') return values;

    const value = readJsonString(rawJson, index);
    values.push({ index: values.length, text: value.value, closed: value.closed });
    if (!value.closed) return values;

    index = value.endIndex;
  }

  return values;
}

function findJsonStringValueStart(rawJson: string, fieldName: string) {
  const fieldIndex = findJsonFieldIndex(rawJson, fieldName);
  if (fieldIndex < 0) return -1;

  const colonIndex = rawJson.indexOf(":", fieldIndex);
  if (colonIndex < 0) return -1;

  const valueStart = skipJsonWhitespace(rawJson, colonIndex + 1);
  return rawJson[valueStart] === '"' ? valueStart : -1;
}

function findJsonFieldIndex(rawJson: string, fieldName: string) {
  return rawJson.indexOf(`"${fieldName}"`);
}

function skipJsonWhitespace(value: string, startIndex: number) {
  let index = startIndex;
  while (index < value.length && /\s/.test(value[index])) {
    index += 1;
  }
  return index;
}

function readJsonString(rawJson: string, quoteIndex: number) {
  let value = "";
  let index = quoteIndex + 1;

  while (index < rawJson.length) {
    const char = rawJson[index];

    if (char === '"') {
      return { value, closed: true, endIndex: index + 1 };
    }

    if (char === "\\") {
      const escaped = readEscapedJsonCharacter(rawJson, index);
      if (!escaped) return { value, closed: false, endIndex: index };
      value += escaped.value;
      index = escaped.endIndex;
      continue;
    }

    value += char;
    index += 1;
  }

  return { value, closed: false, endIndex: index };
}

function readEscapedJsonCharacter(rawJson: string, backslashIndex: number) {
  const escapeCode = rawJson[backslashIndex + 1];
  if (!escapeCode) return undefined;

  const simpleEscapes: Record<string, string> = {
    '"': '"',
    "\\": "\\",
    "/": "/",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
  };

  if (escapeCode in simpleEscapes) {
    return { value: simpleEscapes[escapeCode], endIndex: backslashIndex + 2 };
  }

  if (escapeCode === "u") {
    const hex = rawJson.slice(backslashIndex + 2, backslashIndex + 6);
    if (!/^[\da-f]{4}$/i.test(hex)) return undefined;
    return { value: String.fromCharCode(Number.parseInt(hex, 16)), endIndex: backslashIndex + 6 };
  }

  return { value: escapeCode, endIndex: backslashIndex + 2 };
}
