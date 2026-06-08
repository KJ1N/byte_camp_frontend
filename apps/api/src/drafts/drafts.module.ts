import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RankingModule } from "../ranking/ranking.module";
import { DraftsController } from "./drafts.controller";
import { DraftsService } from "./drafts.service";

@Module({
  imports: [AuthModule, PrismaModule, RankingModule],
  controllers: [DraftsController],
  providers: [DraftsService],
})
export class DraftsModule {}
