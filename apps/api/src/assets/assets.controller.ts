import { Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { AssetsService, type UploadedAssetFile } from "./assets.service";

@Controller("assets")
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get("mine")
  listMine(@CurrentUser("userId") userId: string) {
    return this.assetsService.listMine(userId);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  upload(@CurrentUser("userId") userId: string, @UploadedFile() file?: UploadedAssetFile) {
    return this.assetsService.uploadAsset(userId, file);
  }

  @Delete(":id")
  delete(@CurrentUser("userId") userId: string, @Param("id") assetId: string) {
    return this.assetsService.deleteAsset(userId, assetId);
  }
}
