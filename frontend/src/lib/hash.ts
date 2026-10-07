/**
 * 规范 §14.6 星图位置算法 —— 稳定策略：
 * 基于 personId hash 生成固定 seed，节点不会每次刷新大幅重排。
 */

/** FNV-1a, 32 bit. Stable across sessions for the same input string. */
export function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic PRNG so a node keeps its jitter between renders. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 0..1 jitter derived from an id plus a salt. */
export function seededUnit(id: string, salt = 0): number {
  const random = mulberry32(hashString(`${id}:${salt}`));
  return random();
}

/**
 * 规范 §14.6: 不同 group 使用预设极坐标方位。
 * Groups are spread evenly around the circle; `index` is the group's slot.
 */
export function groupAngle(groupIndex: number, groupCount: number): number {
  if (groupCount <= 0) return 0;
  return (groupIndex / groupCount) * Math.PI * 2 - Math.PI / 2;
}

/** Even polar placement for people without a group (or in the "全部" view). */
export function fallbackAngle(id: string): number {
  return seededUnit(id, 1) * Math.PI * 2;
}

/** 规范 §14.3: node visual radius 6–11px, derived from the user's own circle level. */
export function nodeRadius(circleLevel: string, interactionCount: number): number {
  const base: Record<string, number> = {
    core: 9.5,
    frequent: 8.5,
    normal: 7.25,
    occasional: 6.25,
  };
  const start = base[circleLevel] ?? 7;
  const bonus = Math.min(Math.log2(Math.max(interactionCount, 1) + 1) * 0.5, 1.5);
  return Math.min(start + bonus, 11);
}

/**
 * 规范 §14.3 / §56: 亮度 = 最近是否有新的记录。
 * Returns 0.35 (quiet) … 1 (recent).
 */
export function nodeBrightness(daysSinceLastRecord: number | null): number {
  if (daysSinceLastRecord === null) return 0.34;
  if (daysSinceLastRecord <= 7) return 1;
  if (daysSinceLastRecord <= 30) return 0.78;
  if (daysSinceLastRecord <= 90) return 0.58;
  if (daysSinceLastRecord <= 180) return 0.46;
  return 0.36;
}
