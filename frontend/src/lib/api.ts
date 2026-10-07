import { tokenStorage } from "./tokenStorage";

/**
 * Thin fetch wrapper around the FastAPI backend.
 *
 * 规范 §40.2: 技术错误放 console，不直接展示给普通用户。
 * Every failure surfaces as an ApiError carrying a *user facing* message that
 * the UI can render directly.
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
const BASE = RAW_BASE.replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Skip Authorization even when a token exists. */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const url = new URL(`${BASE}${path}`, origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function messageForStatus(status: number, fallback: string): string {
  switch (status) {
    case 0:
      return "暂时连接不上 Orbit，请稍后再试。";
    case 401:
      return "登录状态已过期，请重新登录。";
    case 403:
      return "你没有访问这段记录的权限。";
    case 404:
      return "这段内容已经不在了。";
    case 409:
      return "这条记录和现有内容有冲突。";
    case 422:
      return fallback || "有些内容还需要调整一下。";
    case 413:
      return "文件太大了，换一张小一点的图片试试。";
    default:
      return fallback || "暂时没能完成这次操作，请稍后再试。";
  }
}

function extractDetail(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (payload && typeof payload === "object") {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: unknown };
      if (first && typeof first.msg === "string") return first.msg;
    }
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return null;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, anonymous } = options;
  const headers: Record<string, string> = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const token = tokenStorage.get();
  if (token && !anonymous) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    console.error("[orbit] network request failed", path, error);
    throw new ApiError(0, messageForStatus(0, ""), error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const detail = extractDetail(payload);
    if (response.status >= 500) {
      console.error("[orbit] server error", path, response.status, payload);
    }
    throw new ApiError(response.status, messageForStatus(response.status, detail ?? ""), payload);
  }

  return payload as T;
}

/** Binary download (规范 §36.2 Export CSV) — still goes through the auth layer. */
export async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = tokenStorage.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      signal: options.signal,
    });
  } catch (error) {
    console.error("[orbit] download failed", path, error);
    throw new ApiError(0, messageForStatus(0, ""), error);
  }

  if (!response.ok) {
    throw new ApiError(response.status, messageForStatus(response.status, ""), null);
  }
  return response.blob();
}

export async function upload<T>(path: string, file: File, signal?: AbortSignal): Promise<T> {
  const form = new FormData();
  form.append("file", file);

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = tokenStorage.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path), { method: "POST", headers, body: form, signal });
  } catch (error) {
    console.error("[orbit] upload failed", path, error);
    throw new ApiError(0, messageForStatus(0, ""), error);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, messageForStatus(response.status, extractDetail(payload) ?? ""), payload);
  }
  return payload as T;
}

/** Download a JSON payload as a file — used by 规范 §36.2 数据导出. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  del: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "DELETE" }),
};
