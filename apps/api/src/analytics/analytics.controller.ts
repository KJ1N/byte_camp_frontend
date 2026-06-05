import { Body, Controller, Param, Post } from "@nestjs/common";
import type { CreateEngagementEventInput } from "@bytecamp-aigc/shared";
import { AnalyticsService } from "./analytics.service";

@Controller("articles")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post(":id/events")
  record(@Param("id") id: string, @Body() body: CreateEngagementEventInput) {
    return this.analyticsService.recordEvent(id, body);
  }
}
