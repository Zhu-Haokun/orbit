import { addDays, addMonths, addYears, format, isAfter, startOfDay } from "date-fns";

import type {
  DatePrecision,
  ParseResult,
  PersonSummary,
  PreferenceCategory,
  RepeatType,
} from "@/types";

/**
 * 规范 §32 无 AI 环境降级：前端提供 Mock Parser。
 * 简单规则识别：已选择人物 / 今天、明天、日期 / “我答应” / “借” / “生日”，
 * 并允许手动编辑（§30 保存前必须用户确认）。
 *
 * This mirrors `backend/app/ai/rules_parser.py` so the demo behaves the same
 * whether the request reaches the server or falls back locally (§31).
 */

const CLAUSE_SPLIT = /[，。；、！？,;!?\n]+/;

const VERB = "(参加|喝|吃|去|看|聊|打|玩|做|逛|拍|跑|开)";
const NOUN =
  "(视频通话|咖啡|火锅|烤肉|外卖|电影|展览|路演|答辩|比赛|组会|照片|外拍|游戏|旅行|散步|直播|演唱会|音乐节|生日|聚会|项目|会议|电话|球|饭|展)";
const ACTIVITY_RE = new RegExp(`${VERB}(?:了|过|着)?${NOUN}`);

const DATE_RE =
  /(今天|昨天|前天|明天|后天|大后天|下个?月|这个?月|本月|下个?周|这个?周|周末|明年|后年|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|\d{1,2}\s*月)/;

const EVENT_RE =
  /(比赛|考试|答辩|面试|婚礼|演出|路演|生日|入职|体检|会议|组会|活动|外拍|演出|开学|毕业|体检)/;

const COMMITMENT_RE = /(我答应|答应|承诺|记得|回头|下次要|要记得|会帮)/;
const UPDATE_RE = /(说|提到|告诉|最近|现在|目前|打算|准备|想|正在|开始)/;
const PREFERENCE_RE = /(最喜欢|不喜欢|喜欢|最爱|想要|想吃|讨厌)/;
const BORROW_RE = /借/;

