/**
 * 给一个实体（星系、人物）一个**稳定**的颜色。
 *
 * 同一个名字每次打开都得到同一个颜色 —— 用名字 hash 而不是随机，
 * 否则每次刷新都在换色，用户会觉得界面在闪。
 *
 * 色板刻意压得很低饱和：这些颜色会出现在色点、细边、小徽章上，
 * 不是大面积。大面积染色在这个深色界面里会发脏（试过）。
 */

/** 与语义色同一族，只是换了色相 —— 亮度保持一致，避免有的跳有的闷。 */
const PALETTE = [
  "#e6be74", // 金
  "#7cb7f5", // 蓝
  "#72d6a0", // 绿
  "#a78bfa", // 紫
  "#e98989", // 珊瑚
  "#6fd0d8", // 青
  "#c79ae0", // 藕
  "#9fb3c8", // 灰蓝
] as const;

/** 稳定的字符串 hash（FNV-1a 的简化版，够用且快）。 */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function entityColor(id: string | null | undefined): string {
  if (!id) return PALETTE[0];
  return PALETTE[hash(id) % PALETTE.length]!;
}
