import { describe, expect, it } from "vitest";

import {
  STAR_TONES,
  daysSinceLastInteraction,
  starTone,
  starToneFromLastInteraction,
  starToneGlowId,
} from "@/lib/starTone";

const NOW = new Date("2026-10-11T12:00:00Z");

/** 造一个「NOW 之前 n 天」的 ISO 串。 */
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

describe("daysSinceLastInteraction", () => {
  it("没有记录过时返回 null", () => {
    expect(daysSinceLastInteraction(null, NOW)).toBeNull();
    expect(daysSinceLastInteraction(undefined, NOW)).toBeNull();
    expect(daysSinceLastInteraction("", NOW)).toBeNull();
  });

  it("无法解析的时间串返回 null，而不是抛错", () => {
    expect(daysSinceLastInteraction("不是时间", NOW)).toBeNull();
  });

  it("今天记录过是 0 天", () => {
    expect(daysSinceLastInteraction(daysAgo(0), NOW)).toBe(0);
  });

  it("按整天数取整", () => {
    expect(daysSinceLastInteraction(daysAgo(1), NOW)).toBe(1);
    expect(daysSinceLastInteraction(daysAgo(30), NOW)).toBe(30);
  });

  it("未来时间按今天处理，不出现负数", () => {
    const future = new Date(NOW.getTime() + 86_400_000).toISOString();
    expect(daysSinceLastInteraction(future, NOW)).toBe(0);
  });
});

describe("starTone", () => {
  it("没有记录过的按最暗一档", () => {
    expect(starTone(null).key).toBe("cold");
    expect(starTone(undefined).key).toBe("cold");
  });

  it("分档边界都落在正确的一侧", () => {
    // 阈值当天算「还没有跨过去」
    expect(starTone(14).key).toBe("warm");
    expect(starTone(15).key).toBe("neutral");
    expect(starTone(45).key).toBe("neutral");
    expect(starTone(46).key).toBe("cool");
    expect(starTone(180).key).toBe("cool");
    expect(starTone(181).key).toBe("faded");
    expect(starTone(365).key).toBe("faded");
    expect(starTone(366).key).toBe("cold");
  });

  it("越久没联系，柔光越弱", () => {
    const scales = [
      STAR_TONES.warm,
      STAR_TONES.neutral,
      STAR_TONES.cool,
      STAR_TONES.faded,
      STAR_TONES.cold,
    ].map((tone) => tone.glowScale);
    const sorted = [...scales].sort((a, b) => b - a);
    expect(scales).toEqual(sorted);
    // 衰减要温和：最暗的一档也不能低到看不见。
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.6);
  });

  it("每档的星核颜色都不一样", () => {
    const cores = Object.values(STAR_TONES).map((tone) => tone.core);
    expect(new Set(cores).size).toBe(cores.length);
  });
});

describe("starToneFromLastInteraction", () => {
  it("从时间串直接得到色阶", () => {
    expect(starToneFromLastInteraction(daysAgo(3), NOW).key).toBe("warm");
    expect(starToneFromLastInteraction(daysAgo(400), NOW).key).toBe("cold");
    expect(starToneFromLastInteraction(null, NOW).key).toBe("cold");
  });
});

describe("starToneGlowId", () => {
  it("每档的渐变 id 唯一且带前缀", () => {
    const ids = Object.values(STAR_TONES).map(starToneGlowId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("orbit-star-tone-")).toBe(true);
  });
});
