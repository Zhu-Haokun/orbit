import { describe, expect, it } from "vitest";

import {
  formatImportantDate,
  formatMonthDay,
  formatTimelineDate,
  initialOf,
  metDurationLabel,
  relativeDayLabel,
} from "@/lib/format";

/** 规范 §24 / §27 / §17 / §21.1 的展示规则。 */

describe("format helpers", () => {
  it("时间轴日期带完整年月日 —— 同一个人的记录可能横跨好几年", () => {
    expect(formatTimelineDate("2026-09-21T12:00:00Z")).toBe("2026.9.21");
    // 只给月日的话，2024 和 2026 的同一格看起来一模一样。
    expect(formatTimelineDate("2024-09-21T12:00:00Z")).toBe("2024.9.21");
  });

  it("按 §33.3 渲染中文月日", () => {
    expect(formatMonthDay("2026-10-05T12:00:00Z")).toBe("10 月 5 日");
  });

  it("按 §24 区分精确日期与模糊日期", () => {
    expect(formatImportantDate("2026-11-12T12:00:00Z", "exact")).toBe("11 月 12 日");
    expect(formatImportantDate("2026-11-01T12:00:00Z", "month")).toBe("11 月");
    expect(formatImportantDate(null, "season", "大概在秋天")).toBe("大概在秋天");
    expect(formatImportantDate(null, "text", "寒假")).toBe("寒假");
  });

  it("按 §17 渲染相对时间", () => {
    const from = new Date("2026-10-05T00:00:00");
    expect(relativeDayLabel("2026-10-05T12:00:00Z", from)).toBe("今天");
    expect(relativeDayLabel("2026-10-04T12:00:00Z", from)).toBe("昨天");
    expect(relativeDayLabel("2026-09-27T12:00:00Z", from)).toBe("8 天前");
  });

  it("按 §21.1 渲染认识天数", () => {
    const from = new Date("2026-10-05T00:00:00");
    expect(metDurationLabel("2025-01-18T12:00:00Z", from)).toBe("认识 625 天");
    expect(metDurationLabel(null, from)).toBeNull();
  });

  it("按 §82 取姓名首字", () => {
    expect(initialOf("林夕")).toBe("林");
    expect(initialOf("Ada")).toBe("A");
    expect(initialOf("")).toBe("?");
  });
});
