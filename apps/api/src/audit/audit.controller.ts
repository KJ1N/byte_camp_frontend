import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import type { AuditCheckInput } from "@bytecamp-aigc/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { PublishService } from "../publish/publish.service";

@Controller("audit")
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly publishService: PublishService) {}

  @Post("check")
  check(@CurrentUser("userId") userId: string, @Body() body: AuditCheckInput) {
    return this.publishService.checkDraft(userId, body.draftId);
  }
}

