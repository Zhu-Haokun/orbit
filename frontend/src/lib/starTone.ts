/**
 * 星等色阶 —— 让星星有温度。
 *
 * ## 为什么需要这个
 *
 * Orbit 的情感力量不在「今天要做什么」，而在「有个人你快要忘记了」。
 * 但那份力量得先**被看见**：在此之前所有星星都是同一个颜色（`fill-ink`），
 * 用户扫一眼星图读不出任何信息，只觉得「一片好看的黑」。
 *
 * 这里按「多久没联系」给星核和柔光上色：
 *
 * ```
 * 两周内     暖金    —— 常来往
 * 一个半月   暖白    —— 正常
 * 半年       中性蓝  —— 有点久了
 * 一年       冷蓝    —— 很久没联系
 * 更久/从未  暗紫    —— 快要淡出
 * ```
 *
 * 于是一眼就能看出谁在变暗 —— 这是别的软件抄不走的东西，
 * 因为它们没有「互动记录」这份数据。
 *
 * 色阶只描述**状态**，不做评判：没有「冷漠」「疏远」这类字眼，
 * 也没有任何催促。用户看到暗星该有什么感觉，由他自己决定。
 */

export type StarToneKey = "warm" | "neutral" | "cool" | "faded" | "cold";

export interface StarTone {
  key: StarToneKey;
  /** 星核颜色。 */
  core: string;
  /**
   * 柔光强度的倍率（1 = 不额外衰减）。
   *
   * 暗星的光也弱一点，否则"暗紫却刺眼"很怪。但**不能压太多** ——
   * 快要淡出的人反而更需要被看见，压到看不见就失去意义了。
   * 所以只从 1 降到 0.7，是"柔一点"，不是"藏起来"。
   */
  glowScale: number;
  /** 给界面用的人话说明。 */
  label: string;
}

/** 分档阈值，单位天。 */
export const STAR_TONE_THRESHOLDS = {
  warm: 14,
  neutral: 45,
  cool: 180,
  faded: 365,
} as const;

export const STAR_TONES: Record<StarToneKey, StarTone> = {
  warm: { key: "warm", core: "#ffd9a0", glowScale: 1, label: "常来往" },
  neutral: { key: "neutral", core: "#f2e7d8", glowScale: 0.94, label: "正常来往" },
  cool: { key: "cool", core: "#bcc8e4", glowScale: 0.86, label: "有点久了" },
  faded: { key: "faded", core: "#7fb3ff", glowScale: 0.78, label: "很久没联系" },
  cold: { key: "cold", core: "#6b6f9e", glowScale: 0.7, label: "快要淡出" },
};

/** 柔光渐变 id 前缀。`GalaxyCanvas` 的 `<defs>` 按同一规则生成。 */
export const STAR_TONE_GLOW_PREFIX = "orbit-star-tone";

/** 柔光渐变的完整 id。 */
export function starToneGlowId(tone: StarTone): string {
  return `${STAR_TONE_GLOW_PREFIX}-${tone.key}`;
}

/**
 * 距离上次互动过了多少天。
 *
 * 在**前端**算而不是读后端的 `daysSince`：星图每次渲染都要用，
 * 前端算可以顺带处理时区，也不用依赖后端在 `PersonSummary` 里带上这个字段。
 *
 * @returns 天数（0 表示今天）；没有记录过、或时间串无法解析时返回 `null`。
 */
export function daysSinceLastInteraction(
  iso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const diff = now.getTime() - then.getTime();
  // 未来时间（时钟不同步、或用户手填）按「今天」处理，不要出现负数。
  if (diff <= 0) return 0;
  return Math.floor(diff / 86_400_000);
}

/** 按「多久没联系」挑色阶。没有记录过的按最暗一档。 */
export function starTone(daysSince: number | null | undefined): StarTone {
  if (daysSince === null || daysSince === undefined || Number.isNaN(daysSince)) {
    return STAR_TONES.cold;
  }
  if (daysSince <= STAR_TONE_THRESHOLDS.warm) return STAR_TONES.warm;
  if (daysSince <= STAR_TONE_THRESHOLDS.neutral) return STAR_TONES.neutral;
  if (daysSince <= STAR_TONE_THRESHOLDS.cool) return STAR_TONES.cool;
  if (daysSince <= STAR_TONE_THRESHOLDS.faded) return STAR_TONES.faded;
  return STAR_TONES.cold;
}

/** 从最近互动时间一步到位拿到色阶。 */
export function starToneFromLastInteraction(
  iso: string | null | undefined,
  now: Date = new Date(),
): StarTone {
  return starTone(daysSinceLastInteraction(iso, now));
}
