import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findWorkspaceRoot(startDir = process.cwd()) {
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

export function getRootEnvFilePath(startDir = process.cwd()) {
  return join(findWorkspaceRoot(startDir), ".env");
}
