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
const e2eWebPort = loadedEnv.E2E_WEB_PORT;
const e2eApiPort = loadedEnv.E2E_API_PORT;
const e2eApiBaseUrl = loadedEnv.E2E_API_BASE_URL;
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
    throw new Error("E2E_DATABASE_URL is required for rankings performance E2E.");
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

function omitDevServerEnv(env) {
  const { WEB_PORT, API_PORT, NEXT_PUBLIC_API_BASE_URL, ...rest } = env;
  return rest;
}

function playwrightCliPath() {
  return path.join(rootDir, "node_modules", "@playwright", "test", "cli.js");
}

async function prepareDatabase(e2eDatabaseUrl, regularDatabaseUrl) {
  const migrationEnv = {
    ...loadedEnv,
    DATABASE_URL: e2eDatabaseUrl,
  };

  await runPnpm("Prisma migrate deploy", ["--filter", "@bytecamp-aigc/api", "exec", "prisma", "migrate", "deploy"], migrationEnv);
  await runChild("E2E ranking seed", process.execPath, ["scripts/e2e-ranking-seed.mjs"], {
    ...loadedEnv,
    DATABASE_URL: regularDatabaseUrl,
    E2E_DATABASE_URL: e2eDatabaseUrl,
  });
}

async function runPlaywright(config, env) {
  await runChild(
    "Playwright rankings performance",
    process.execPath,
    [playwrightCliPath(), "test", "e2e/rankings-performance.spec.ts", "--project=chromium"],
    {
      ...env,
      E2E_SKIP_WEBSERVER: "1",
      E2E_BASE_URL: `http://localhost:${config.webPort}`,
      E2E_API_BASE_URL: config.apiBaseUrl,
    },
  );
}

async function main() {
  const regularDatabaseUrl = normalizeUrl(loadedEnv.DATABASE_URL);
  const e2eDatabaseUrl = requireE2eDatabaseUrl(loadedEnv);
  await prepareDatabase(e2eDatabaseUrl, regularDatabaseUrl);

  const baseEnv = {
    ...omitDevServerEnv(loadedEnv),
    ...(e2eWebPort ? { WEB_PORT: e2eWebPort } : {}),
    ...(e2eApiPort ? { API_PORT: e2eApiPort } : {}),
    ...(e2eApiBaseUrl ? { NEXT_PUBLIC_API_BASE_URL: e2eApiBaseUrl } : {}),
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

  try {
    const webUrl = `http://localhost:${config.webPort}`;
    console.log(`Waiting for Web readiness: ${webUrl}`);
    await waitForHttpOk({ url: webUrl, timeoutMs: 180_000 });
    await waitForHttpOk({ url: `${webUrl}/rankings?tab=hot`, timeoutMs: 180_000 });
    await waitForHttpOk({ url: `${webUrl}/rankings?tab=top`, timeoutMs: 180_000 });
    await runPlaywright(config, baseEnv);
  } finally {
    stopChildren(children);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
