import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseAvailablePort,
  createPnpmSpawnCommand,
  formatDevPortSummary,
  resolveDevConfig,
  shouldDryRun,
} from "./dev.mjs";

test("chooseAvailablePort skips unavailable ports in order", async () => {
  const checkedPorts = [];

  const port = await chooseAvailablePort({
    preferredPort: 3200,
    maxAttempts: 4,
    label: "Web",
    isPortAvailable: async (candidate) => {
      checkedPorts.push(candidate);
      return candidate === 3202;
    },
  });

  assert.equal(port, 3202);
  assert.deepEqual(checkedPorts, [3200, 3201, 3202]);
});

test("resolveDevConfig wires Web to the selected API port", async () => {
  const config = await resolveDevConfig({
    env: {},
    isPortAvailable: async () => true,
  });

  assert.equal(config.webPort, 3200);
  assert.equal(config.apiPort, 3201);
  assert.equal(config.apiBaseUrl, "http://localhost:3201");
  assert.equal(config.apiBaseUrlFromEnv, false);
});

test("resolveDevConfig avoids reusing the Web port when selecting API port", async () => {
  const config = await resolveDevConfig({
    env: {},
    isPortAvailable: async (candidate) => candidate !== 3200,
  });

  assert.equal(config.webPort, 3201);
  assert.equal(config.apiPort, 3202);
  assert.equal(config.apiBaseUrl, "http://localhost:3202");
});

test("resolveDevConfig rejects an unavailable explicit Web port", async () => {
  await assert.rejects(
    resolveDevConfig({
      env: { WEB_PORT: "3200" },
      isPortAvailable: async (candidate) => candidate !== 3200,
    }),
    /WEB_PORT 3200 is not available/,
  );
});

test("resolveDevConfig respects an explicit API base URL", async () => {
  const config = await resolveDevConfig({
    env: {
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:4999",
    },
    isPortAvailable: async () => true,
  });

  assert.equal(config.apiBaseUrl, "http://localhost:4999");
  assert.equal(config.apiBaseUrlFromEnv, true);
});

test("formatDevPortSummary prints selected ports and API base URL", () => {
  const summary = formatDevPortSummary({
    webPort: 3200,
    apiPort: 3201,
    apiBaseUrl: "http://localhost:3201",
    apiBaseUrlFromEnv: false,
  });

  assert.match(summary, /Web: http:\/\/localhost:3200/);
  assert.match(summary, /API: http:\/\/localhost:3201/);
  assert.match(summary, /Web API base URL: http:\/\/localhost:3201/);
});

test("shouldDryRun detects the dry-run flag", () => {
  assert.equal(shouldDryRun(["node", "scripts/dev.mjs", "--dry-run"]), true);
  assert.equal(shouldDryRun(["node", "scripts/dev.mjs"]), false);
});

test("createPnpmSpawnCommand uses cmd.exe on Windows for corepack shims", () => {
  const command = createPnpmSpawnCommand({
    platform: "win32",
    pnpmArgs: ["--filter", "@bytecamp-aigc/web", "dev"],
  });

  assert.equal(command.file, "cmd.exe");
  assert.deepEqual(command.args, [
    "/d",
    "/s",
    "/c",
    "corepack pnpm --filter @bytecamp-aigc/web dev",
  ]);
});

test("createPnpmSpawnCommand uses direct corepack spawn off Windows", () => {
  const command = createPnpmSpawnCommand({
    platform: "linux",
    pnpmArgs: ["--version"],
  });

  assert.equal(command.file, "corepack");
  assert.deepEqual(command.args, ["pnpm", "--version"]);
});
