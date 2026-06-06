import { Injectable, NotFoundException } from "@nestjs/common";
import { PromptOwner, type ListPromptsResponse, type PromptTemplateSummary } from "@bytecamp-aigc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ARTICLE_GENERATION_CATEGORY, type ArticleGenerationPrompt } from "../ai-gateway/ai-gateway.prompts";

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

  private readDescription(paramsSchema: unknown) {
    if (!paramsSchema || typeof paramsSchema !== "object") return undefined;
    const description = (paramsSchema as { description?: unknown }).description;
    return typeof description === "string" ? description : undefined;
  }
}
