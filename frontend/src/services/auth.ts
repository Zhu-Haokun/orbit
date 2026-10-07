import { api } from "@/lib/api";
import type { AuthSession, LoginInput, RegisterInput, User } from "@/types";

/** 规范 §6.4 / §45 Auth */
export const authService = {
  register: (input: RegisterInput) => api.post<AuthSession>("/auth/register", input, { anonymous: true }),

  login: (input: LoginInput) => api.post<AuthSession>("/auth/login", input, { anonymous: true }),

  /** 规范 §38: 体验 Demo —— seeded demo account, no credentials needed. */
  demo: () => api.post<AuthSession>("/auth/demo", undefined, { anonymous: true }),

  me: (signal?: AbortSignal) => api.get<User>("/auth/me", { signal }),

  logout: () => api.post<void>("/auth/logout"),

  /** 规范 §36.3 删除账户，需要二次确认（由 UI 负责）。 */
  deleteAccount: () => api.del<void>("/auth/account"),
};
