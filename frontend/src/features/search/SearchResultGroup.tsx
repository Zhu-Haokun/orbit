import type { ReactNode } from "react";
import { ArrowLeftRight, CalendarClock, SearchX } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { formatMonthDay, truncate } from "@/lib/format";
import type { SearchResults } from "@/types";

/**
 * 规范 §35.2 分类展示
 * 每个分类是「标题 + 计数 + 若干行」，分类顺序由调用方固定：
 * 人物 → 记忆 → 未完待续 → 借还。
 */
export interface SearchResultGroupProps {
  title: string;
  count: number;
  children: ReactNode;
  className?: string;
}

export function SearchResultGroup({ title, count, children, className }: SearchResultGroupProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label={`${title} 搜索结果`}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm text-ink-2">{title}</h2>
        <span className="text-sm text-ink-4 tabular-nums">{count}</span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export interface HighlightProps {
  text: string;
  /** 搜索关键词；为空时原样输出。 */
  query: string;
  className?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 规范 §35.2: 搜索关键词高亮，但高亮颜色必须柔和。
 * 使用 accent-soft 背景，绝不使用浏览器默认的刺眼黄色 mark。
 */
export function Highlight({ text, query, className }: HighlightProps) {
  const keyword = query.trim();
  if (!keyword) return <span className={className}>{text}</span>;

  let matcher: RegExp;
  try {
    matcher = new RegExp(`(${escapeRegExp(keyword)})`, "gi");
  } catch {
    return <span className={className}>{text}</span>;
  }

  const parts = text.split(matcher);
  const lowerKeyword = keyword.toLowerCase();

  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.toLowerCase() === lowerKeyword ? (
          <mark
            key={index}
            className="rounded-xs bg-accent-soft px-0.5 text-ink"
            data-orbit-highlight
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * 搜索结果行 —— 搜索页与全局搜索浮层共用同一套渲染
 * 规范 §35.2 分类顺序固定：人物 → 记忆 → 未完待续 → 借还
 * ------------------------------------------------------------------ */

export interface SearchResultsListProps {
  results: SearchResults;
  query: string;
  /** 选中结果后跳转；浮层会在跳转后关闭自己。 */
  onSelect: (path: string) => void;
}

interface ResultRowProps {
  onClick: () => void;
  leading: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
}

function ResultRow({ onClick, leading, title, meta }: ResultRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-line-subtle bg-surface px-4 py-3 text-left",
        "transition-colors duration-[140ms] hover:border-line-hover hover:bg-hover-fill",
      )}
    >
      <span className="flex shrink-0 items-center text-ink-3">{leading}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body text-ink">{title}</span>
        {meta && <span className="truncate text-sm text-ink-3">{meta}</span>}
      </span>
    </button>
  );
}

function JoinMeta({ parts }: { parts: Array<ReactNode | null | undefined | false> }) {
  const visible = parts.filter(Boolean) as ReactNode[];
  if (visible.length === 0) return null;
  return (
    <>
      {visible.map((part, index) => (
        <span key={index}>
          {index > 0 && <span className="px-1.5 text-ink-4">·</span>}
          {part}
        </span>
      ))}
    </>
  );
}

export function SearchResultsList({ results, query, onSelect }: SearchResultsListProps) {
  const hasAny =
    results.people.length + results.memories.length + results.commitments.length + results.borrowRecords.length >
    0;

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-subtle px-6 py-12 text-center">
        <SearchX className="size-5 text-ink-3" aria-hidden />
        <p className="text-body text-ink-2">没有找到相关记录。</p>
        <p className="max-w-sm text-sm text-ink-3">
          试试换一个关键词，
          <br />
          或者记录一段新的记忆。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {results.people.length > 0 && (
        <SearchResultGroup title="人物" count={results.people.length}>
          {results.people.map((hit) => (
            <ResultRow
              key={hit.person.id}
              onClick={() => onSelect(`/people/${hit.person.id}`)}
              leading={<Avatar name={hit.person.name} src={hit.person.avatarUrl} size="md" />}
              title={<Highlight text={hit.person.name} query={query} />}
              meta={
                <JoinMeta
                  parts={[
                    hit.person.relationshipLabel,
                    hit.person.groups.map((group) => group.name).join("、") || null,
                    hit.matchedIn.length > 0 ? `命中 ${hit.matchedIn.join("、")}` : null,
                  ]}
                />
              }
            />
          ))}
        </SearchResultGroup>
      )}

      {results.memories.length > 0 && (
        <SearchResultGroup title="记忆" count={results.memories.length}>
          {results.memories.map((hit) => (
            <ResultRow
              key={hit.interaction.id}
              // 文档「最小可验证版本」第 4 条：点搜索结果要直接落到时间轴上那一条，
              // 而不是只把人打开让用户自己再找一遍。
              onClick={() =>
                hit.person &&
                onSelect(`/people/${hit.person.id}?interaction=${hit.interaction.id}`)
              }
              leading={<Avatar name={hit.person?.name ?? "?"} src={hit.person?.avatarUrl} size="md" />}
              title={<Highlight text={hit.interaction.title} query={query} />}
              meta={
                <JoinMeta
                  parts={[
                    hit.person?.name,
                    formatMonthDay(hit.interaction.interactionDate),
                    hit.interaction.location,
                    hit.interaction.content ? truncate(hit.interaction.content, 32) : null,
                  ]}
                />
              }
            />
          ))}
        </SearchResultGroup>
      )}

      {results.commitments.length > 0 && (
        <SearchResultGroup title="未完待续" count={results.commitments.length}>
          {results.commitments.map((hit) => (
            <ResultRow
              key={hit.commitment.id}
              onClick={() => hit.person && onSelect(`/people/${hit.person.id}`)}
              leading={<CalendarClock className="size-4" aria-hidden />}
              title={<Highlight text={hit.commitment.content} query={query} />}
              meta={
                <JoinMeta
                  parts={[
                    hit.person?.name,
                    hit.commitment.dueDate ? `${formatMonthDay(hit.commitment.dueDate)} 到期` : hit.commitment.dueText,
                  ]}
                />
              }
            />
          ))}
        </SearchResultGroup>
      )}

      {results.borrowRecords.length > 0 && (
        <SearchResultGroup title="借还" count={results.borrowRecords.length}>
          {results.borrowRecords.map((hit) => (
            <ResultRow
              key={hit.borrowRecord.id}
              onClick={() => hit.person && onSelect(`/people/${hit.person.id}`)}
              leading={<ArrowLeftRight className="size-4" aria-hidden />}
              title={<Highlight text={hit.borrowRecord.itemName} query={query} />}
              meta={
                <JoinMeta
                  parts={[
                    hit.person?.name,
                    hit.borrowRecord.direction === "lent_to"
                      ? hit.person
                        ? `我借给${hit.person.name}`
                        : "我借出"
                      : hit.person
                        ? `${hit.person.name}借给我`
                        : "我借入",
                    formatMonthDay(hit.borrowRecord.borrowDate),
                    hit.borrowRecord.status === "open" ? "尚未归还" : null,
                  ]}
                />
              }
            />
          ))}
        </SearchResultGroup>
      )}
    </div>
  );
}
