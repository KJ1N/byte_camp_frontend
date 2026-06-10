import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Redirect,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { CreateAssetFolderInput, RenameAssetFolderInput } from "@bytecamp-aigc/shared";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { AssetsService, type UploadedAssetFile } from "./assets.service";
import { GeneratedImageStorageService } from "./generated-image-storage.service";

@Controller("assets")
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly generatedImageStorage: GeneratedImageStorageService,
  ) {}

  @Get("folders")
  @UseGuards(JwtAuthGuard)
  listFolders(@CurrentUser("userId") userId: string) {
    return this.assetsService.listFolders(userId);
  }

  @Post("folders")
  @UseGuards(JwtAuthGuard)
  createFolder(@CurrentUser("userId") userId: string, @Body() body: CreateAssetFolderInput) {
    return this.assetsService.createFolder(userId, body);
  }

  @Patch("folders/:id")
  @UseGuards(JwtAuthGuard)
  renameFolder(
    @CurrentUser("userId") userId: string,
    @Param("id") folderId: string,
    @Body() body: RenameAssetFolderInput,
  ) {
    return this.assetsService.renameFolder(userId, folderId, body);
  }

  @Delete("folders/:id")
  @UseGuards(JwtAuthGuard)
  deleteFolder(@CurrentUser("userId") userId: string, @Param("id") folderId: string) {
    return this.assetsService.deleteFolder(userId, folderId);
  }

  @Get("mine")
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser("userId") userId: string, @Query("folderId") folderId?: string) {
    return this.assetsService.listMine(userId, folderId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("file"))
  upload(@CurrentUser("userId") userId: string, @UploadedFile() file?: UploadedAssetFile, @Body("folderId") folderId?: string) {
    return this.assetsService.uploadAsset(userId, file, folderId);
  }

  @Get(":id/view")
  @Redirect()
  async view(@Param("id") assetId: string) {
    return { url: await this.assetsService.getAssetReadUrl(assetId), statusCode: 302 };
  }

  @Get("generated/:userId/:filename/view")
  @Redirect()
  viewGenerated(@Param("userId") userId: string, @Param("filename") filename: string) {
    return {
      url: this.generatedImageStorage.getGeneratedImageReadUrl(userId, filename),
      statusCode: 302,
    };
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  delete(@CurrentUser("userId") userId: string, @Param("id") assetId: string) {
    return this.assetsService.deleteAsset(userId, assetId);
  }
}
