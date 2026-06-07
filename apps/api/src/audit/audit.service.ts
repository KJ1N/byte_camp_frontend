import { Injectable } from "@nestjs/common";
import type { AuditResult } from "@bytecamp-aigc/shared";
import { AiGatewayService } from "../ai-gateway/ai-gateway.service";

@Injectable()
export class AuditService {
  constructor(private readonly aiGatewayService: AiGatewayService) {}

  async checkText(text: string): Promise<AuditResult> {
    return this.aiGatewayService.auditContent(text);
  }
}
