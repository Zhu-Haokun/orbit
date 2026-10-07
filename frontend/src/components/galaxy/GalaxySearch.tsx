import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/Input";
import { useUiStore } from "@/stores/uiStore";
import type { PersonSummary } from "@/types";

/**
 * 规范 §15 星图浮动搜索
 * Desktop: top 24 / left 50% / translateX(-50%) / width 320 / height 42 / radius 14
 * bg rgba(14,17,24,.82) + backdrop blur 18 + border-default —— 即 glass-panel + token 描边。
 *
 * 输入后：匹配人物 → 命中节点高亮 → 非命中透明度降低 → Enter 聚焦第一项。
 * 匹配逻辑放在这里，星图与页面共用同一份判断。
 */

export function galaxySearchMatch(person: PersonSummary, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return false;
  const haystack = [
    person.name,
    person.nickname ?? "",
    person.relationshipLabel ?? "",
    person.notes ?? "",
    person.latestUpdate ?? "",
    ...person.groups.map((group) => group.name),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export interface GalaxySearchProps {
  /** 规范 §15: Enter 聚焦第一项。 */
  onFocusFirstMatch: () => void;
}

export function GalaxySearch({ onFocusFirstMatch }: GalaxySearchProps) {
  const query = useUiStore((state) => state.galaxyQuery);
  const setGalaxyQuery = useUiStore((state) => state.setGalaxyQuery);

  return (
    <div
      role="search"
      className="absolute top-4 left-1/2 z-30 w-80 max-w-[calc(100%-32px)] -translate-x-1/2 md:top-6"
    >
      <div className="glass-panel relative flex h-[42px] items-center rounded-[14px] border border-line shadow-soft transition-colors duration-[140ms] focus-within:border-accent-border">
        <Input
          type="text"
          value={query}
          aria-label="搜索星图"
          placeholder="搜索一个人、标签或记忆…"
          icon={<Search className="size-4" aria-hidden />}
          className="h-[42px] rounded-[14px] border-transparent bg-transparent pr-10 focus:border-transparent"
          onChange={(event) => setGalaxyQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onFocusFirstMatch();
              return;
            }
            if (event.key === "Escape") {
              if (query) {
                // 先清空搜索，不让 Esc 冒泡去关闭 Drawer（规范 §43）。
                event.stopPropagation();
                setGalaxyQuery("");
              }
              event.currentTarget.blur();
            }
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="清除搜索"
            onClick={() => setGalaxyQuery("")}
            className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 transition-colors duration-[140ms] hover:bg-hover-fill hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
