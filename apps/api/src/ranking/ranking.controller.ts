import { Controller, Get, Query } from "@nestjs/common";
import { FeedService } from "../feed/feed.service";

@Controller("rankings")
export class RankingController {
  constructor(private readonly feedService: FeedService) {}

  @Get("hot")
  hot(@Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    return this.feedService.listRanking("hot", {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get("top")
  top(@Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    return this.feedService.listRanking("top", {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }
}
