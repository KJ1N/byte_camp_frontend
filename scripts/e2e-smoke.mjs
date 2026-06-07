import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDevConfig, startDevProcesses, waitForHttpOk } from "./dev.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const e2eWebPort = process.env.E2E_WEB_PORT ?? "3200";
const e2eApiPort = process.env.E2E_API_PORT ?? "3201";
const e2eApiBaseUrl = process.env.E2E_API_BASE_URL ?? `http://127.0.0.1:${e2eApiPort}`;

const baseEnv = {
  ...process.env,
  WEB_PORT: e2eWebPort,
  API_PORT: e2eApiPort,
  NEXT_PUBLIC_API_BASE_URL: e2eApiBaseUrl,
  AI_PROVIDER_MODE: "mock",
  AI_MODEL: "mock-model",
};

function playwrightCliPath() {
  return path.join(rootDir, "node_modules", "@playwright", "test", "cli.js");
}

function stopChildren(children) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

function runPlaywright(config) {
  return new Promise((resolve, reject) => {
    const playwrightArgs = ["test", "e2e/smoke.spec.ts", "--project=chromium"];

    const child = spawn(
      process.execPath,
      [playwrightCliPath(), ...playwrightArgs],
      {
        cwd: rootDir,
        env: {
          ...baseEnv,
          E2E_SKIP_WEBSERVER: "1",
          E2E_BASE_URL: `http://localhost:${config.webPort}`,
          E2E_API_BASE_URL: config.apiBaseUrl,
        },
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Playwright exited with signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const config = await resolveDevConfig({ env: baseEnv });
  const children = await startDevProcesses(config, baseEnv, {
    registerProcessSignals: false,
    setExitCode: () => {},
  });

  const webUrl = `http://localhost:${config.webPort}`;
  console.log(`Waiting for Web readiness: ${webUrl}`);
  await waitForHttpOk({ url: webUrl, timeoutMs: 180_000 });

  try {
    const exitCode = await runPlaywright(config);
    process.exitCode = exitCode;
  } finally {
    stopChildren(children);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
