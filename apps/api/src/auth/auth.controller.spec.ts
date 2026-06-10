import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  it("registers a user through AuthService", async () => {
    const calls: unknown[] = [];
    const authService = {
      register: async (input: unknown) => {
        calls.push(input);
        return { accessToken: "token-register", user: { id: "user-1" } };
      },
      login: async () => ({ accessToken: "unused" }),
    };
    const controller = new AuthController(authService as never);
    const input = { email: "creator@example.com", password: "password123", nickname: "训练营创作者" };

    const result = await controller.register(input);

    assert.deepEqual(calls, [input]);
    assert.deepEqual(result, { accessToken: "token-register", user: { id: "user-1" } });
  });

  it("logs in a user through AuthService", async () => {
    const calls: unknown[] = [];
    const authService = {
      register: async () => ({ accessToken: "unused" }),
      login: async (input: unknown) => {
        calls.push(input);
        return { accessToken: "token-login", user: { id: "user-1" } };
      },
    };
    const controller = new AuthController(authService as never);
    const input = { email: "creator@example.com", password: "password123" };

    const result = await controller.login(input);

    assert.deepEqual(calls, [input]);
    assert.deepEqual(result, { accessToken: "token-login", user: { id: "user-1" } });
  });
});
