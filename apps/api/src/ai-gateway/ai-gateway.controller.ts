import { BadRequestException, Body, Controller, Get, Post, Res, UseGuards } from "@nestjs/common";
import type { GenerateArticleInput, OptimizeTitlesInput, RewriteArticleInput } from "@bytecamp-aigc/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { writeSse, type SseResponse } from "../common/sse";
import { AiGatewayService } from "./ai-gateway.service";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiGatewayController {
  constructor(private readonly aiGatewayService: AiGatewayService) {}

  @Post("generate-article")
  generateArticle(@CurrentUser("userId") userId: string, @Body() body: GenerateArticleInput) {
    const input = this.normalizeGenerateArticleInput(body);
    return this.aiGatewayService.generateArticleDraft(input, userId);
  }

  @Post("generate-article/stream")
  streamGenerateArticle(
    @CurrentUser("userId") userId: string,
    @Body() body: GenerateArticleInput,
    @Res() response: SseResponse,
  ) {
    const input = this.normalizeGenerateArticleInput(body);
    return writeSse(response, this.aiGatewayService.streamArticleDraft(input, userId));
  }

  @Post("optimize-titles/stream")
  streamOptimizeTitles(
    @Body() body: OptimizeTitlesInput,
    @Res() response: SseResponse,
  ) {
    return writeSse(response, this.aiGatewayService.streamTitleOptimization(this.normalizeOptimizeTitlesInput(body)));
  }

  @Post("rewrite/stream")
  streamRewrite(
    @Body() body: RewriteArticleInput,
    @Res() response: SseResponse,
  ) {
    return writeSse(response, this.aiGatewayService.streamRewrite(body));
  }

  @Get("creator-inspirations")
  getCreatorInspirations() {
    return this.aiGatewayService.generateCreatorInspirations();
  }

  private normalizeGenerateArticleInput(body: GenerateArticleInput): GenerateArticleInput {
    const topic = body.topic?.trim();
    const audience = body.audience?.trim() || "内容创作者";
    const style = body.style?.trim() || "科普";
    const promptId = body.promptId?.trim() || undefined;

    if (!topic) {
      throw new BadRequestException("Topic is required");
    }

    return { topic, audience, style, promptId };
  }

  private normalizeOptimizeTitlesInput(body: OptimizeTitlesInput): OptimizeTitlesInput {
    const topic = body.topic?.trim();
    const audience = body.audience?.trim() || "内容创作者";
    const style = body.style?.trim() || "科普";

    if (!topic) {
      throw new BadRequestException("Topic is required");
    }

    return {
      topic,
      audience,
      style,
      currentTitle: body.currentTitle?.trim() || undefined,
      bodyText: body.bodyText?.trim() || undefined,
    };
  }
}
