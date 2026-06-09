import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPnpmSpawnCommand,
  resolveDevConfig,
  startDevProcesses,
  stopChildren,
  waitForHttpOk,
} from "./dev.mjs";
import { loadRootEnv } from "./e2e-env.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadedEnv = loadRootEnv(rootDir);
const e2eWebPort = loadedEnv.E2E_WEB_PORT ?? "3200";
const e2eApiPort = loadedEnv.E2E_API_PORT ?? "3201";
const e2eApiBaseUrl = loadedEnv.E2E_API_BASE_URL ?? `http://127.0.0.1:${e2eApiPort}`;
const defaultDatabaseName = "bytecamp_aigc";

function normalizeUrl(value) {
  return value ? value.trim().replace(/\/+$/, "") : "";
}

function databaseName(value) {
  try {
    return new URL(value).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

function requireE2eDatabaseUrl(env = loadedEnv) {
  const e2eDatabaseUrl = normalizeUrl(env.E2E_DATABASE_URL);
  if (!e2eDatabaseUrl) {
    throw new Error("E2E_DATABASE_URL is required for smoke E2E.");
  }

  const regularDatabaseUrl = normalizeUrl(env.DATABASE_URL);
  if (regularDatabaseUrl && regularDatabaseUrl === e2eDatabaseUrl) {
    throw new Error("E2E_DATABASE_URL must be different from the normal DATABASE_URL.");
  }

  const name = databaseName(e2eDatabaseUrl);
  if (!name || name === defaultDatabaseName) {
    throw new Error(`E2E_DATABASE_URL must point to a dedicated test database, not ${defaultDatabaseName}.`);
  }

  return e2eDatabaseUrl;
}

function playwrightCliPath() {
  return path.join(rootDir, "node_modules", "@playwright", "test", "cli.js");
}

function runChild(label, file, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: rootDir,
      env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label} exited with signal ${signal}.`));
        return;
      }

      if (code) {
        reject(new Error(`${label} exited with code ${code}.`));
        return;
      }

      resolve();
    });
  });
}

function runPnpm(label, pnpmArgs, env) {
  const command = createPnpmSpawnCommand({ pnpmArgs });
  return runChild(label, command.file, command.args, env);
}

async function prepareDatabase(e2eDatabaseUrl) {
  const e2eEnv = {
    ...loadedEnv,
    DATABASE_URL: e2eDatabaseUrl,
  };

  await runPnpm("Prisma migrate deploy", ["--filter", "@bytecamp-aigc/api", "exec", "prisma", "migrate", "deploy"], e2eEnv);
  await runPnpm("Prisma seed", ["--filter", "@bytecamp-aigc/api", "prisma:seed"], e2eEnv);
}

async function runPlaywright(config, env) {
  await runChild(
    "Playwright smoke E2E",
    process.execPath,
    [playwrightCliPath(), "test", "e2e/smoke.spec.ts", "--project=chromium"],
    {
      ...env,
      E2E_SKIP_WEBSERVER: "1",
      E2E_BASE_URL: `http://localhost:${config.webPort}`,
      E2E_API_BASE_URL: config.apiBaseUrl,
    },
  );
}

async function main() {
  const e2eDatabaseUrl = requireE2eDatabaseUrl(loadedEnv);
  await prepareDatabase(e2eDatabaseUrl);

  const baseEnv = {
    ...loadedEnv,
    WEB_PORT: e2eWebPort,
    API_PORT: e2eApiPort,
    NEXT_PUBLIC_API_BASE_URL: e2eApiBaseUrl,
    DATABASE_URL: e2eDatabaseUrl,
    E2E_DATABASE_URL: e2eDatabaseUrl,
    REDIS_URL: "",
    AI_PROVIDER_MODE: "mock",
    AI_MODEL: "mock-model",
  };

  const config = await resolveDevConfig({ env: baseEnv });
  const children = await startDevProcesses(config, baseEnv, {
    registerProcessSignals: false,
    setExitCode: () => {},
  });

  const webUrl = `http://localhost:${config.webPort}`;
  console.log(`Waiting for Web readiness: ${webUrl}`);
  await waitForHttpOk({ url: webUrl, timeoutMs: 180_000 });

  try {
    await runPlaywright(config, baseEnv);
  } finally {
    stopChildren(children);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
