import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { CreateDraftInput, UpdateDraftInput } from "@bytecamp-aigc/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { DraftsService } from "./drafts.service";

@Controller("drafts")
@UseGuards(JwtAuthGuard)
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Post()
  create(@CurrentUser("userId") userId: string, @Body() body: CreateDraftInput) {
    return this.draftsService.createDraft(userId, body);
  }

  @Get("mine")
  listMine(@CurrentUser("userId") userId: string) {
    return this.draftsService.listMine(userId);
  }

  @Get(":id")
  getDraft(@CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.draftsService.getMineById(userId, id);
  }

  @Patch(":id")
  update(@CurrentUser("userId") userId: string, @Param("id") id: string, @Body() body: UpdateDraftInput) {
    return this.draftsService.updateDraft(userId, id, body);
  }

  @Get(":id/versions")
  listVersions(@CurrentUser("userId") userId: string, @Param("id") id: string) {
    return this.draftsService.listVersions(userId, id);
  }
}
