import { readFileSync } from "node:fs";
import path from "node:path";

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function loadRootEnv(rootDir, processEnv = process.env) {
  const envPath = path.join(rootDir, ".env");
  let fileEnv = {};

  try {
    const content = readFileSync(envPath, "utf8");
    fileEnv = Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const separatorIndex = line.indexOf("=");
          const key = line.slice(0, separatorIndex).trim();
          const value = stripQuotes(line.slice(separatorIndex + 1));
          return [key, value];
        })
        .filter(([key]) => key),
    );
  } catch {
    fileEnv = {};
  }

  return {
    ...fileEnv,
    ...processEnv,
  };
}
