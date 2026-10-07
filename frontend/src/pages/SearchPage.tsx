import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { SkeletonList } from "@/components/ui/Skeleton";
import { SearchResultsList } from "@/features/search/SearchResultGroup";
import { useSearch } from "@/hooks/useInsights";

/**
 * 规范 §35 搜索页 / §79 max-width 900px
 * 顶部大搜索框 → 250ms 防抖 → 分类结果（人物 / 记忆 / 未完待续 / 借还）。
 * 规范 §35.3: 没有结果时给出安静的下一步提示。
 */

const DEBOUNCE_MS = 250;

export function SearchPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(value.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  const searchQuery = useSearch(query);
  const results = searchQuery.data;

  const hasQuery = query.length > 0;
  /* 用 data === undefined 表达「还没有结果」，避免依赖不同版本的 loading 字段 */
  const showSkeleton = hasQuery && results === undefined && !searchQuery.isError;

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-10 px-4 py-8 md:px-8 md:py-10 lg:px-10">
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-ink">搜索</h1>
        <Input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="搜索一个人、一件事、一段回忆…"
          aria-label="搜索一个人、一件事、一段回忆"
          autoComplete="off"
          autoFocus
          className="h-12 text-lg"
          icon={<Search className="size-[18px]" aria-hidden />}
        />
      </div>

      <div className="flex flex-col gap-10">
        {!hasQuery ? (
          <p className="text-body text-ink-3">
            试试搜索一个名字、一个地点，或者一件你记得的小事。
          </p>
        ) : showSkeleton ? (
          <SkeletonList rows={4} />
        ) : searchQuery.isError ? (
          <ErrorState onRetry={() => void searchQuery.refetch()} />
        ) : results ? (
          <SearchResultsList
            results={results}
            query={query}
            onSelect={(path) => navigate(path)}
          />
        ) : null}
      </div>
    </div>
  );
}
