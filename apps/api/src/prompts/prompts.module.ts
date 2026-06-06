import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PromptsController } from "./prompts.controller";
import { PromptsService } from "./prompts.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
