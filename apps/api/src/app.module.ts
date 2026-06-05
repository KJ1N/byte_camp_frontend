import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AiGatewayModule } from "./ai-gateway/ai-gateway.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AssetsModule } from "./assets/assets.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { DraftsModule } from "./drafts/drafts.module";
import { FeedModule } from "./feed/feed.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PromptsModule } from "./prompts/prompts.module";
import { PublishModule } from "./publish/publish.module";
import { RankingModule } from "./ranking/ranking.module";
import { ScoringModule } from "./scoring/scoring.module";
import { UsersModule } from "./users/users.module";
import { HealthController } from "./common/health.controller";
import { getRootEnvFilePath } from "./common/env-paths";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: getRootEnvFilePath() }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DraftsModule,
    PromptsModule,
    AssetsModule,
    AiGatewayModule,
    AuditModule,
    ScoringModule,
    PublishModule,
    FeedModule,
    RankingModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
