import { create } from "zustand";

/**
 * 图片放大查看。
 *
 * 页面里的图片（时间轴、回忆、解析结果…）都只是缩略图，
 * 点开需要一个能看清原图的地方。这里只存"当前在看哪几张、第几张"，
 * 真正的浮层由 AppShell 里的 <ImageLightbox /> 统一渲染一次。
 */
interface LightboxState {
  images: string[];
  index: number;
  open: (images: string[], index?: number) => void;
  close: () => void;
  step: (delta: number) => void;
}

export const useLightboxStore = create<LightboxState>((set, get) => ({
  images: [],
  index: 0,

  open: (images, index = 0) => {
    const list = images.filter(Boolean);
    if (list.length === 0) return;
    set({ images: list, index: Math.max(0, Math.min(index, list.length - 1)) });
  },

  close: () => set({ images: [], index: 0 }),

  step: (delta) => {
    const { images, index } = get();
    if (images.length < 2) return;
    set({ index: (index + delta + images.length) % images.length });
  },
}));

/** 非组件环境下的快捷入口。 */
export const lightbox = {
  open: (images: string[], index = 0) => useLightboxStore.getState().open(images, index),
};
