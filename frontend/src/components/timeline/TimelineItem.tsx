import { useState, type Ref } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Camera, MapPin } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useDeleteInteraction, useUpdateInteraction } from "@/hooks/useRecords";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatTimelineDate, truncate } from "@/lib/format";
import { blankToNull, collectIssues, interactionSchema } from "@/lib/validation";
import { lightbox } from "@/stores/lightboxStore";
import { toast } from "@/stores/toastStore";
import type { Interaction } from "@/types";

/**
 * 规范 §27 时间轴条目
 * Desktop: 左日期 / 中竖线 / 右内容；节点 6px，选中时为 accent。
 * 内容不套卡片边框，只靠间距与一条极轻的分隔线保持呼吸感。
 * 点击展开：完整内容、地点、照片缩略图、编辑 / 删除。
 */

export type TimelinePosition = "only" | "first" | "middle" | "last";

export interface TimelineItemProps {
  interaction: Interaction;
  personId: string;
  position: TimelinePosition;
  expanded: boolean;
  /** 从搜索结果定位过来时，短暂高亮这一条。 */
  highlighted?: boolean;
  onToggle: () => void;
  ref?: Ref<HTMLLIElement>;
}

export function TimelineItem({
  interaction,
  personId,
  position,
  expanded,
  highlighted = false,
  onToggle,
  ref,
}: TimelineItemProps) {
  const update = useUpdateInteraction(personId);
  const remove = useDeleteInteraction(personId);
  const reduceMotion = useReducedMotion();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(interaction));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const attachmentCount = interaction.attachments.length;
  const showRule = position === "first" || position === "middle";

  const startEdit = () => {
    setDraft(toDraft(interaction));
    setErrors({});
    setEditing(true);
  };

  const save = () => {
    const parsed = interactionSchema.safeParse({ personId, ...draft });
    if (!parsed.success) {
      setErrors(collectIssues(parsed.error));
      return;
    }
    setErrors({});
    update.mutate(
      {
        id: interaction.id,
        patch: {
          title: parsed.data.title,
          content: parsed.data.content ?? "",
          interactionDate: parsed.data.interactionDate,
          location: blankToNull(parsed.data.location),
        },
      },
      {
        onSuccess: () => setEditing(false),
        onError: (cause) =>
          setErrors({
            form: cause instanceof ApiError ? cause.message : "暂时没能完成这次操作，请稍后再试。",
          }),
      },
    );
  };

  return (
    <li
      ref={ref}
      className={cn(
        "grid grid-cols-1 rounded-md transition-colors duration-500 md:grid-cols-[92px_28px_1fr]",
        highlighted && "bg-accent-soft/40",
      )}
    >
      {/* Mobile: 日期在内容上方，竖线隐藏（规范 §41） */}
      <div className="flex items-center gap-2 pb-2 md:hidden">
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", expanded ? "bg-accent" : "bg-ink-3")}
        />
        <span className="text-sm tabular-nums text-ink-3">
          {formatTimelineDate(interaction.interactionDate)}
        </span>
      </div>

      <div className="hidden pt-0.5 text-right text-sm tabular-nums text-ink-3 md:block">
        {formatTimelineDate(interaction.interactionDate)}
      </div>

      <div className="relative hidden md:block">
        {position !== "only" && (
          <span
            aria-hidden
            className={cn(
              "absolute left-1/2 w-px -translate-x-1/2 bg-[var(--line-galaxy)]",
              position === "first" && "top-[13px] bottom-0",
              position === "middle" && "inset-y-0",
              position === "last" && "top-0 h-[13px]",
            )}
          />
        )}
        <span
          aria-hidden
          className={cn(
            "absolute left-1/2 top-[10px] size-1.5 -translate-x-1/2 rounded-full transition-colors duration-[140ms]",
            expanded ? "bg-accent" : "bg-ink-3",
          )}
        />
      </div>

      <div className={cn("pb-8 md:pl-1", showRule && "border-b border-line-subtle")}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full flex-col items-start gap-1 text-left"
        >
          <span className="text-lg text-ink">{interaction.title}</span>
          {!expanded && interaction.content && (
            <span className="text-body text-ink-2">{truncate(interaction.content, 72)}</span>
          )}
          {attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-3">
              <Camera className="size-3.5" aria-hidden />
              {attachmentCount} 张照片
            </span>
          )}
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 pt-3">
                {editing ? (
                  <>
                    <Field label="标题" error={errors.title}>
                      {({ id, ...rest }) => (
                        <Input
                          id={id}
                          value={draft.title}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, title: event.target.value }))
                          }
                          {...rest}
                        />
                      )}
                    </Field>
                    <Field label="内容">
                      {({ id, ...rest }) => (
                        <Textarea
                          id={id}
                          rows={3}
                          value={draft.content}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, content: event.target.value }))
                          }
                          {...rest}
                        />
                      )}
                    </Field>
                    <Field label="地点">
                      {({ id, ...rest }) => (
                        <Input
                          id={id}
                          value={draft.location}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, location: event.target.value }))
                          }
                          {...rest}
                        />
                      )}
                    </Field>
                    <Field label="日期">
                      {({ id, ...rest }) => (
                        <Input
                          id={id}
                          type="date"
                          value={draft.interactionDate.slice(0, 10)}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, interactionDate: event.target.value }))
                          }
                          {...rest}
                        />
                      )}
                    </Field>
                    {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="primary" loading={update.isPending} onClick={save}>
                        保存
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                        取消
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {interaction.content && (
                      <p className="text-body whitespace-pre-line text-ink-2">{interaction.content}</p>
                    )}
                    {interaction.location && (
                      <p className="inline-flex items-center gap-1.5 text-sm text-ink-3">
                        <MapPin className="size-3.5" aria-hidden />
                        {interaction.location}
                      </p>
                    )}
                    {attachmentCount > 0 && (
                      <ul className="flex flex-wrap gap-2">
                        {interaction.attachments.map((attachment, imageIndex) => (
                          <li key={attachment.id}>
                            <button
                              type="button"
                              aria-label="放大查看这张图片"
                              onClick={() =>
                                lightbox.open(
                                  interaction.attachments.map((item) => item.fileUrl),
                                  imageIndex,
                                )
                              }
                              className="block cursor-zoom-in rounded-sm transition-opacity duration-[140ms] hover:opacity-80"
                            >
                              <img
                                src={attachment.fileUrl}
                                alt=""
                                loading="lazy"
                                className="size-16 rounded-sm border border-line-subtle object-cover"
                              />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={startEdit}>
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          remove.mutate(interaction.id, {
                            onError: (cause) =>
                              toast.error(
                                cause instanceof ApiError
                                  ? cause.message
                                  : "暂时没能完成这次操作，请稍后再试。",
                              ),
                          })
                        }
                      >
                        删除
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </li>
  );
}

function toDraft(interaction: Interaction) {
  return {
    title: interaction.title,
    content: interaction.content,
    location: interaction.location ?? "",
    interactionDate: interaction.interactionDate,
  };
}
