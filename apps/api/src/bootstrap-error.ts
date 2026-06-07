type NodeListenError = {
  code?: string;
  port?: number;
};

function getPortText(error: NodeListenError) {
  return typeof error.port === "number" ? String(error.port) : "configured";
}

function isNodeListenError(error: unknown): error is NodeListenError {
  return typeof error === "object" && error !== null && "code" in error;
}

export function getApiBootstrapFailureMessage(error: unknown) {
  if (!isNodeListenError(error)) {
    return "API bootstrap failed";
  }

  if (error.code === "EADDRINUSE") {
    return [
      `API port ${getPortText(error)} is already in use.`,
      "Stop the existing API process, or set PORT to another free port.",
      "For full-stack local development, run corepack pnpm dev so Web and API ports stay paired.",
    ].join(" ");
  }

  if (error.code === "EACCES") {
    return [
      `API port ${getPortText(error)} cannot be opened by this process.`,
      "Set PORT to another free port, or run the root dev script so it can pick one automatically.",
    ].join(" ");
  }

  return "API bootstrap failed";
}

export function shouldLogApiBootstrapErrorDetails(error: unknown) {
  if (!isNodeListenError(error)) {
    return true;
  }

  return error.code !== "EADDRINUSE" && error.code !== "EACCES";
}
