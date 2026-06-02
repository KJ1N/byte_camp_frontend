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
