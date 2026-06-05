import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join } from "node:path";
import { findWorkspaceRoot, getRootEnvFilePath } from "./env-paths";

const workspaceRoot = join(__dirname, "..", "..", "..", "..");

describe("env path helpers", () => {
  it("resolves the monorepo root from the API source directory", () => {
    assert.equal(findWorkspaceRoot(__dirname), workspaceRoot);
  });

  it("uses the monorepo root .env as the API config source", () => {
    assert.equal(getRootEnvFilePath(__dirname), join(workspaceRoot, ".env"));
  });
});
