import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import type { GenerateArticleInput } from "@bytecamp-aigc/shared";
import { JwtAuthGuard } from "../auth/auth.guard";
import { AiGatewayService } from "./ai-gateway.service";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiGatewayController {
  constructor(private readonly aiGatewayService: AiGatewayService) {}

  @Post("generate-article")
  generateArticle(@Body() body: GenerateArticleInput) {
    const topic = body.topic?.trim();
    const audience = body.audience?.trim() || "内容创作者";
    const style = body.style?.trim() || "科普";

    if (!topic) {
      throw new BadRequestException("Topic is required");
    }

    return this.aiGatewayService.generateArticleDraft({ topic, audience, style });
  }
}
