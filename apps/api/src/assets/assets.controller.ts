import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { CreateAssetFolderInput, RenameAssetFolderInput } from "@bytecamp-aigc/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { AssetsService, type UploadedAssetFile } from "./assets.service";

@Controller("assets")
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get("folders")
  listFolders(@CurrentUser("userId") userId: string) {
    return this.assetsService.listFolders(userId);
  }

  @Post("folders")
  createFolder(@CurrentUser("userId") userId: string, @Body() body: CreateAssetFolderInput) {
    return this.assetsService.createFolder(userId, body);
  }

  @Patch("folders/:id")
  renameFolder(
    @CurrentUser("userId") userId: string,
    @Param("id") folderId: string,
    @Body() body: RenameAssetFolderInput,
  ) {
    return this.assetsService.renameFolder(userId, folderId, body);
  }

  @Delete("folders/:id")
  deleteFolder(@CurrentUser("userId") userId: string, @Param("id") folderId: string) {
    return this.assetsService.deleteFolder(userId, folderId);
  }

  @Get("mine")
  listMine(@CurrentUser("userId") userId: string, @Query("folderId") folderId?: string) {
    return this.assetsService.listMine(userId, folderId);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  upload(@CurrentUser("userId") userId: string, @UploadedFile() file?: UploadedAssetFile, @Body("folderId") folderId?: string) {
    return this.assetsService.uploadAsset(userId, file, folderId);
  }

  @Delete(":id")
  delete(@CurrentUser("userId") userId: string, @Param("id") assetId: string) {
    return this.assetsService.deleteAsset(userId, assetId);
  }
}
