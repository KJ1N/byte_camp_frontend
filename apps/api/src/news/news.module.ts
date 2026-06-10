import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NewsCacheService } from "./news-cache.service";
import { NewsController } from "./news.controller";
import { NewsService } from "./news.service";

@Module({
  imports: [AuthModule],
  controllers: [NewsController],
  providers: [NewsCacheService, NewsService],
  exports: [NewsCacheService, NewsService],
})
export class NewsModule {}
