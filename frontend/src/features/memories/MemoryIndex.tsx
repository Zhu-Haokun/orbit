import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ImageIcon, MapPin, Sparkles, User } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { monthAnchorId } from "@/features/memories/MemoryTimeline";
import { cn } from "@/lib/cn";
import { formatYearMonthDay } from "@/lib/format";
import type { MemoriesPayload, MemoryItem } from "@/types";

/**
 * 回忆索引栏（产品升级文档「方向一：导航型右栏」）。
 *
 * 原来右侧只有四行统计数字，然后是大片空白 —— 那不是留白，是没干完活。
 * 现在它回答一个问题：**我现在看的是哪一段时间，还有哪些人和地方值得重新进入？**
 *
 * 全部内容都从 `payload` 推导，所以一定是当前筛选结果里真实存在的，
 * 不会出现和结果无关的统计。
 *
 * 刻意不做：趋势判断、"最重要的人"、亲密度、排名。
 */

const TOP_PEOPLE = 4;
const TOP_PLACES = 4;
/** 索引栏最多列这么多个月份，其余靠"跳转"输入 —— 否则长历史会把侧栏撑爆。 */
const MAX_MONTH_LINKS = 6;

interface IndexData {
  people: Array<{ id: string; name: string; avatarUrl: string | null; count: number }>;
  places: Array<{ name: string; count: number }>;
  months: Array<{ key: string; label: string; count: number; year: number; month: number }>;
  /** 真实总数（不是上面两个被截断的数组长度）。 */
  peopleTotal: number;
  placesTotal: number;
  total: number;
  images: number;
  solo: number;
  firstDate: string | null;
  lastDate: string | null;
  /** 「也许想再看一眼」的候选池（全部真实记忆，由组件打乱后逐条翻）。 */
  replayCandidates: MemoryItem[];
}

