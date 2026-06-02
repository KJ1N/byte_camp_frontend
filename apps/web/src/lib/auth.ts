export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

const TOKEN_KEY = "aigc_creator_token";
const USER_KEY = "aigc_creator_user";

function canUseStorage() {
  if (typeof window === "undefined") return false;

  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
}

export function saveAuthSession(session: AuthSession) {
  if (!canUseStorage()) return false;

  try {
    window.localStorage.setItem(TOKEN_KEY, session.accessToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    return true;
  } catch {
    return false;
  }
}

export function getStoredToken() {
  if (!canUseStorage()) return null;

  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
  } catch {
    // Ignore storage failures so logout UI can still proceed.
  }
}
