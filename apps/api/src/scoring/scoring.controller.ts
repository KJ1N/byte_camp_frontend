import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import type { ScoringArticleInput } from "@bytecamp-aigc/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { PublishService } from "../publish/publish.service";

@Controller("scoring")
@UseGuards(JwtAuthGuard)
export class ScoringController {
  constructor(private readonly publishService: PublishService) {}

  @Post("article")
  score(@CurrentUser("userId") userId: string, @Body() body: ScoringArticleInput) {
    return this.publishService.scoreDraft(userId, body.draftId);
  }
}

