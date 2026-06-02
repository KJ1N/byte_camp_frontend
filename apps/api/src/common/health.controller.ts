import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return {
      status: "ok",
      service: "bytecamp-aigc-api",
      time: new Date().toISOString(),
    };
  }
}

