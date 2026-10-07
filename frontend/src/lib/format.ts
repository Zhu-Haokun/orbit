import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";

/**
 * 规范 §53: 文案语气温和、简洁、不命令。
 * 规范 §59: 前端展示使用用户本地时区，内部 API 使用 ISO 8601。
 *
 * Every date helper in the app funnels through here so tone and timezone
 * handling stay consistent.
 */

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = value.length <= 10 ? parseISO(`${value}T00:00:00`) : parseISO(value);
  return isValid(date) ? date : null;
}

/** `yyyy-MM-dd` in the user's local timezone — the shape `<input type="date">` wants. */
export function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** “10 月 5 日” —— 规范 §33.1 */
export function formatMonthDay(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/** “2026 年 10 月 5 日” */
export function formatFullDate(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/**
 * 时间轴左列的日期，例如 “2026.7.21”。
 *
 * 用完整的年月日而不是 “09.21”：同一个人的记录可能横跨好几年，
 * 只给月日的话，2024 和 2026 的同一格看起来一模一样。
 */
export function formatTimelineDate(value: string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "";
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}

/** “2026.7.21” —— 用在需要一眼看清是哪一天的摘要里。 */
export function formatYearMonthDay(value: string | null | undefined): string {
  return formatTimelineDate(value);
}

/**
 * 月份章节标题，例如 “2026.7”。
 *
 * 用点号而不是 “2026 / JUL”：竖排一列月份时更紧凑，也更好扫读；
 * 月份不补零（7 而不是 07），中英文混排下更接近日常写法。
 */
export function formatMemoryMonth(year: number, month: number): string {
  return `${year}.${month}`;
}

/** “星期一” —— 规范 §33.1 */
export function formatWeekday(value: string | Date | null | undefined): string {
  const date = typeof value === "string" ? parseDate(value) : value;
  if (!date) return "";
  return WEEKDAYS[date.getDay()] ?? "";
}

export function daysSince(value: string | null | undefined, from: Date = new Date()): number | null {
  const date = parseDate(value);
  if (!date) return null;
  return differenceInCalendarDays(from, date);
}

/** “今天 / 昨天 / 前天 / 8 天前 / 3 个月前” —— 规范 §17 最近互动 */
export function relativeDayLabel(value: string | null | undefined, from: Date = new Date()): string {
  const days = daysSince(value, from);
  if (days === null) return "";
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days === 2) return "前天";
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

/** 规范 §21.1: “认识 624 天” */
export function metDurationLabel(metAt: string | null | undefined, from: Date = new Date()): string | null {
  const days = daysSince(metAt, from);
  if (days === null) return null;
  if (days <= 0) return "刚刚认识";
  return `认识 ${days} 天`;
}

/**
 * 规范 §24 / §59: 重要日期支持精确日期与模糊日期。
 */
export function formatImportantDate(
  date: string | null | undefined,
  precision: "exact" | "month" | "season" | "text",
  dateText?: string | null,
): string {
  if (precision === "text" || precision === "season") {
    return dateText ?? "还没有具体日期";
  }
  const parsed = parseDate(date);
  if (!parsed) {
    return dateText ?? "还没有具体日期";
  }
  if (precision === "month") {
    return `${parsed.getMonth() + 1} 月`;
  }
  return `${parsed.getMonth() + 1} 月 ${parsed.getDate()} 日`;
}

/** 规范 §33.2 / §33.3: “今天” / “还有 3 天” / “已经过去”. */
export function dueDayLabel(inDays: number): string {
  if (inDays === 0) return "今天";
  if (inDays === 1) return "明天";
  if (inDays > 1) return `还有 ${inDays} 天`;
  if (inDays === -1) return "昨天";
  return `${Math.abs(inDays)} 天前`;
}

/**
 * 滚动的周年日期：生日等 `yearly` 事件在当年或下一年重新出现。
 * 规范 §24 允许精确日期与模糊日期，month 精度取当月 1 日参与比较。
 */
export function nextOccurrence(dateKey: string, yearly: boolean, from: Date = new Date()): Date | null {
  const date = parseDate(dateKey);
  if (!date) return null;
  if (!yearly) return date;

  const candidate = new Date(from.getFullYear(), date.getMonth(), date.getDate());
  if (differenceInCalendarDays(candidate, from) < 0) {
    return new Date(from.getFullYear() + 1, date.getMonth(), date.getDate());
  }
  return candidate;
}

/** 首字头像 —— 规范 §82: 使用姓名首字 / 中文首字，背景 bg-soft。 */
export function initialOf(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  return Array.from(trimmed)[0] ?? "?";
}

/** Trim a long memory line for dense surfaces such as the hover card. */
export function truncate(text: string, max = 42): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}
