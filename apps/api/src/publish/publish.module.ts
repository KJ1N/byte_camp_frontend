import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { AuditController } from "../audit/audit.controller";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RankingModule } from "../ranking/ranking.module";
import { ScoringController } from "../scoring/scoring.controller";
import { ScoringModule } from "../scoring/scoring.module";
import { PublishController } from "./publish.controller";
import { PublishService } from "./publish.service";

@Module({
  imports: [AuthModule, PrismaModule, AuditModule, ScoringModule, AnalyticsModule, RankingModule],
  controllers: [AuditController, ScoringController, PublishController],
  providers: [PublishService],
})
export class PublishModule {}