function buildIndex(payload: MemoriesPayload): IndexData {
  const items = payload.months.flatMap((month) => month.items);

  const peopleMap = new Map<string, { name: string; avatarUrl: string | null; count: number }>();
  const placeMap = new Map<string, number>();
  let images = 0;
  let solo = 0;

  for (const item of items) {
    if (item.isSelf) solo += 1;
    if (item.attachments.some((a) => a.fileType === "image")) images += 1;
    if (item.location) placeMap.set(item.location, (placeMap.get(item.location) ?? 0) + 1);
    for (const person of item.people) {
      const current = peopleMap.get(person.id);
      peopleMap.set(person.id, {
        name: person.name,
        avatarUrl: person.avatarUrl,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  const dates = items.map((item) => item.date).sort();

  return {
    people: [...peopleMap.entries()]
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, TOP_PEOPLE),
    places: [...placeMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, TOP_PLACES),
    months: payload.months.map((month) => ({
      key: month.key,
      label: month.label,
      count: month.items.length,
      year: month.year,
      month: month.month,
    })),
    // 摘要说的是"一共多少人/多少地点"，所以要用完整集合的长度，
    // 不能用上面截断后的数组 —— 否则 55 个人会被报成 5 个。
    peopleTotal: peopleMap.size,
    placesTotal: placeMap.size,
    total: items.length,
    images,
    solo,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    // 「也许想再看一眼」：整池真实记忆，顺序由组件随机打乱 ——
    // 按时间排的话第一条永远是最新那张照片，等于每次看同一个。
    replayCandidates: items,
  };
}

/**
 * 固定种子的分层随机。
 *
 * 用种子而不是 Math.random 直接乱序：同一次进入页面时顺序必须稳定，
 * 否则任何一次 re-render 都会换一条，"换一条"就永远停不下来。
 * 种子每次刷新页面重新生成，所以每次打开看到的都不一样。
 *
 * 分三层而不是给每条一个平滑权重：全库 259 条里 207 条都有地点，
 * 平滑权重会被"有地点"这一层淹没，4 条带照片的几乎冒不了头。
 * 分层能保证"有照片的优先看到"，层内仍然是随机的。
 *
 * 分层只依据"这条记录有没有照片 / 地点"这个事实，不评价内容。
 */
function shuffleWithSeed<T>(items: T[], seed: number, tierOf: (item: T) => number): T[] {
  let state = seed >>> 0 || 1;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const swap = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = swap;
  }
  // 稳定排序：只按层级排，层内保持上面洗好的随机顺序。
  return shuffled
    .map((item, index) => ({ item, index, tier: tierOf(item) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((entry) => entry.item);
}

/** 有没有画面：带照片最优先，其次有地点，其余是普通记忆。 */
function replayTier(item: MemoryItem): number {
  if (item.attachments.some((attachment) => attachment.fileType === "image")) return 0;
  if (item.location) return 1;
  return 2;
}

function Module({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="inline-flex items-center gap-1.5 text-sm text-ink-4">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function MemoryIndex({
  payload,
  activeMonth,
  onPickLocation,
  onPickPerson,
  activeLocation,
  activePersonId,
}: {
  payload: MemoriesPayload;
  activeMonth: string | null;
  onPickLocation: (value: string) => void;
  onPickPerson: (id: string) => void;
  activeLocation: string | null;
  activePersonId: string | null;
}) {
  const navigate = useNavigate();
  const index = useMemo(() => buildIndex(payload), [payload]);
  const [replayCursor, setReplayCursor] = useState(0);
  // 每次进入页面换一个种子 → 打开时看到的是随机一条，不是永远最新的那条。
  const [shuffleSeed] = useState(() => Math.floor(Math.random() * 0xffffffff));
  const [yearInput, setYearInput] = useState("");
  const [monthInput, setMonthInput] = useState("");
  const [jumpError, setJumpError] = useState(false);

  // 换一条 = 在打乱后的池子里往下挪一条，而不是把模块收起来。
  const candidates = useMemo(
    () => shuffleWithSeed(index.replayCandidates, shuffleSeed, replayTier),
    [index.replayCandidates, shuffleSeed],
  );
  const replay = candidates.length > 0 ? candidates[replayCursor % candidates.length] : null;

  if (index.total === 0) return null;

  const scrollToMonth = (key: string) => {
    document.getElementById(monthAnchorId(key))?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <aside
      className="flex flex-col gap-5 text-sm"
      aria-label="回忆索引"
    >
      {/* A. 当前范围摘要 */}
      <Module title={payload.year ? `${payload.year} 年` : "全部时间"}>
        <p className="text-body text-ink-2">
          {index.total} 段经历 · {index.peopleTotal} 个人 · {index.placesTotal} 个地点
        </p>
        {(index.firstDate || index.lastDate) && (
          <p className="text-sm text-ink-4 tabular-nums">
            {index.firstDate && `最早 ${formatYearMonthDay(index.firstDate)}`}
            {index.firstDate && index.lastDate && " · "}
            {index.lastDate && `最近 ${formatYearMonthDay(index.lastDate)}`}
          </p>
        )}
        {(index.images > 0 || index.solo > 0) && (
          <p className="inline-flex flex-wrap items-center gap-x-3 text-sm text-ink-4">
            {index.images > 0 && (
              <span className="inline-flex items-center gap-1">
                <ImageIcon className="size-3.5" aria-hidden />
                {index.images} 段有照片
              </span>
            )}
            {index.solo > 0 && <span>独处 {index.solo} 段</span>}
          </p>
        )}
      </Module>

      {/* B. 月份导航 —— 长文档目录，不是统计面板。
             只列最近 N 个月，剩下的用"跳转"输入，保证整个索引一屏放得下。 */}
      {index.months.length > 1 && (
        <Module title="时间线">
          <ul className="flex flex-col">
            {index.months.slice(0, MAX_MONTH_LINKS).map((month) => (
              <li key={month.key}>
                <button
                  type="button"
                  onClick={() => scrollToMonth(month.key)}
                  aria-current={activeMonth === month.key ? "true" : undefined}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-2 rounded-sm px-2 py-1 text-left transition-colors duration-[140ms] hover:bg-hover-fill",
                    activeMonth === month.key ? "text-ink" : "text-ink-3",
                  )}
                >
                  <span className="tabular-nums">
                    {month.year}.{month.month}
                  </span>
                  <span className="tabular-nums text-ink-4">{month.count}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* 超出部分靠键入年月跳转 —— 顶部已有年份筛选，这里补足月份粒度。 */}
          <form
            className="flex items-center gap-1.5 px-2 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              const key = `${yearInput}-${String(monthInput).padStart(2, "0")}`;
              if (document.getElementById(monthAnchorId(key))) {
                scrollToMonth(key);
                setJumpError(false);
              } else {
                setJumpError(true);
              }
            }}
          >
            <input
              value={yearInput}
              onChange={(event) => {
                setYearInput(event.target.value.replace(/\D/g, "").slice(0, 4));
                setJumpError(false);
              }}
              inputMode="numeric"
              aria-label="年份"
              placeholder="年"
              className="w-[52px] rounded-sm border border-line-subtle bg-surface px-1.5 py-1 text-center text-sm tabular-nums text-ink outline-none placeholder:text-ink-4 focus:border-line"
            />
            <span className="text-ink-4">.</span>
            <input
              value={monthInput}
              onChange={(event) => {
                setMonthInput(event.target.value.replace(/\D/g, "").slice(0, 2));
                setJumpError(false);
              }}
              inputMode="numeric"
              aria-label="月份"
              placeholder="月"
              className="w-[40px] rounded-sm border border-line-subtle bg-surface px-1.5 py-1 text-center text-sm tabular-nums text-ink outline-none placeholder:text-ink-4 focus:border-line"
            />
            <button
              type="submit"
              className="rounded-sm px-2 py-1 text-sm text-ink-3 transition-colors duration-[140ms] hover:bg-hover-fill hover:text-ink"
            >
              跳转
            </button>
            {jumpError && <span className="text-sm text-ink-4">这个月没有记录</span>}
          </form>

          {index.months.length > MAX_MONTH_LINKS && (
            <p className="px-2 text-sm text-ink-4 tabular-nums">
              共 {index.months.length} 个月，上面是最近 {MAX_MONTH_LINKS} 个
            </p>
          )}
        </Module>
      )}

      {/* C. 人物与地点索引 —— 点进去就是筛选 */}
      {index.people.length > 1 && (
        <Module title="出现过的人" icon={<User className="size-3.5" aria-hidden />}>
          <ul className="flex flex-col">
            {index.people.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => onPickPerson(person.id)}
                  aria-pressed={activePersonId === person.id}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors duration-[140ms] hover:bg-hover-fill",
                    activePersonId === person.id ? "text-ink" : "text-ink-3",
                  )}
                >
                  <Avatar name={person.name} src={person.avatarUrl} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                  <span className="tabular-nums text-ink-4">{person.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </Module>
      )}

      {index.places.length > 0 && (
        <Module title="去过的地方" icon={<MapPin className="size-3.5" aria-hidden />}>
          <ul className="flex flex-col">
            {index.places.map((place) => (
              <li key={place.name}>
                <button
                  type="button"
                  onClick={() => onPickLocation(place.name)}
                  aria-pressed={activeLocation === place.name}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-2 rounded-sm px-2 py-1 text-left transition-colors duration-[140ms] hover:bg-hover-fill",
                    activeLocation === place.name ? "text-ink" : "text-ink-3",
                  )}
                >
                  <span className="min-w-0 truncate">{place.name}</span>
                  <span className="tabular-nums text-ink-4">{place.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </Module>
      )}

      {/* D. 一条有事实依据的回看入口 —— 可以一条条换，不是推荐流 */}
      {replay && (
        <Module title="也许想再看一眼" icon={<Sparkles className="size-3.5 text-accent" aria-hidden />}>
          <div className="flex flex-col gap-1.5 rounded-md border border-line-subtle bg-surface px-3 py-2.5">
            <button
              type="button"
              onClick={() => {
                const first = replay.people[0];
                if (first) navigate(`/people/${first.id}?interaction=${replay.interactionId}`);
              }}
              className="flex flex-col gap-0.5 text-left"
            >
              <span className="text-body text-ink">{replay.title}</span>
              <span className="flex items-center gap-1.5 text-sm text-ink-4">
                <span className="tabular-nums">{formatYearMonthDay(replay.date)}</span>
                {replay.location && <span>· {replay.location}</span>}
                {/* 和谁一起 —— 多人时只显示第一个，后面用省略号带过。 */}
                {replay.isSelf ? (
                  <span>· 独处</span>
                ) : replay.people.length > 0 ? (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    ·
                    <Avatar
                      name={replay.people[0]!.name}
                      src={replay.people[0]!.avatarUrl}
                      size="xs"
                    />
                    <span className="truncate text-ink-3">
                      {replay.people[0]!.name}
                      {replay.people.length > 1 ? "..." : ""}
                    </span>
                  </span>
                ) : null}
              </span>
            </button>
            {index.replayCandidates.length > 1 && (
              <button
                type="button"
                onClick={() => setReplayCursor((prev) => prev + 1)}
                className="w-fit text-sm text-ink-4 transition-colors duration-[140ms] hover:text-ink-2"
              >
                换一条（{((replayCursor % candidates.length) || 0) + 1}/{candidates.length}）
              </button>
            )}
          </div>
        </Module>
      )}
    </aside>
  );
}
