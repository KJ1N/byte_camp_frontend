import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AssetStorageModule } from "./asset-storage.module";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";

@Module({
  imports: [AuthModule, AuditModule, AssetStorageModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
