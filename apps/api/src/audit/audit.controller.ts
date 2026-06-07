import { Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import type { AuditCheckInput, ComplianceRewriteInput } from "@bytecamp-aigc/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { writeSse, type SseResponse } from "../common/sse";
import { PublishService } from "../publish/publish.service";
import { ComplianceRewriteService } from "./compliance-rewrite.service";

@Controller("audit")
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(
    private readonly publishService: PublishService,
    private readonly complianceRewriteService: ComplianceRewriteService,
  ) {}

  @Post("check")
  check(@CurrentUser("userId") userId: string, @Body() body: AuditCheckInput) {
    return this.publishService.checkDraft(userId, body.draftId);
  }

  @Post("rewrite/stream")
  rewrite(
    @CurrentUser("userId") userId: string,
    @Body() body: ComplianceRewriteInput,
    @Res() response: SseResponse,
  ) {
    return writeSse(response, this.complianceRewriteService.streamComplianceRewrite(userId, body));
  }
}
