import { describe, expect, it } from "vitest";

import { computeGalaxyLayout, recencyFactor } from "@/features/galaxy/useGalaxyLayout";
import { makePerson } from "@/test/fixtures";
import type { Group, PersonSummary } from "@/types";

/**
 * 星图距离编码：
 * - 方向由星系决定；
 * - 距离由「上次联系有多久」决定，越久越靠外；
 * - 核心圈 = 特别关注，始终待在最近的一圈，不受时间影响。
 */

const GROUPS: Group[] = [
  { id: "g-dorm", name: "宿舍", icon: null, sortOrder: 0, personCount: 2 },
  { id: "g-photo", name: "摄影社", icon: null, sortOrder: 1, personCount: 2 },
  { id: "g-family", name: "家人", icon: null, sortOrder: 2, personCount: 2 },
];

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function person(
  name: string,
  groupId: string,
  circleLevel: PersonSummary["circleLevel"],
  days: number | null,
): PersonSummary {
  return makePerson({
    id: `p-${name}`,
    name,
    circleLevel,
    groups: [{ id: groupId, name: groupId, icon: null, sortOrder: 0 }],
    lastInteractionAt: days === null ? null : daysAgo(days),
  });
}

const PEOPLE: PersonSummary[] = [
  person("刚联系", "g-dorm", "normal", 0),
  person("三天前", "g-photo", "normal", 3),
  person("一个月", "g-family", "normal", 30),
  person("半年前", "g-dorm", "normal", 180),
  person("从没记录", "g-photo", "normal", null),
  // 核心圈：一个刚联系、一个很久没联系，两者都应该在最近的一圈
  person("特别关注A", "g-family", "core", 1),
  person("特别关注B", "g-dorm", "core", 200),
];

function distanceByName(): Record<string, number> {
  const { nodes } = computeGalaxyLayout({
    people: PEOPLE,
    groups: GROUPS,
    groupId: null,
    width: 1048,
    height: 720,
  });
  const cx = 1048 / 2;
  const cy = 720 / 2;
  return Object.fromEntries(
    nodes.map((node) => [node.person.name, Math.round(Math.hypot(node.x - cx, node.y - cy))]),
  );
}

describe("recencyFactor", () => {
  it("刚联系过接近 0，很久没联系接近 1", () => {
    const today = new Date();
    expect(recencyFactor(person("a", "g-dorm", "normal", 0), today)).toBeCloseTo(0, 2);
    expect(recencyFactor(person("b", "g-dorm", "normal", 180), today)).toBeCloseTo(1, 2);
    expect(recencyFactor(person("c", "g-dorm", "normal", null), today)).toBe(1);
  });

  it("对天数单调不减", () => {
    const today = new Date();
    const values = [0, 3, 15, 30, 90, 180, 365].map((d) =>
      recencyFactor(person("x", "g-dorm", "normal", d), today),
    );
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
    }
  });
});

describe("星图距离", () => {
  const distance = distanceByName();

  it("最近联系的人比很久没联系的人更靠内", () => {
    expect(distance["刚联系"]!).toBeLessThan(distance["半年前"]!);
    expect(distance["三天前"]!).toBeLessThan(distance["一个月"]!);
    expect(distance["一个月"]!).toBeLessThan(distance["从没记录"]!);
  });

  it("核心圈（特别关注）始终待在最近的一圈，不受上次联系时间影响", () => {
    const coreMax = Math.max(distance["特别关注A"]!, distance["特别关注B"]!);
    const coreMin = Math.min(distance["特别关注A"]!, distance["特别关注B"]!);
    // 核心圈两个人差了 199 天，但距离不应该被时间拉开。
    expect(coreMax - coreMin).toBeLessThan(60);
    // 而且要比"半年前"和"从没记录"的人更靠内。
    expect(coreMax).toBeLessThan(distance["半年前"]!);
    expect(coreMax).toBeLessThan(distance["从没记录"]!);
  });
});

/* ------------------------------------------------------------------ *
 * 用 Demo 的真实规模（14 人 / 5 星系）再验一次：
 * 7 个人的时候一切正常，14 个人的时候核心圈会被挤出去 —— 这里把它钉住。
 * ------------------------------------------------------------------ */

const DEMO_GROUPS: Group[] = ["宿舍", "摄影社", "实验室", "高中", "家人"].map((name, index) => ({
  id: `g-${index}`,
  name,
  icon: null,
  sortOrder: index,
  personCount: 0,
}));

/** [姓名, 星系下标（-1 = 无）, 圈层, 上次联系天数] */
const DEMO_ROWS: Array<[string, number, PersonSummary["circleLevel"], number | null]> = [
  ["李楠", 1, "frequent", 6],
  ["妈妈", 4, "core", 3],
  ["小鹿", 0, "core", 4],
  ["陈屿", 2, "frequent", 2],
  ["唐昕", 1, "normal", 3],
  ["林夕", 1, "frequent", 15],
  ["爸爸", 4, "core", 127],
  ["宋言", 2, "normal", 0],
  ["周航", 0, "frequent", 8],
  ["阿杰", 3, "core", 199],
  ["许老师", 2, "normal", 10],
  ["江辰", 1, "normal", 30],
  ["郑可", -1, "normal", 90],
  ["苏晴", 3, "occasional", 366],
];

const DEMO_PEOPLE: PersonSummary[] = DEMO_ROWS.map(([name, groupIndex, circle, days]) =>
  makePerson({
    id: `p-${name}`,
    name,
    circleLevel: circle,
    groups:
      groupIndex < 0
        ? []
        : [
            {
              id: DEMO_GROUPS[groupIndex]!.id,
              name: DEMO_GROUPS[groupIndex]!.name,
              icon: null,
              sortOrder: groupIndex,
            },
          ],
    lastInteractionAt: days === null ? null : daysAgo(days),
  }),
);

function demoDistances(): Record<string, number> {
  const { nodes } = computeGalaxyLayout({
    people: DEMO_PEOPLE,
    groups: DEMO_GROUPS,
    groupId: null,
    width: 1048,
    height: 720,
  });
  const at = (x: number, y: number) => Math.round(Math.hypot(x - 524, y - 360));
  return Object.fromEntries(nodes.map((node) => [node.person.name, at(node.x, node.y)]));
}

describe("星图距离（Demo 真实规模）", () => {
  const distance = demoDistances();

  it("核心圈全部落在最内圈，不被时间拉开", () => {
    const core = DEMO_ROWS.filter(([, , circle]) => circle === "core").map(([name]) => name);
    const others = DEMO_ROWS.filter(([, , circle]) => circle !== "core").map(([name]) => name);

    const coreDistances = core.map((name) => distance[name]!);
    const furthestCore = Math.max(...coreDistances);
    const nearestOther = Math.min(...others.map((name) => distance[name]!));

    // 核心圈的人必须整体内于其他所有人 —— 这正是"特别关注"的含义。
    expect(furthestCore).toBeLessThan(nearestOther);
  });

  it("越久没联系越靠外", () => {
    expect(distance["宋言"]!).toBeLessThan(distance["江辰"]!);
    expect(distance["江辰"]!).toBeLessThan(distance["郑可"]!);
    expect(distance["郑可"]!).toBeLessThan(distance["苏晴"]!);
  });
});
