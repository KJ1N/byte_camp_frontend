import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ARTICLE_GENERATION_CATEGORY, type ArticleGenerationPrompt } from "../ai-gateway/ai-gateway.prompts";

@Injectable()
export class PromptsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
