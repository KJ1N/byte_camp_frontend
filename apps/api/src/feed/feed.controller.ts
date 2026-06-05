import { Controller, Get, Query } from "@nestjs/common";
import { FeedService } from "./feed.service";

@Controller("feed")
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  list(@Query("limit") limit?: string, @Query("cursor") cursor?: string) {
    return this.feedService.listFeed({
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }
}