function splitClauses(text: string): string[] {
  return text
    .split(CLAUSE_SPLIT)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function stripLead(clause: string): string {
  return clause
    .replace(/^(然后|后来|接着|顺便|另外|还有|今天|昨天|前天|明天|后天)\s*/, "")
    .replace(/^(他说|她说|他说到|她说起|他说起|他说|说|提到|告诉我|告诉我|聊到)\s*/, "")
    .replace(/^(我答应|答应|承诺|记得|回头|下次)\s*/, "")
    .trim();
}

interface ResolvedDate {
  date: string | null;
  dateText: string | null;
  precision: DatePrecision;
}

/** 相对日期基于 referenceDate 解析（规范 §46）。 */
function resolveDate(text: string, referenceDate: Date): ResolvedDate | null {
  const exact = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/.exec(text);
  if (exact) {
    const month = Number(exact[1]);
    const day = Number(exact[2]);
    let candidate = new Date(referenceDate.getFullYear(), month - 1, day);
    if (!isAfter(candidate, startOfDay(referenceDate))) {
      // 已经过去的日期按明年算（生日等周年事件）
      candidate = addYears(candidate, 1);
    }
    return { date: format(candidate, "yyyy-MM-dd"), dateText: exact[0], precision: "exact" };
  }

  const monthOnly = /(\d{1,2})\s*月/.exec(text);
  if (monthOnly) {
    const month = Number(monthOnly[1]);
    let candidate = new Date(referenceDate.getFullYear(), month - 1, 1);
    if (!isAfter(candidate, startOfDay(referenceDate))) {
      candidate = addYears(candidate, 1);
    }
    return { date: format(candidate, "yyyy-MM-dd"), dateText: monthOnly[0], precision: "month" };
  }

  const relative: Array<[RegExp, () => Date, DatePrecision]> = [
    [/今天/, () => referenceDate, "exact"],
    [/昨天/, () => addDays(referenceDate, -1), "exact"],
    [/前天/, () => addDays(referenceDate, -2), "exact"],
    [/大后天/, () => addDays(referenceDate, 3), "exact"],
    [/后天/, () => addDays(referenceDate, 2), "exact"],
    [/明天/, () => addDays(referenceDate, 1), "exact"],
    [/下个?月/, () => addMonths(referenceDate, 1), "month"],
    [/这个?月|本月/, () => referenceDate, "month"],
    [/下个?周|下周/, () => addDays(referenceDate, 7), "exact"],
    [/周末/, () => addDays(referenceDate, (6 - referenceDate.getDay() + 7) % 7 || 7), "exact"],
    [/明年/, () => addYears(referenceDate, 1), "month"],
  ];

  for (const [pattern, compute, precision] of relative) {
    if (pattern.test(text)) {
      const matched = pattern.exec(text)?.[0] ?? null;
      return { date: format(compute(), "yyyy-MM-dd"), dateText: matched, precision };
    }
  }
  return null;
}

function extractTitle(clause: string, personNames: string[]): string {
  const activity = ACTIVITY_RE.exec(clause);
  if (activity) {
    const base = `${activity[1]}${activity[2]}`;
    return clause.includes("一起") ? `一起${base}` : base;
  }

  let cleaned = clause;
  for (const name of personNames) {
    cleaned = cleaned.replaceAll(name, "");
  }
  cleaned = stripLead(cleaned)
    .replace(/^(和|跟|与|给|对)/, "")
    .replace(DATE_RE, "")
    .replace(/^(准备|打算|要|会|去|在|打算去)/, "")
    .replace(/^(参加|进行|举办)/, "")
    .replace(/^一个/, "")
    .trim();

  if (!cleaned) return "记录一次互动";
  return cleaned.length > 16 ? `${cleaned.slice(0, 16)}…` : cleaned;
}

function preferenceCategory(clause: string): PreferenceCategory | null {
  if (/不喜欢|讨厌/.test(clause)) return "dislike";
  if (/想吃|爱吃|口味/.test(clause)) return "food";
  if (/想要|想去|希望/.test(clause)) return "wish";
  if (/喜欢|最爱/.test(clause)) return "like";
  return null;
}

export interface MockParseInput {
  text: string;
  selectedPersonId: string | null;
  /** `yyyy-MM-dd` */
  referenceDate: string;
  people: PersonSummary[];
}

/**
 * 规则解析。返回结果一定可以被用户逐条勾选、编辑、删除（规范 §30）。
 */
export function mockParse({ text, selectedPersonId, referenceDate, people }: MockParseInput): ParseResult {
  const reference = startOfDay(new Date(`${referenceDate}T00:00:00`));
  const clauses = splitClauses(text);
  const known = people;

  /* --- 人物 --- */
  const candidates = new Map<string, { id: string | null; name: string; confidence: number }>();
  if (selectedPersonId) {
    const selected = known.find((person) => person.id === selectedPersonId);
    if (selected) {
      candidates.set(selected.id, { id: selected.id, name: selected.name, confidence: 1 });
    }
  }
  for (const person of known) {
    if (selectedPersonId && person.id === selectedPersonId) continue;
    if (person.name && text.includes(person.name)) {
      candidates.set(person.id, {
        id: person.id,
        name: person.name,
        confidence: Math.max(candidates.get(person.id)?.confidence ?? 0, 0.96),
      });
      continue;
    }
    if (person.nickname && text.includes(person.nickname)) {
      candidates.set(person.id, {
        id: person.id,
        name: person.nickname,
        confidence: Math.max(candidates.get(person.id)?.confidence ?? 0, 0.9),
      });
    }
  }
  const personCandidates = Array.from(candidates.values()).slice(0, 3);
  const personNames = personCandidates.map((candidate) => candidate.name);

  /* --- 日期 --- */
  const firstDate = clauses.map((clause) => resolveDate(clause, reference)).find(Boolean) ?? null;
  const today = resolveDate("今天", reference);
  const interactionDate = (firstDate ?? today)?.date ?? referenceDate;

  /* --- 逐句分类 --- */
  const updates: ParseResult["updates"] = [];
  const commitments: ParseResult["commitments"] = [];
  const importantDates: ParseResult["importantDates"] = [];
  const preferences: ParseResult["preferences"] = [];
  const borrowRecords: ParseResult["borrowRecords"] = [];

  for (const clause of clauses) {
    const resolved = resolveDate(clause, reference);

    if (COMMITMENT_RE.test(clause)) {
      const content = stripLead(clause);
      if (content) {
        commitments.push({
          content,
          dueDate: null,
          dueText: resolved?.dateText ?? null,
        });
        continue;
      }
    }

    if (EVENT_RE.test(clause) && resolved) {
      const title = extractTitle(clause, personNames);
      const yearly = /生日|纪念日/.test(clause);
      importantDates.push({
        title,
        date: resolved.date,
        dateText: resolved.dateText ?? null,
        datePrecision: resolved.precision,
        repeatType: (yearly ? "yearly" : "none") as RepeatType,
      });
      continue;
    }

    if (PREFERENCE_RE.test(clause)) {
      const category = preferenceCategory(clause);
      const content = stripLead(clause).replace(/^(他|她|我)(很|最|不)?/, "").trim();
      if (category && content) {
        preferences.push({ category, content });
        continue;
      }
    }

    if (BORROW_RE.test(clause)) {
      const lent = /借给|借走|借出/.test(clause);
      const item = clause
        .replace(/.*借(走|给|出|了)?(了)?/, "")
        .replace(/(他|她|我)的/g, "")
        .replace(/(的)?(东西|物品)?$/, "")
        .trim();
      if (item) {
        borrowRecords.push({
          direction: lent ? "lent_to" : "borrowed_from",
          itemName: item.length > 24 ? item.slice(0, 24) : item,
          borrowDate: interactionDate,
        });
        continue;
      }
    }

    if (UPDATE_RE.test(clause)) {
      const content = stripLead(clause);
      if (content && content.length > 1) {
        updates.push({ content });
      }
    }
  }

  const interactionTitle = extractTitle(clauses[0] ?? text, personNames);

  return {
    parser: "rules",
    personCandidates,
    interaction: {
      title: interactionTitle,
      content: text,
      interactionDate,
      location: null,
      interactionType: null,
    },
    updates,
    commitments,
    importantDates,
    preferences,
    borrowRecords,
  };
}
