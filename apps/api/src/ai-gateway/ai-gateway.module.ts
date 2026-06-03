import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AiGatewayController } from "./ai-gateway.controller";
import { AiGatewayService } from "./ai-gateway.service";

@Module({
  imports: [AuthModule],
  controllers: [AiGatewayController],
  providers: [AiGatewayService],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
