import { Module } from "@nestjs/common";
import { AiGatewayModule } from "../ai-gateway/ai-gateway.module";
import { ScoringService } from "./scoring.service";

@Module({
  imports: [AiGatewayModule],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
