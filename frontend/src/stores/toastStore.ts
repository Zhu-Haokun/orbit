import { create } from "zustand";

/**
 * 规范 §39.6 Toast
 * 用于：保存成功 / 已完成 / 删除成功 / 导出完成 —— 不显示超过 4 秒。
 */

export interface ToastItem {
  id: string;
  message: string;
  tone: "neutral" | "success" | "danger";
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, tone?: ToastItem["tone"]) => void;
  dismiss: (id: string) => void;
}

const TOAST_TTL = 3200;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = "neutral") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set({ toasts: [...get().toasts, { id, message, tone }].slice(-3) });
    setTimeout(() => get().dismiss(id), TOAST_TTL);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

/** Convenience helper usable outside React components. */
export const toast = {
  show: (message: string, tone: ToastItem["tone"] = "neutral") =>
    useToastStore.getState().push(message, tone),
  success: (message: string) => useToastStore.getState().push(message, "success"),
  error: (message: string) => useToastStore.getState().push(message, "danger"),
};
