import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RankingModule } from "../ranking/ranking.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [PrismaModule, RankingModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
