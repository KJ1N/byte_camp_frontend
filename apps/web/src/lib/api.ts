export function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
}

export interface ApiFetchInit extends RequestInit {
  authToken?: string | null;
}

export async function apiFetch(path: string, init?: ApiFetchInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init?.authToken) {
    headers.set("Authorization", `Bearer ${init.authToken}`);
  }

  const { authToken: _authToken, ...requestInit } = init ?? {};

  return fetch(`${apiBaseUrl()}${path}`, {
    ...requestInit,
    headers,
  });
}

export async function readApiJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export function getApiErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join("；");
    if (message) return message;
  }

  return fallback;
}
