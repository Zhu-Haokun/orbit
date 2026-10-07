import { create } from "zustand";

import { tokenStorage } from "@/lib/tokenStorage";
import { queryClient } from "@/lib/queryClient";
import { authService } from "@/services/auth";
import type { AuthSession, User } from "@/types";

export type SessionStatus = "loading" | "authenticated" | "anonymous";

/**
 * 规范 §6.4 Authentication + §66: token 存储封装，不写死 localStorage。
 * The store keeps only the session; every piece of business data lives in
 * TanStack Query (§75).
 */
interface SessionState {
  status: SessionStatus;
  user: User | null;
  signIn: (session: AuthSession) => void;
  setUser: (user: User) => void;
  signOut: () => void;
  hydrate: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: tokenStorage.get() ? "loading" : "anonymous",
  user: null,

  signIn: (session) => {
    tokenStorage.set(session.accessToken);
    set({ status: "authenticated", user: session.user });
  },

  setUser: (user) => set({ user }),

  signOut: () => {
    tokenStorage.clear();
    set({ status: "anonymous", user: null });
    queryClient.clear();
  },

  hydrate: async () => {
    if (!tokenStorage.get()) {
      set({ status: "anonymous", user: null });
      return;
    }
    try {
      const user = await authService.me();
      set({ status: "authenticated", user });
    } catch {
      tokenStorage.clear();
      set({ status: "anonymous", user: null });
    }
  },
}));

/** Convenience for non-React call sites (e.g. the API layer's 401 handling). */
export const sessionActions = {
  signOut: () => useSessionStore.getState().signOut(),
};
