import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RankingController } from "../ranking/ranking.controller";
import { RankingModule } from "../ranking/ranking.module";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";

@Module({
  imports: [PrismaModule, RankingModule],
  controllers: [FeedController, RankingController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
