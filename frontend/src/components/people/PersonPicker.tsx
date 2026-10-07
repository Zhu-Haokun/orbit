import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, Plus, Search } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import type { PersonSummary } from "@/types";

/**
 * 人物选择器。
 *
 * 原生 ``<select>`` 在人一多的时候完全没法用（要在一长串里上下找），
 * 所以换成可输入过滤的下拉：输入姓名 / 昵称 / 关系标签 / 星系任意片段即可筛，
 * 键盘 ↑↓ 移动、Enter 选中、Esc 收起。
 *
 * 无障碍按 combobox 规范实现（规范 §43：Tab / Shift+Tab / Enter / Escape 必须可用）。
 */

export interface PersonPickerProps {
  people: PersonSummary[];
  value: string | null;
  onChange: (personId: string | null) => void;
  /** 允许“暂不指定”（规范 §28 人物：可选）。 */
  allowEmpty?: boolean;
  /** 允许在列表底部新建人物（规范 §20）；会把当前输入作为预填姓名传出去。 */
  onCreateRequest?: (seedName: string) => void;
  /** 多人记录：选中后不关闭下拉，方便接着选下一个。 */
  keepOpen?: boolean;
  placeholder?: string;
  /** 供 Field 传入，保证 label 与控件关联。 */
  id?: string;
  "aria-describedby"?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

/** 命中姓名 / 昵称 / 关系标签 / 星系名，全部大小写不敏感。 */
export function matchPerson(person: PersonSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    person.name,
    person.nickname ?? "",
    person.relationshipLabel ?? "",
    ...person.groups.map((group) => group.name),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

/** 柔和高亮命中片段（规范 §35.2：高亮颜色必须柔和）。 */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-xs bg-accent-soft px-0.5 text-ink">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

export function PersonPicker({
  people,
  value,
  onChange,
  allowEmpty = true,
  onCreateRequest,
  keepOpen = false,
  placeholder = "搜索一个人…",
  id,
  "aria-describedby": describedBy,
  invalid,
  disabled,
  className,
}: PersonPickerProps) {
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => people.find((person) => person.id === value) ?? null, [people, value]);
  const search = query ?? "";
  const matches = useMemo(() => people.filter((person) => matchPerson(person, search)), [people, search]);

  // 列表项：空的“暂不指定”占一项，末尾可选地追加“新建人物”。
  const optionCount = (allowEmpty ? 1 : 0) + matches.length + (onCreateRequest ? 1 : 0);
  const listId = `${id ?? "person-picker"}-listbox`;

  const close = (revert = true) => {
    setOpen(false);
    if (revert) setQuery(null);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    setHighlighted(0);
  }, [search, open]);

  // 高亮项滚进可视区，键盘操作时不会“选到看不见的地方”。
  // jsdom 没有实现 scrollIntoView，所以做一次存在性判断。
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`);
    node?.scrollIntoView?.({ block: "nearest" });
  }, [highlighted, open]);

  const selectPerson = (personId: string | null) => {
    onChange(personId);
    // 多人记录时选完不关，用户可以接着加下一个人。
    if (!keepOpen) close();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setQuery("");
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((current) => {
        if (optionCount === 0) return 0;
        return (current + delta + optionCount) % optionCount;
      });
      return;
    }

    if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      const emptyOffset = allowEmpty ? 1 : 0;
      if (allowEmpty && highlighted === 0) {
        selectPerson(null);
        return;
      }
      const matchIndex = highlighted - emptyOffset;
      if (matchIndex >= 0 && matchIndex < matches.length) {
        selectPerson(matches[matchIndex]!.id);
        return;
      }
      if (onCreateRequest && highlighted === optionCount - 1) {
        const seed = search.trim();
        close();
        onCreateRequest(seed);
      }
      return;
    }

    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <span className="relative flex w-full items-center">
        <Search className="pointer-events-none absolute left-3 size-4 text-ink-3" aria-hidden />
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${highlighted}` : undefined}
          aria-describedby={describedBy}
          aria-label={id ? undefined : "搜索并选择一个人"}
          disabled={disabled}
          placeholder={selected ? selected.name : placeholder}
          value={open ? search : (selected?.name ?? "")}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-[42px] w-full rounded-md border bg-elevated pr-3 pl-9 text-body text-ink",
            "placeholder:text-ink-4 transition-colors duration-[140ms]",
            "focus:border-accent-border focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
            invalid ? "border-danger/50" : "border-line",
          )}
        />
      </span>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="人物候选"
          className={cn(
            "scroll-quiet absolute z-50 mt-2 max-h-[280px] w-full overflow-y-auto rounded-md border border-line",
            "bg-elevated p-1 shadow-soft",
          )}
        >
          {allowEmpty && (
            <li
              id={`${listId}-0`}
              data-index={0}
              role="option"
              aria-selected={highlighted === 0}
              onMouseEnter={() => setHighlighted(0)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectPerson(null)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-body",
                highlighted === 0 ? "bg-hover-fill text-ink" : "text-ink-2",
              )}
            >
              <span className="flex size-8 items-center justify-center rounded-full border border-line-subtle text-ink-4">
                —
              </span>
              {selected ? "取消选择" : "暂不指定"}
            </li>
          )}

          {matches.map((person, index) => {
            const optionIndex = index + (allowEmpty ? 1 : 0);
            const isHighlighted = highlighted === optionIndex;
            const isSelected = person.id === value;
            return (
              <li
                key={person.id}
                id={`${listId}-${optionIndex}`}
                data-index={optionIndex}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlighted(optionIndex)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectPerson(person.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2",
                  isHighlighted ? "bg-hover-fill" : "",
                )}
              >
                <Avatar name={person.name} src={person.avatarUrl} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body text-ink">
                    <Highlight text={person.name} query={search} />
                  </span>
                  {(person.relationshipLabel || person.groups.length > 0) && (
                    <span className="truncate text-micro text-ink-4">
                      <Highlight
                        text={[person.relationshipLabel, person.groups.map((g) => g.name).join("、")]
                          .filter(Boolean)
                          .join(" · ")}
                        query={search}
                      />
                    </span>
                  )}
                </span>
                {isSelected && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
              </li>
            );
          })}

          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-4">没有找到这个人。</li>
          )}

          {onCreateRequest && (
            <li
              id={`${listId}-${optionCount - 1}`}
              data-index={optionCount - 1}
              role="option"
              aria-selected={highlighted === optionCount - 1}
              onMouseEnter={() => setHighlighted(optionCount - 1)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const seed = search.trim();
                close();
                onCreateRequest(seed);
              }}
              className={cn(
                "mt-1 flex cursor-pointer items-center gap-3 rounded-sm border-t border-line-subtle px-3 py-2 text-body",
                highlighted === optionCount - 1 ? "bg-hover-fill text-ink" : "text-ink-2",
              )}
            >
              <span className="flex size-8 items-center justify-center rounded-full border border-line-subtle text-ink-3">
                <Plus className="size-3.5" aria-hidden />
              </span>
              新建人物{search.trim() ? `“${search.trim()}”` : ""}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
