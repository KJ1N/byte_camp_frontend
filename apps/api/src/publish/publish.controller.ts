import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { PublishService } from "./publish.service";

@Controller()
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  @Post("publish/:draftId")
  @UseGuards(JwtAuthGuard)
  publish(@CurrentUser("userId") userId: string, @Param("draftId") draftId: string) {
    return this.publishService.publishDraft(userId, draftId);
  }

  @Get("articles/:id")
  getArticle(@Param("id") id: string) {
    return this.publishService.getPublishedArticle(id);
  }
}

