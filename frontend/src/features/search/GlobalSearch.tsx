import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SkeletonList } from "@/components/ui/Skeleton";
import { SearchResultsList } from "@/features/search/SearchResultGroup";
import { useSearch } from "@/hooks/useInsights";
import { useUiStore } from "@/stores/uiStore";

/**
 * 规范 §60 Search 快捷键 / §41 Mobile 独立 Search Sheet
 *
 * Cmd/Ctrl + K 打开，Esc 关闭（Modal 自带 Esc，这里再注册一次文档级监听，
 * 且只在明确按下快捷键时抢焦点，用户在别的输入框打字不受影响）。
 * AppShell 已经渲染 <GlobalSearch />，因此它不接收任何 props。
 */

export function GlobalSearch() {
  const open = useUiStore((state) => state.searchOpen);
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const navigate = useNavigate();

  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /* 关闭时清空，避免下次打开还留着上一次的搜索词 */
  useEffect(() => {
    if (open) return;
    setValue("");
    setQuery("");
  }, [open]);

  /* 规范 §60: Cmd/Ctrl + K 打开，Esc 关闭 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setSearchOpen]);

  /* 打开后自动聚焦，让用户可以直接开始输入 */
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  /* 浮层内也做 250ms 防抖，与搜索页保持一致的手感 */
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(value.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [value]);

  const searchQuery = useSearch(query, open);
  const results = searchQuery.data;
  const showSkeleton = query.length > 0 && results === undefined && !searchQuery.isError;

  const close = () => setSearchOpen(false);

  const onSelect = (path: string) => {
    close();
    navigate(path);
  };

  return (
    <Modal open={open} onClose={close} size="lg" title="搜索" description="在人物、记忆与记录里找一找。">
      <div className="flex flex-col gap-5">
        <Input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="搜索一个人、一件事、一段回忆…"
          aria-label="搜索一个人、一件事、一段回忆"
          autoComplete="off"
          icon={<Search className="size-4" aria-hidden />}
        />

        {query.length === 0 ? (
          <p className="px-1 text-sm text-ink-3">输入一个名字或一件小事试试。</p>
        ) : showSkeleton ? (
          <SkeletonList rows={3} />
        ) : searchQuery.isError ? (
          <p className="px-1 text-sm text-ink-3">暂时没能完成这次搜索，稍后再试。</p>
        ) : results ? (
          <SearchResultsList results={results} query={query} onSelect={onSelect} />
        ) : null}
      </div>
    </Modal>
  );
}
