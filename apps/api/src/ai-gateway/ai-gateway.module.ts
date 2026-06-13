import { Module } from "@nestjs/common";
import { AssetStorageModule } from "../assets/asset-storage.module";
import { AuthModule } from "../auth/auth.module";
import { PromptsModule } from "../prompts/prompts.module";
import { AiProviderClient } from "./ai-provider.client";
import { AiGatewayController } from "./ai-gateway.controller";
import { AiGatewayService } from "./ai-gateway.service";
import { AiRequestLogger } from "./ai-request-log";
import { MultimodalGenerationQueueService } from "./multimodal-generation-queue.service";
import { MultimodalGenerationWorker } from "./multimodal-generation.worker";

@Module({
  imports: [AuthModule, PromptsModule, AssetStorageModule],
  controllers: [AiGatewayController],
  providers: [
    AiGatewayService,
    AiProviderClient,
    AiRequestLogger,
    MultimodalGenerationQueueService,
    MultimodalGenerationWorker,
  ],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
