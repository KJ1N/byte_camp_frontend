import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { CopyPromptInput, CreatePromptInput, UpdatePromptInput } from "@bytecamp-aigc/shared";
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

  @Get(":id")
  getPrompt(@CurrentUser("userId") userId: string, @Param("id") promptId: string) {
    return this.promptsService.getPromptDetail(promptId, userId);
  }

  @Post()
  createPrompt(@CurrentUser("userId") userId: string, @Body() body: CreatePromptInput) {
    return this.promptsService.createPrivatePrompt(userId, body);
  }

  @Post(":id/copy")
  copyPrompt(
    @CurrentUser("userId") userId: string,
    @Param("id") promptId: string,
    @Body() body: CopyPromptInput,
  ) {
    return this.promptsService.copyPrompt(promptId, userId, body?.name);
  }

  @Patch(":id")
  updatePrompt(
    @CurrentUser("userId") userId: string,
    @Param("id") promptId: string,
    @Body() body: UpdatePromptInput,
  ) {
    return this.promptsService.updatePrivatePrompt(promptId, userId, body);
  }

  @Delete(":id")
  deletePrompt(@CurrentUser("userId") userId: string, @Param("id") promptId: string) {
    return this.promptsService.deletePrivatePrompt(promptId, userId);
  }
}
