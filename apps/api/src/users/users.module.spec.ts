import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { UsersModule } from "./users.module";
import { UsersService } from "./users.service";

describe("UsersModule", () => {
  it("compiles with the auth guard dependencies used by creator overview routes", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), UsersModule],
    }).compile();

    assert.ok(moduleRef.get(UsersService));
    await moduleRef.close();
  });
});
