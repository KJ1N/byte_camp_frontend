import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { NewsService } from "./news.service";

@Controller("news")
@UseGuards(JwtAuthGuard)
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get("creator-daily")
  getCreatorDailyNews(@Query("date") date?: string) {
    return this.newsService.getCreatorDailyNews({
      date: this.normalizeDate(date),
    });
  }

  private normalizeDate(value?: string) {
    const date = value?.trim();
    if (!date) return undefined;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException("Date must use YYYY-MM-DD format");
    }

    return date;
  }
}
