import { create } from "zustand";

/**
 * 背景氛围（产品文档「背景层次与主题自定义」）。
 *
 * 刻意只提供少数几个经过可读性验证的预设，不做"任意图片铺满整个应用"：
 * 图片的亮暗与配色不可控，会直接破坏正文可读性，也会给私人内容
 * 增加存储、备份与隐私边界。氛围只改色温与材质，不改结构、不带动画。
 */
export type BackgroundTone = "orbit" | "ink" | "mist";

export interface BackgroundOption {
  value: BackgroundTone;
  label: string;
  /** 一句话说明这个氛围适合什么场景。 */
  hint: string;
  /** 预览缩略图的底色（和实际 token 保持一致）。 */
  swatch: string;
  /** 预览里那条"内容表面"的颜色。 */
  surface: string;
  /** 预览里环境光的色相。 */
  glow: string;
}

export const BACKGROUND_OPTIONS: readonly BackgroundOption[] = [
  {
    value: "orbit",
    label: "深夜轨道",
    hint: "近黑底色、冷灰表面。默认，适合长时间使用。",
    swatch: "#0b0e14",
    surface: "#141822",
    glow: "rgba(139,140,255,0.18)",
  },
  {
    value: "ink",
    label: "墨纸",
    hint: "黑色里掺一点暖灰，像夜间相册。适合翻回忆。",
    swatch: "#121114",
    surface: "#1d1a20",
    glow: "rgba(214,186,150,0.20)",
  },
  {
    value: "mist",
    label: "雾蓝",
    hint: "极低饱和的蓝灰远景。适合读长文和人物档案。",
    swatch: "#0a0f18",
    surface: "#131a26",
    glow: "rgba(120,170,220,0.20)",
  },
];

const STORAGE_KEY = "orbit.background";
const DEFAULT_TONE: BackgroundTone = "orbit";

function isTone(value: unknown): value is BackgroundTone {
  return BACKGROUND_OPTIONS.some((option) => option.value === value);
}

function readTone(): BackgroundTone {
  if (typeof window === "undefined") return DEFAULT_TONE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTone(stored) ? stored : DEFAULT_TONE;
  } catch {
    // 隐私模式下 localStorage 可能直接抛错。
    return DEFAULT_TONE;
  }
}

function writeTone(tone: BackgroundTone): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, tone);
  } catch {
    /* 存不了不影响这次切换 */
  }
}

interface BackgroundState {
  tone: BackgroundTone;
  setTone: (tone: BackgroundTone) => void;
  reset: () => void;
}

export const useBackgroundStore = create<BackgroundState>((set) => ({
  tone: readTone(),
  setTone: (tone) => {
    writeTone(tone);
    set({ tone });
  },
  reset: () => {
    writeTone(DEFAULT_TONE);
    set({ tone: DEFAULT_TONE });
  },
}));

/**
 * 把当前氛围写到 `<html data-background>` 上。
 * CSS 用属性选择器换 token，所以切换不触发整页重载、也不重新请求任何东西。
 */
export function applyBackgroundTone(tone: BackgroundTone): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.background = tone;
}
