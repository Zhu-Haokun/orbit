import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, MoreHorizontal } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DeletePersonDialog } from "@/features/people/DeletePersonDialog";
import { EditPersonModal } from "@/features/people/EditPersonModal";
import { cn } from "@/lib/cn";
import { metDurationLabel } from "@/lib/format";
import type { PersonDetail } from "@/types";

/**
 * 规范 §21.1 人物详情 Hero
 * 返回箭头 / avatar 72 / 姓名 / 关系标签 / 认识多久 / 操作。
 * 规范 §58: [•••] 里的删除人物打开 DeletePersonDialog。
 */

export function PersonHero({ person }: { person: PersonDetail }) {
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  // 规范 §21.1: metAt 为空时整行省略。「认识多久」对自己不适用。
  const metLabel = person.isSelf ? null : metDurationLabel(person.metAt);

  const goRecord = () => navigate(`/record?person=${person.id}`);

  return (
    <header className="flex flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          aria-label="返回星图"
          icon={<ArrowLeft className="size-[18px]" aria-hidden />}
          onClick={() => navigate("/galaxy")}
        />
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={person.name} src={person.avatarUrl} size="xl" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate text-h1 text-ink">{person.name}</h1>
          {person.relationshipLabel && (
            <p className="truncate text-body text-ink-2">{person.relationshipLabel}</p>
          )}
          {metLabel && <p className="text-sm text-ink-3">{metLabel}</p>}
          {/* 自我档案：MBTI 与爱好，都是用户自己写的自我介绍。 */}
          {person.isSelf && (person.mbti || person.interests) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {person.mbti && (
                <span className="rounded-pill border border-accent-border bg-accent-soft px-2.5 py-0.5 font-data text-sm text-ink tabular-nums">
                  {person.mbti}
                </span>
              )}
              {(person.interests ?? "")
                .split(/[,，]/)
                .map((item) => item.trim())
                .filter(Boolean)
                .map((item) => (
                  <span
                    key={item}
                    className="rounded-pill border border-line-subtle bg-surface px-2.5 py-0.5 text-sm text-ink-3"
                  >
                    {item}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="primary" onClick={goRecord}>
          记录互动
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            编辑
          </Button>

          <div className="relative" ref={menuRef}>
            <Button
              variant="secondary"
              aria-label="更多操作"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              icon={<MoreHorizontal className="size-[18px]" aria-hidden />}
              onClick={() => setMenuOpen((prev) => !prev)}
            />
            {menuOpen && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.14, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "absolute right-0 top-[calc(100%+8px)] z-30 flex min-w-[152px] flex-col",
                  "rounded-md border border-line-subtle bg-elevated p-1 shadow-soft",
                )}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-9 items-center rounded-sm px-3 text-left text-body text-ink-2 transition-colors duration-[140ms] hover:bg-hover-fill hover:text-ink"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditOpen(true);
                  }}
                >
                  编辑资料
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-9 items-center rounded-sm px-3 text-left text-body text-danger transition-colors duration-[140ms] hover:bg-danger/5"
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  删除人物
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <EditPersonModal person={person} open={editOpen} onClose={() => setEditOpen(false)} />
      <DeletePersonDialog person={person} open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </header>
  );
}
