import { Module } from "@nestjs/common";
import { RankingCacheService } from "./ranking-cache.service";
import { RankingService } from "./ranking.service";

@Module({
  providers: [RankingService, RankingCacheService],
  exports: [RankingService, RankingCacheService],
})
export class RankingModule {}
