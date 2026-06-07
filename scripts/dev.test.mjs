import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  chooseAvailablePort,
  createPnpmSpawnCommand,
  formatDevPortSummary,
  resolveDevConfig,
  shouldDryRun,
  startDevProcesses,
  waitForHttpOk,
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

test("waitForHttpOk retries until the endpoint returns a successful response", async () => {
  const calls = [];

  await waitForHttpOk({
    url: "http://localhost:3201/health",
    timeoutMs: 1000,
    intervalMs: 10,
    fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response(null, { status: calls.length === 3 ? 200 : 503 });
    },
    sleep: async () => {},
  });

  assert.deepEqual(calls, [
    "http://localhost:3201/health",
    "http://localhost:3201/health",
    "http://localhost:3201/health",
  ]);
});

test("waitForHttpOk reports a clear timeout when the endpoint never becomes ready", async () => {
  await assert.rejects(
    waitForHttpOk({
      url: "http://localhost:3201/health",
      timeoutMs: 0,
      fetchImpl: async () => new Response(null, { status: 503 }),
      sleep: async () => {},
    }),
    /Timed out waiting for API readiness at http:\/\/localhost:3201\/health/,
  );
});

test("startDevProcesses waits for API readiness before spawning Web", async () => {
  const events = [];
  const children = [];

  const spawnProcess = (label) => {
    events.push(`spawn:${label}`);
    const child = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };
    children.push(child);
    return child;
  };

  await startDevProcesses(
    {
      webPort: 3200,
      apiPort: 3201,
      apiBaseUrl: "http://localhost:3201",
    },
    {},
    {
      registerProcessSignals: false,
      spawnProcess,
      waitForApiReady: async (url) => {
        events.push(`wait:${url}`);
      },
    },
  );

  assert.deepEqual(events, [
    "spawn:packages/shared",
    "spawn:apps/api",
    "wait:http://localhost:3201/health",
    "spawn:apps/web",
  ]);
  assert.equal(children.length, 3);
});

test("startDevProcesses rejects when a child exits before API readiness", async () => {
  const children = new Map();

  const spawnProcess = (label) => {
    const child = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };
    children.set(label, child);
    return child;
  };

  await assert.rejects(
    startDevProcesses(
      {
        webPort: 3200,
        apiPort: 3201,
        apiBaseUrl: "http://localhost:3201",
      },
      {},
      {
        registerProcessSignals: false,
        setExitCode: () => {},
        spawnProcess,
        waitForApiReady: async () => {
          children.get("apps/api").emit("exit", 1, null);
          await new Promise(() => {});
        },
      },
    ),
    /apps\/api exited with code 1 before the API became ready/,
  );

  assert.equal(children.get("packages/shared").killed, true);
  assert.equal(children.get("apps/api").killed, true);
  assert.equal(children.has("apps/web"), false);
});
