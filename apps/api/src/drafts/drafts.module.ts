import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { DraftsController } from "./drafts.controller";
import { DraftsService } from "./drafts.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DraftsController],
  providers: [DraftsService],
})
export class DraftsModule {}
