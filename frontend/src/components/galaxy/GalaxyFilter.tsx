import { useState } from "react";

import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/uiStore";
import type { Group } from "@/types";

/**
 * 规范 §16 星系筛选 / §42 Mobile 星图。
 *
 * Desktop: 左下浮动 Chip 行「全部 + 每个星系」。
 * Mobile: 收成一个 Chip，点开是一张 sheet（查看全部星系 + 每个星系）。
 * 选中样式由 Chip 原语提供（accent-soft + accent-border）。
 */

export interface GalaxyFilterProps {
  groups: Group[];
}

export function GalaxyFilter({ groups }: GalaxyFilterProps) {
  const groupId = useUiStore((state) => state.galaxyGroupId);
  const setGalaxyGroupId = useUiStore((state) => state.setGalaxyGroupId);
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeName = groups.find((group) => group.id === groupId)?.name;
  const select = (nextId: string | null) => {
    setGalaxyGroupId(nextId);
    setSheetOpen(false);
  };

  return (
    <>
      <div className="absolute bottom-4 left-4 z-30 hidden max-w-[min(78vw,820px)] md:block">
        {/*
          换行铺开，不用横向滚动：星系多起来时滚动条是隐藏的，
          用户会以为"只有这几个"，而实际上后面的被裁掉了。
          只显示星系名 —— 人数在这里没有意义，而且会把名字挤断。
        */}
        <div className="glass-panel flex flex-wrap items-center gap-1 rounded-lg border border-line-subtle p-1">
          <Chip active={groupId === null} onClick={() => setGalaxyGroupId(null)}>
            全部
          </Chip>
          {groups.map((group) => (
            <Chip
              key={group.id}
              active={groupId === group.id}
              onClick={() => setGalaxyGroupId(group.id)}
            >
              {group.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-30 md:hidden">
        <div className="glass-panel inline-flex rounded-pill border border-line-subtle p-1">
          <Chip active={groupId !== null} onClick={() => setSheetOpen(true)}>
            {activeName ?? "查看全部星系"}
          </Chip>
        </div>
      </div>

      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="星系" size="sm">
        <div className="flex flex-col gap-1 pb-2">
          <button
            type="button"
            onClick={() => select(null)}
            className={cn(
              "flex h-11 items-center justify-between rounded-md px-3 text-body transition-colors duration-[140ms]",
              groupId === null ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover-fill hover:text-ink",
            )}
          >
            查看全部星系
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => select(group.id)}
              className={cn(
                "flex h-11 items-center justify-between rounded-md px-3 text-body transition-colors duration-[140ms]",
                groupId === group.id
                  ? "bg-accent-soft text-accent"
                  : "text-ink-2 hover:bg-hover-fill hover:text-ink",
              )}
            >
              <span className="truncate">{group.name}</span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
