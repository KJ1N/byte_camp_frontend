import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  PromptOwner,
  type CreatePromptInput,
  type ListPromptsResponse,
  type PromptTemplateDetail,
  type PromptTemplateMutationResponse,
  type PromptTemplateSummary,
  type UpdatePromptInput,
} from "@bytecamp-aigc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ARTICLE_GENERATION_CATEGORY, type ArticleGenerationPrompt } from "../ai-gateway/ai-gateway.prompts";

const outputContractPreview = "后端固定要求模型返回 title、outline、bodyText JSON，不允许自定义 Prompt 修改。";
const controlledArticleSystemPrompt =
  "你是 AI Creator Hub 的中文图文创作助手。请根据用户业务指令生成适合保存草稿、人工编辑、发布前审核和质量评分的文章初稿。";

@Injectable()
export class PromptsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailablePrompts(userId: string, category?: string): Promise<ListPromptsResponse> {
    const prompts = await this.prisma.prompt.findMany({
      where: {
        ...(category ? { category } : {}),
        OR: [{ owner: PromptOwner.Platform }, { owner: PromptOwner.Private, authorId: userId }],
      },
      orderBy: [{ isStarter: "desc" }, { createdAt: "asc" }],
    });

    return {
      items: prompts.map((prompt) => this.toSummary(prompt)),
    };
  }

  async getPromptDetail(promptId: string, userId: string): Promise<PromptTemplateDetail> {
    const prompt = await this.prisma.prompt.findFirst({
      where: this.usablePromptWhere(promptId, userId),
    });

    if (!prompt) {
      throw new NotFoundException("Prompt template not found");
    }

    return this.toDetail(prompt);
  }

  async createPrivatePrompt(userId: string, input: CreatePromptInput): Promise<PromptTemplateMutationResponse> {
    const normalized = this.normalizeCreateInput(input);
    const prompt = await this.prisma.prompt.create({
      data: {
        owner: PromptOwner.Private,
        authorId: userId,
        name: normalized.name,
        category: normalized.category,
        systemPrompt: this.controlledSystemPromptFor(normalized.category),
        userTemplate: normalized.userTemplate,
        paramsSchema: {
          description: normalized.description,
        },
        fewShots: [],
        isStarter: false,
      },
    });

    return { prompt: this.toDetail(prompt) };
  }

  async copyPrompt(promptId: string, userId: string, name?: string): Promise<PromptTemplateMutationResponse> {
    const source = await this.prisma.prompt.findFirst({
      where: {
        id: promptId,
        owner: PromptOwner.Platform,
      },
    });

    if (!source) {
      throw new NotFoundException("Prompt template not found");
    }

    const prompt = await this.prisma.prompt.create({
      data: {
        owner: PromptOwner.Private,
        authorId: userId,
        name: this.normalizeName(name || `${source.name} - 自定义`),
        category: source.category,
        systemPrompt: source.systemPrompt,
        userTemplate: source.userTemplate,
        paramsSchema: (source.paramsSchema ?? {}) as Prisma.InputJsonValue,
        fewShots: (source.fewShots ?? []) as Prisma.InputJsonValue,
        sourcePromptId: source.id,
        isStarter: false,
      },
    });

    return { prompt: this.toDetail(prompt) };
  }

  async updatePrivatePrompt(
    promptId: string,
    userId: string,
    input: UpdatePromptInput,
  ): Promise<PromptTemplateMutationResponse> {
    const prompt = await this.prisma.prompt.findFirst({
      where: { id: promptId },
    });

    if (!prompt) {
      throw new NotFoundException("Prompt template not found");
    }

    if (prompt.owner !== PromptOwner.Private) {
      throw new ForbiddenException("Platform prompt templates are readonly");
    }

    if (prompt.authorId !== userId) {
      throw new NotFoundException("Prompt template not found");
    }

    const normalized = this.normalizeUpdateInput(input);
    const nextDescription =
      normalized.description === undefined ? this.readDescription(prompt.paramsSchema) : normalized.description;

    const updated = await this.prisma.prompt.update({
      where: { id: prompt.id },
      data: {
        ...(normalized.name !== undefined ? { name: normalized.name } : {}),
        ...(normalized.userTemplate !== undefined ? { userTemplate: normalized.userTemplate } : {}),
        paramsSchema: {
          description: nextDescription,
        },
      },
    });

    return { prompt: this.toDetail(updated) };
  }

  async getUsablePrompt(promptId: string, userId: string, category: string): Promise<ArticleGenerationPrompt> {
    const prompt = await this.prisma.prompt.findFirst({
      where: {
        id: promptId,
        category,
        OR: [{ owner: PromptOwner.Platform }, { owner: PromptOwner.Private, authorId: userId }],
      },
      select: {
        systemPrompt: true,
        userTemplate: true,
      },
    });

    if (!prompt) {
      throw new NotFoundException("Prompt template not found");
    }

    return prompt;
  }

  async getStarterPrompt(category = ARTICLE_GENERATION_CATEGORY): Promise<ArticleGenerationPrompt | null> {
    const prompt = await this.prisma.prompt.findFirst({
      where: {
        owner: "PLATFORM",
        category,
        isStarter: true,
      },
      orderBy: { createdAt: "asc" },
      select: {
        systemPrompt: true,
        userTemplate: true,
      },
    });

    return prompt;
  }

  private toSummary(prompt: {
    id: string;
    name: string;
    category: string;
    owner: PromptOwner | string;
    isStarter: boolean;
    paramsSchema?: unknown;
  }): PromptTemplateSummary {
    return {
      id: prompt.id,
      name: prompt.name,
      category: prompt.category,
      owner: prompt.owner as PromptOwner,
      isStarter: prompt.isStarter,
      description: this.readDescription(prompt.paramsSchema),
    };
  }

  private toDetail(prompt: {
    id: string;
    name: string;
    category: string;
    owner: PromptOwner | string;
    isStarter: boolean;
    userTemplate: string;
    sourcePromptId?: string | null;
    paramsSchema?: unknown;
  }): PromptTemplateDetail {
    return {
      ...this.toSummary(prompt),
      readonly: prompt.owner === PromptOwner.Platform,
      userTemplate: prompt.userTemplate,
      sourcePromptId: prompt.sourcePromptId ?? null,
      outputContractPreview,
    };
  }

  private usablePromptWhere(promptId: string, userId: string) {
    return {
      id: promptId,
      OR: [{ owner: PromptOwner.Platform }, { owner: PromptOwner.Private, authorId: userId }],
    };
  }

  private normalizeCreateInput(input: CreatePromptInput) {
    const name = this.normalizeName(input.name);
    const category = input.category?.trim() || ARTICLE_GENERATION_CATEGORY;
    const description = input.description?.trim() || undefined;
    const userTemplate = this.normalizeUserTemplate(input.userTemplate);

    return { name, category, description, userTemplate };
  }

  private normalizeUpdateInput(input: UpdatePromptInput) {
    return {
      name: input.name === undefined ? undefined : this.normalizeName(input.name),
      description: input.description === undefined ? undefined : input.description.trim() || undefined,
      userTemplate:
        input.userTemplate === undefined ? undefined : this.normalizeUserTemplate(input.userTemplate),
    };
  }

  private normalizeName(name: string | undefined) {
    const normalized = name?.trim();

    if (!normalized) {
      throw new BadRequestException("Prompt name is required");
    }

    if (normalized.length > 60) {
      throw new BadRequestException("Prompt name is too long");
    }

    return normalized;
  }

  private normalizeUserTemplate(userTemplate: string | undefined) {
    const normalized = userTemplate?.trim();

    if (!normalized || normalized.length < 20) {
      throw new BadRequestException("Prompt template is too short");
    }

    if (normalized.length > 4000) {
      throw new BadRequestException("Prompt template is too long");
    }

    return normalized;
  }

  private controlledSystemPromptFor(category: string) {
    if (category === ARTICLE_GENERATION_CATEGORY) {
      return controlledArticleSystemPrompt;
    }

    return controlledArticleSystemPrompt;
  }

  private readDescription(paramsSchema: unknown) {
    if (!paramsSchema || typeof paramsSchema !== "object") return undefined;
    const description = (paramsSchema as { description?: unknown }).description;
    return typeof description === "string" ? description : undefined;
  }
}
