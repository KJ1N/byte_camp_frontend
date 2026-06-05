import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PromptsModule } from "../prompts/prompts.module";
import { AiProviderClient } from "./ai-provider.client";
import { AiGatewayController } from "./ai-gateway.controller";
import { AiGatewayService } from "./ai-gateway.service";

@Module({
  imports: [AuthModule, PromptsModule],
  controllers: [AiGatewayController],
  providers: [AiGatewayService, AiProviderClient],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
