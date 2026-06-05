import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PromptsService } from "./prompts.service";

@Module({
  imports: [PrismaModule],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
