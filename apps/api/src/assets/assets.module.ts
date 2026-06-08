import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AssetsController } from "./assets.controller";
import { AssetAuditService } from "./asset-audit.service";
import { AssetsService } from "./assets.service";
import { CloudStorageService } from "./cloud-storage.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [AssetsController],
  providers: [AssetsService, AssetAuditService, CloudStorageService],
})
export class AssetsModule {}
