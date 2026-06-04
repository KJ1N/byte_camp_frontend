import { Module } from "@nestjs/common";
import { AuditController } from "../audit/audit.controller";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ScoringController } from "../scoring/scoring.controller";
import { ScoringModule } from "../scoring/scoring.module";
import { PublishController } from "./publish.controller";
import { PublishService } from "./publish.service";

@Module({
  imports: [AuthModule, PrismaModule, AuditModule, ScoringModule],
  controllers: [AuditController, ScoringController, PublishController],
  providers: [PublishService],
})
export class PublishModule {}
