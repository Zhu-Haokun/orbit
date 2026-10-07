import { describe, expect, it } from "vitest";

import { draftFromParse, toCommitInput } from "@/features/record/ParseResult";
import type { ParseResult } from "@/types";

/**
 * 规范 §30: 保存前必须用户确认；只有勾选的内容会被提交。
 */

const PARSED: ParseResult = {
  parser: "rules",
  personCandidates: [{ id: "p-linxi", name: "林夕", confidence: 0.96 }],
  interaction: {
    title: "喝咖啡",
    content: "今天和林夕喝了咖啡。",
    interactionDate: "2026-10-05",
    location: null,
    interactionType: null,
  },
  updates: [{ content: "最近想开始学剪辑" }],
  commitments: [{ content: "把我收藏的教程发给她", dueDate: null, dueText: null }],
  importantDates: [
    {
      title: "短片比赛",
      date: "2026-11-05",
      dateText: "下个月",
      datePrecision: "month",
      repeatType: "none",
    },
  ],
  preferences: [{ category: "like", content: "胶片摄影" }],
  borrowRecords: [],
};

describe("record draft", () => {
  it("把解析结果转成可编辑草稿，默认全部勾选", () => {
    const draft = draftFromParse(PARSED, "今天和林夕喝了咖啡。", ["/uploads/a.png"]);

    expect(draft.personId).toBe("p-linxi");
    expect(draft.updates.every((row) => row.keep)).toBe(true);
    expect(draft.attachments).toEqual(["/uploads/a.png"]);
    expect(draft.importantDates[0]?.datePrecision).toBe("month");
  });

  it("只提交用户保留的内容", () => {
    const draft = draftFromParse(PARSED, "今天和林夕喝了咖啡。", []);
    const trimmed = {
      ...draft,
      commitments: draft.commitments.map((row) => ({ ...row, keep: false })),
      importantDates: [],
    };

    const payload = toCommitInput(trimmed);

    expect(payload).not.toBeNull();
    expect(payload?.interaction.personId).toBe("p-linxi");
    expect(payload?.interaction.source).toBe("ai_parsed");
    expect(payload?.updates).toEqual([{ content: "最近想开始学剪辑" }]);
    expect(payload?.commitments).toEqual([]);
    expect(payload?.importantDates).toEqual([]);
    expect(payload?.preferences).toEqual([{ category: "like", content: "胶片摄影" }]);
  });

  it("没有选择人物时拒绝生成保存载荷", () => {
    const draft = draftFromParse(PARSED, "今天和林夕喝了咖啡。", []);
    expect(toCommitInput({ ...draft, personId: null })).toBeNull();
  });

  it("标题被清空时回退为一句通用描述", () => {
    const draft = draftFromParse(PARSED, "今天和林夕喝了咖啡。", []);
    const payload = toCommitInput({ ...draft, title: "   " });
    expect(payload?.interaction.title).toBe("记录一次互动");
  });
});
