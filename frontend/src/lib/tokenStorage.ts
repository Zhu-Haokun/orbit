/**
 * 规范 §66: Auth/token 存储封装，不写死 localStorage。
 *
 * Everything that touches persistence goes through this module so the storage
 * backend can be swapped for Capacitor Preferences / SecureStorage without
 * touching a single component.
 */

const TOKEN_KEY = "orbit.auth.token";

export interface TokenStorage {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

function createWebStorage(): TokenStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    const probe = "orbit.storage.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return {
      get: () => window.localStorage.getItem(TOKEN_KEY),
      set: (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
      clear: () => window.localStorage.removeItem(TOKEN_KEY),
    };
  } catch {
    // Private mode / storage disabled — fall back to memory.
    return null;
  }
}

function createMemoryStorage(): TokenStorage {
  let value: string | null = null;
  return {
    get: () => value,
    set: (token: string) => {
      value = token;
    },
    clear: () => {
      value = null;
    },
  };
}

export const tokenStorage: TokenStorage = createWebStorage() ?? createMemoryStorage();
