/**
 * 规范 §66: 存储封装，不写死 localStorage。
 * UI preferences (theme, layout choices) live here, separate from the auth token.
 */

function safeRead<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw && (allowed as readonly string[]).includes(raw)) {
      return raw as T;
    }
  } catch {
    /* storage unavailable */
  }
  return fallback;
}

function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export const THEME_KEY = "orbit.ui.theme";
export const THEME_OPTIONS = ["dark", "system"] as const;
export type ThemePreference = (typeof THEME_OPTIONS)[number];

export function readThemePreference(): ThemePreference {
  return safeRead(THEME_KEY, THEME_OPTIONS, "dark");
}

export function writeThemePreference(value: ThemePreference): void {
  safeWrite(THEME_KEY, value);
}
