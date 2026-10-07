import { useEffect, useMemo, useRef, useState } from "react";

import { TimelineItem, type TimelinePosition } from "@/components/timeline/TimelineItem";
import { CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PersonDetail } from "@/types";

/**
 * 规范 §27 时间轴 —— 人物详情的核心视觉。
 * 按互动日期倒序排列；一次只展开一条。
 *
 * 支持从搜索结果直接定位：`?interaction=<id>` 进来时，
 * 自动展开那一条并滚到可视区，再短暂高亮一下。
 */

export function Timeline({
  person,
  focusInteractionId,
}: {
  person: PersonDetail;
  focusInteractionId?: string | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const focusedOnce = useRef<string | null>(null);

  const interactions = useMemo(
    () =>
      [...person.interactions].sort((a, b) =>
        b.interactionDate.slice(0, 10).localeCompare(a.interactionDate.slice(0, 10)),
      ),
    [person.interactions],
  );

  useEffect(() => {
    if (!focusInteractionId) return;
    if (focusedOnce.current === focusInteractionId) return;
    if (!interactions.some((item) => item.id === focusInteractionId)) return;

    focusedOnce.current = focusInteractionId;
    setExpandedId(focusInteractionId);
    setHighlightId(focusInteractionId);

    // 等展开后的内容渲染出来再滚，否则会滚到一半的高度。
    const scrollTimer = window.setTimeout(() => {
      itemRefs.current.get(focusInteractionId)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    const fadeTimer = window.setTimeout(() => setHighlightId(null), 2600);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(fadeTimer);
    };
  }, [focusInteractionId, interactions]);

  const positionOf = (index: number): TimelinePosition => {
    if (interactions.length === 1) return "only";
    if (index === 0) return "first";
    if (index === interactions.length - 1) return "last";
    return "middle";
  };

  return (
    <section className="flex flex-col gap-5">
      <CardHeader>
        <CardTitle>时间轴</CardTitle>
      </CardHeader>

      {interactions.length === 0 ? (
        <EmptyState compact title="你们的故事还没有被记录下来。" />
      ) : (
        <ol className="flex flex-col">
          {interactions.map((interaction, index) => (
            <TimelineItem
              key={interaction.id}
              ref={(node) => {
                if (node) itemRefs.current.set(interaction.id, node);
                else itemRefs.current.delete(interaction.id);
              }}
              interaction={interaction}
              personId={person.id}
              position={positionOf(index)}
              expanded={expandedId === interaction.id}
              highlighted={highlightId === interaction.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === interaction.id ? null : interaction.id))
              }
            />
          ))}
        </ol>
      )}
    </section>
  );
}
