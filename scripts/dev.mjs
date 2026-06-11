import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import net from "node:net";

export const DEFAULT_WEB_PORT = 3200;
export const DEFAULT_API_PORT = 3201;
export const DEFAULT_MAX_PORT_ATTEMPTS = 50;
const intentionalStop = Symbol("intentionalStop");

export function parsePort(value, label) {
  if (value === undefined || value === "") {
    return undefined;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer port from 1 to 65535.`);
  }

  return port;
}

export function canListenOnPort(port, host = "0.0.0.0") {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    server.once("error", () => finish(false));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => finish(true));
    });
  });
}

export async function chooseAvailablePort({
  preferredPort,
  label,
  maxAttempts = DEFAULT_MAX_PORT_ATTEMPTS,
  unavailablePorts = new Set(),
  isPortAvailable = canListenOnPort,
}) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (unavailablePorts.has(candidate)) {
      continue;
    }

    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }

  const lastPort = preferredPort + maxAttempts - 1;
  throw new Error(
    `Could not find an available ${label} port from ${preferredPort} to ${lastPort}.`,
  );
}

async function resolveExplicitPort({
  port,
  envName,
  label,
  unavailablePorts,
  isPortAvailable,
}) {
  if (unavailablePorts.has(port) || !(await isPortAvailable(port))) {
    throw new Error(
      `${envName} ${port} is not available. Pick another port or unset ${envName} so the dev script can choose one.`,
    );
  }

  return port;
}

export async function resolveDevConfig({
  env = process.env,
  isPortAvailable = canListenOnPort,
  maxAttempts = DEFAULT_MAX_PORT_ATTEMPTS,
} = {}) {
  const explicitWebPort = parsePort(env.WEB_PORT, "WEB_PORT");
  const explicitApiPort = parsePort(env.API_PORT, "API_PORT");

  if (
    explicitWebPort !== undefined &&
    explicitApiPort !== undefined &&
    explicitWebPort === explicitApiPort
  ) {
    throw new Error("WEB_PORT and API_PORT must use different ports.");
  }

  const webPort =
    explicitWebPort !== undefined
      ? await resolveExplicitPort({
          port: explicitWebPort,
          envName: "WEB_PORT",
          label: "Web",
          unavailablePorts: new Set(),
          isPortAvailable,
        })
      : await chooseAvailablePort({
          preferredPort: DEFAULT_WEB_PORT,
          label: "Web",
          maxAttempts,
          isPortAvailable,
        });

  const unavailableApiPorts = new Set([webPort]);
  const apiPort =
    explicitApiPort !== undefined
      ? await resolveExplicitPort({
          port: explicitApiPort,
          envName: "API_PORT",
          label: "API",
          unavailablePorts: unavailableApiPorts,
          isPortAvailable,
        })
      : await chooseAvailablePort({
          preferredPort: DEFAULT_API_PORT,
          label: "API",
          maxAttempts,
          unavailablePorts: unavailableApiPorts,
          isPortAvailable,
        });

  const apiBaseUrlFromEnv = Boolean(env.NEXT_PUBLIC_API_BASE_URL);
  const apiBaseUrl =
    env.NEXT_PUBLIC_API_BASE_URL ?? `http://localhost:${apiPort}`;

  return {
    webPort,
    apiPort,
    apiBaseUrl,
    apiBaseUrlFromEnv,
  };
}

export function createPnpmSpawnCommand({
  platform = process.platform,
  pnpmArgs,
}) {
  if (platform === "win32") {
    return {
      file: "cmd.exe",
      args: ["/d", "/s", "/c", ["corepack", "pnpm", ...pnpmArgs].join(" ")],
    };
  }

  return {
    file: "corepack",
    args: ["pnpm", ...pnpmArgs],
  };
}

export function apiHealthUrl(apiBaseUrl) {
  return `${apiBaseUrl.replace(/\/+$/, "")}/health`;
}

export async function waitForHttpOk({
  url,
  timeoutMs = 120_000,
  intervalMs = 500,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = "no response";

  while (true) {
    try {
      const response = await fetchImpl(url);

      if (response.ok) {
        return;
      }

      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for API readiness at ${url}. Last failure: ${lastFailure}`,
      );
    }

    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
}

function spawnPnpm(label, args, env) {
  const command = createPnpmSpawnCommand({ pnpmArgs: args });
  const child = spawn(command.file, command.args, {
    env,
    stdio: "inherit",
  });

  child.once("error", (error) => {
    console.error(`${label} failed to start`, error);
  });

  return child;
}

export function stopProcessTree(child, { platform = process.platform, spawnProcess = spawn } = {}) {
  if (!child || child.killed) {
    return Promise.resolve();
  }

  child[intentionalStop] = true;

  if (platform === "win32" && child.pid) {
    return new Promise((resolve) => {
      const killer = spawnProcess("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        child.unref?.();
        resolve();
      };

      killer.once("error", () => {
        if (!child.killed) {
          child.kill();
        }
        finish();
      });
      killer.once("close", finish);
    });
  }

  child.kill();
  return Promise.resolve();
}

export async function stopChildren(children, options) {
  await Promise.allSettled(children.map((child) => stopProcessTree(child, options)));
}

export async function startDevProcesses(config, baseEnv = process.env, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawnPnpm;
  const waitForApiReady =
    options.waitForApiReady ??
    ((url) => waitForHttpOk({ url }));
  const registerProcessSignals = options.registerProcessSignals ?? true;
  const setExitCode =
    options.setExitCode ??
    ((exitCode) => {
      process.exitCode = exitCode;
    });
  const children = [];
  let stopping = false;
  let waitingForApiStartup = true;
  let rejectStartupFailure;
  const startupFailure = new Promise((_, reject) => {
    rejectStartupFailure = reject;
  });

  const shutdown = async (exitCode = 0) => {
    if (stopping) {
      return;
    }
    stopping = true;
    await stopChildren(children);
    setExitCode(exitCode);
  };

  const trackChild = (label, child) => {
    children.push(child);
    child.once("exit", (code, signal) => {
      if (stopping || child[intentionalStop]) {
        return;
      }

      const exitCode = code ?? (signal ? 1 : 0);
      if (waitingForApiStartup) {
        const reason =
          signal !== null && signal !== undefined
            ? `${label} exited with signal ${signal}`
            : `${label} exited with code ${exitCode}`;
        rejectStartupFailure(
          new Error(`${reason} before the API became ready.`),
        );
      }
      void shutdown(exitCode);
    });

    return child;
  };

  trackChild("packages/shared", spawnProcess(
    "packages/shared",
    ["--filter", "@bytecamp-aigc/shared", "dev"],
    baseEnv,
  ));
  trackChild("apps/api", spawnProcess(
    "apps/api",
    ["--filter", "@bytecamp-aigc/api", "dev"],
    {
      ...baseEnv,
      PORT: String(config.apiPort),
    },
  ));

  const healthUrl = apiHealthUrl(config.apiBaseUrl);
  console.log(`Waiting for API readiness: ${healthUrl}`);
  try {
    await Promise.race([waitForApiReady(healthUrl), startupFailure]);
  } finally {
    waitingForApiStartup = false;
  }

  trackChild("apps/web", spawnProcess(
    "apps/web",
    ["--filter", "@bytecamp-aigc/web", "dev"],
    {
      ...baseEnv,
      PORT: String(config.webPort),
      NEXT_PUBLIC_API_BASE_URL: config.apiBaseUrl,
    },
  ));

  if (registerProcessSignals) {
    process.once("SIGINT", () => void shutdown(0));
    process.once("SIGTERM", () => void shutdown(0));
  }

  return children;
}

export function formatDevPortSummary(config) {
  return [
    "Dev ports:",
    `- Web: http://localhost:${config.webPort}`,
    `- API: http://localhost:${config.apiPort}`,
    `- Web API base URL: ${config.apiBaseUrl}${
      config.apiBaseUrlFromEnv ? " (from NEXT_PUBLIC_API_BASE_URL)" : ""
    }`,
  ].join("\n");
}

export function shouldDryRun(argv = process.argv) {
  return argv.includes("--dry-run");
}

export async function main() {
  const config = await resolveDevConfig();

  console.log(formatDevPortSummary(config));
  console.log("");

  if (shouldDryRun()) {
    return;
  }

  await startDevProcesses(config);
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
