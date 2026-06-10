import { Module } from "@nestjs/common";
import { AssetAuditService } from "./asset-audit.service";
import { CloudStorageService } from "./cloud-storage.service";
import { GeneratedImageStorageService } from "./generated-image-storage.service";

@Module({
  providers: [AssetAuditService, CloudStorageService, GeneratedImageStorageService],
  exports: [AssetAuditService, CloudStorageService, GeneratedImageStorageService],
})
export class AssetStorageModule {}
