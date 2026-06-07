import { Module } from "@nestjs/common";
import { AiGatewayModule } from "../ai-gateway/ai-gateway.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ComplianceRewriteService } from "./compliance-rewrite.service";
import { AuditService } from "./audit.service";

@Module({
  imports: [PrismaModule, AiGatewayModule],
  providers: [AuditService, ComplianceRewriteService],
  exports: [AuditService, ComplianceRewriteService],
})
export class AuditModule {}
