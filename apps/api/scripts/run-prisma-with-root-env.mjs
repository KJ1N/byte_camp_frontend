import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = findWorkspaceRoot(scriptDir);
const rootEnvPath = join(workspaceRoot, ".env");

loadEnvFile(rootEnvPath);

const prismaBin = resolve(
  scriptDir,
  "../node_modules/prisma/build/index.js",
);
const result = spawnSync(process.execPath, [prismaBin, ...process.argv.slice(2)], {
  cwd: resolve(scriptDir, ".."),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function findWorkspaceRoot(startDir) {
  let current = resolve(startDir);

  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(startDir);
    }

    current = parent;
  }
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (!parsed || process.env[parsed.key] !== undefined) {
      continue;
    }

    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  const rawValue = trimmed.slice(separatorIndex + 1).trim();
  return { key, value: unquoteEnvValue(rawValue) };
}

function unquoteEnvValue(value) {
  if (value.length < 2) {
    return value;
  }

  const quote = value[0];
  const last = value[value.length - 1];

  if ((quote === "\"" || quote === "'") && last === quote) {
    return value.slice(1, -1);
  }

  return value;
}
