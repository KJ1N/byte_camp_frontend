import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { PromptsService } from "./prompts.service";

@Controller("prompts")
@UseGuards(JwtAuthGuard)
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Get()
  listPrompts(@CurrentUser("userId") userId: string, @Query("category") category?: string) {
    return this.promptsService.listAvailablePrompts(userId, category?.trim() || undefined);
  }
}
