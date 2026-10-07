import { describe, expect, it } from "vitest";

import { mockParse } from "@/lib/mockParser";
import { makePerson } from "@/test/fixtures";

/**
 * 规范 §32 无 AI 环境降级 + §45 / §70 的解析验收示例。
 * 这些断言就是演示脚本第 8–9 步必须成立的部分。
 */

const PEOPLE = [
  makePerson({ id: "p-linxi", name: "林夕", relationshipLabel: "大学朋友" }),
  makePerson({ id: "p-chenyu", name: "陈屿", nickname: "老陈", relationshipLabel: "学长" }),
  makePerson({ id: "p-jie", name: "阿杰", relationshipLabel: "高中朋友" }),
];

describe("mockParse", () => {
  it("满足 §45 的请求示例", () => {
    const result = mockParse({
      text: "今天跟老陈喝咖啡，他说下个月准备去杭州工作，我答应把租房网站发给他。",
      selectedPersonId: null,
      referenceDate: "2026-10-05",
      people: PEOPLE,
    });

    expect(result.personCandidates[0]?.id).toBe("p-chenyu");
    expect(result.personCandidates[0]?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.interaction.title).toBe("喝咖啡");
    expect(result.interaction.interactionDate).toBe("2026-10-05");
    expect(result.updates.map((item) => item.content)).toEqual(["下个月准备去杭州工作"]);
    expect(result.commitments.map((item) => item.content)).toEqual(["把租房网站发给他"]);
    expect(result.importantDates).toEqual([]);
  });

  it("满足 §70 演示脚本第 8 步的输入", () => {
    const result = mockParse({
      text: "今天和林夕喝了咖啡，她说最近想开始学剪辑，下个月准备参加一个短片比赛，我答应把我收藏的教程发给她。",
      selectedPersonId: null,
      referenceDate: "2026-10-05",
      people: PEOPLE,
    });

    // 人物：林夕
    expect(result.personCandidates[0]?.id).toBe("p-linxi");
    // 互动：喝咖啡
    expect(result.interaction.title).toBe("喝咖啡");
    // 近况：最近想学剪辑
    expect(result.updates.map((item) => item.content)).toEqual(["最近想开始学剪辑"]);
    // 重要事项：下个月短片比赛
    expect(result.importantDates).toHaveLength(1);
    expect(result.importantDates[0]?.title).toBe("短片比赛");
    expect(result.importantDates[0]?.datePrecision).toBe("month");
    expect(result.importantDates[0]?.dateText).toBe("下个月");
    // 未完待续：把教程发给她
    expect(result.commitments.map((item) => item.content)).toEqual(["把我收藏的教程发给她"]);
  });

  it("已选择人物时优先使用该人物", () => {
    const result = mockParse({
      text: "今天一起吃了火锅。",
      selectedPersonId: "p-jie",
      referenceDate: "2026-10-05",
      people: PEOPLE,
    });

    expect(result.personCandidates[0]).toEqual({ id: "p-jie", name: "阿杰", confidence: 1 });
    expect(result.interaction.title).toBe("一起吃火锅");
  });

  it("识别生日为每年重复的重要日期", () => {
    const result = mockParse({
      text: "11 月 12 日是林夕的生日。",
      selectedPersonId: null,
      referenceDate: "2026-10-05",
      people: PEOPLE,
    });

    expect(result.importantDates[0]?.repeatType).toBe("yearly");
    expect(result.importantDates[0]?.datePrecision).toBe("exact");
  });

  it("没有识别到人物时仍然给出可用的互动标题", () => {
    const result = mockParse({
      text: "今天在图书馆待了一下午。",
      selectedPersonId: null,
      referenceDate: "2026-10-05",
      people: PEOPLE,
    });

    expect(result.personCandidates).toHaveLength(0);
    expect(result.interaction.title.length).toBeGreaterThan(0);
    expect(result.interaction.content).toBe("今天在图书馆待了一下午。");
  });
});
