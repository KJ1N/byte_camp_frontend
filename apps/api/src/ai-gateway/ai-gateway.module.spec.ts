import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { AiGatewayModule } from "./ai-gateway.module";
import { AiGatewayService } from "./ai-gateway.service";

describe("AiGatewayModule", () => {
  it("compiles with the default provider wiring used by the API runtime", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AiGatewayModule],
    }).compile();

    assert.ok(moduleRef.get(AiGatewayService));
    await moduleRef.close();
  });
});
