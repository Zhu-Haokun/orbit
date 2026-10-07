import { useState } from "react";
import { Paperclip, X } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { Field, Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { PersonPicker } from "@/components/people/PersonPicker";
import { cn } from "@/lib/cn";
import { uploadsService } from "@/services/ai";
import { toast } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";
import type { PersonSummary } from "@/types";

/**
 * 规范 §28 记录页初始状态
 * max-width 760 / margin auto / padding-top 120
 * 标题：记录刚刚发生的事情
 * 副标题：写一句就够了，剩下的交给 Orbit 整理。
 * 大文本框 min-height 180
 */

const PLACEHOLDER =
  "例如：今天和老陈喝咖啡，他说下个月准备去杭州工作，我答应把租房网站发给他。";

const MAX_ATTACHMENTS = 6;

export interface RecordComposerProps {
  text: string;
  onTextChange: (value: string) => void;
  /**
   * 一起经历的所有人（多选）。
   *
   * 之前是"主人物 + 额外人物"两套状态，结果选择器只会覆盖主人物，
   * 第二个永远加不进来。现在只有这一份列表：选择器负责**追加**，
   * 已选的人在上面显示成可移除的标签。
   */
  personIds: string[];
  onPersonIdsChange: (value: string[]) => void;
  interactionDate: string;
  onDateChange: (value: string) => void;
  /** 地点：用户自己填，"那次在南湖公园的事"才好找回来。 */
  location: string;
  onLocationChange: (value: string) => void;
  attachments: string[];
  onAttachmentsChange: (value: string[]) => void;
  people: PersonSummary[];
  onSubmit: () => void;
  pending: boolean;
  /** 「先记下来」：不解析，直接存原文。 */
  onQuickSave: () => void;
  quickPending: boolean;
  error?: string;
  /** 记录时可选的心情表情。 */
  mood: string | null;
  onMoodChange: (value: string | null) => void;
  /** 「独处」：这条挂在"我"名下。和上面选的人是互斥的。 */
  isSolo: boolean;
  onSoloChange: (value: boolean) => void;
  selfAvatarUrl?: string | null;
}

export function RecordComposer({
  text,
  onTextChange,
  personIds,
  onPersonIdsChange,
  interactionDate,
  onDateChange,
  location,
  onLocationChange,
  attachments,
  onAttachmentsChange,
  people,
  onSubmit,
  pending,
  onQuickSave,
  quickPending,
  error,
  mood,
  onMoodChange,
  isSolo,
  onSoloChange,
  selfAvatarUrl = null,
}: RecordComposerProps) {
  const [uploading, setUploading] = useState(false);

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      toast.error(`最多 ${MAX_ATTACHMENTS} 张图片。`);
      return;
    }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, remaining)) {
        const result = await uploadsService.image(file);
        uploaded.push(result.url);
      }
      onAttachmentsChange([...attachments, ...uploaded]);
    } catch {
      console.error("[orbit] 图片上传失败");
      toast.error("图片暂时没能上传，可以先把记录保存下来。");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 pt-10 pb-16 md:px-0 md:pt-[120px]">
      <header className="flex flex-col gap-2">
        <h1 className="text-h2 text-ink">记录刚刚发生的事情</h1>
        <p className="text-body text-ink-3">写一句就够了，剩下的交给 Orbit 整理。</p>
      </header>

      <Textarea
        aria-label="记录内容"
        className="min-h-[180px]"
        placeholder={PLACEHOLDER}
        value={text}
        invalid={Boolean(error)}
        onChange={(event) => onTextChange(event.target.value)}
      />

      {/*
        规则解析器的触发词很有限，而用户看不到它们 ——
        结果就是"不管写什么都解析不出东西"，整页结构化能力形同不存在。
        把「什么话会被整理成什么」直接写出来，用户才知道该怎么写。
      */}
      <details className="rounded-md border border-line-subtle bg-surface px-4 py-3">
        <summary className="cursor-pointer text-sm text-ink-3 marker:content-none">
          哪些话会被整理成卡片？
        </summary>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-3">
          <li>
            <span className="text-ink-2">近况</span> —— 说 / 提到 / 最近 / 打算 / 准备
          </li>
          <li>
            <span className="text-ink-2">未完待续</span> —— 答应 / 记得 / 回头 / 下次
          </li>
          <li>
            <span className="text-ink-2">重要日期</span> —— 生日，或「日期 + 事情」
          </li>
          <li>
            <span className="text-ink-2">借还</span> —— 借 / 还
          </li>
          <li>
            <span className="text-ink-2">偏好</span> —— 喜欢 / 讨厌 / 最爱 / 想去
          </li>
        </ul>
        <p className="mt-2 text-sm text-ink-4">
          只写了「一起吃饭」这种纯动作时，会存成时间轴上的一条互动，不会生成上面这些卡片。
        </p>
      </details>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/*
        「独处」：记录不一定要和别人有关。
        选了它，这条就挂在"我"名下，星图上不出现新星，但会进自己的时间轴和回忆。
        和上面选的人是互斥的 —— 独处就是没有别人。
      */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={isSolo}
          onClick={() => {
            const next = !isSolo;
            onSoloChange(next);
            if (next) onPersonIdsChange([]);
          }}
          className={cn(
            "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-sm transition-colors duration-[140ms]",
            isSolo
              ? "border-accent-border bg-accent-soft text-ink"
              : "border-line-subtle bg-surface text-ink-3 hover:border-line hover:text-ink-2",
          )}
        >
          <Avatar name="我" src={selfAvatarUrl} size="xs" />
          独处 · 只记录我自己
        </button>
        <span className="text-sm text-ink-4">
          {isSolo
            ? "这条会记进你自己的时间轴，星图上不会多出一颗星。"
            : "一个人看的电影、跑完的步、随手记下的心情，都可以放这里。"}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="人物" hint="可选，可以选多个">
          {({ id, ...rest }) => {
            // 已经选过的人不再出现在下拉里，避免重复添加。
            const selectable = people.filter((item) => !personIds.includes(item.id));
            return (
              <div className="flex flex-col gap-2">
                {/* 已选的人显示成可移除的标签 —— 包括第一个人。 */}
                {personIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {personIds.map((selectedId) => {
                      const person = people.find((item) => item.id === selectedId);
                      return (
                        <span
                          key={selectedId}
                          className="inline-flex items-center gap-1 rounded-pill border border-accent-border bg-accent-soft py-0.5 pr-1 pl-2 text-sm text-ink"
                        >
                          <Avatar name={person?.name ?? "?"} src={person?.avatarUrl} size="xs" />
                          {person?.name ?? "?"}
                          <button
                            type="button"
                            aria-label={`移除 ${person?.name ?? ""}`}
                            onClick={() =>
                              onPersonIdsChange(personIds.filter((x) => x !== selectedId))
                            }
                            className="inline-flex size-4 items-center justify-center rounded-full text-ink-3 hover:text-ink"
                          >
                            <X className="size-3" aria-hidden />
                          </button>
                        </span>
                      );
                    })}
                    {personIds.length > 1 && (
                      <span className="text-sm text-ink-4">
                        会分别记进这 {personIds.length} 个人的档案
                      </span>
                    )}
                  </div>
                )}

                <PersonPicker
                  id={id}
                  {...rest}
                  people={selectable}
                  // 选择器只负责"追加"：本身的 value 永远是空的。
                  value={null}
                  onChange={(picked) => {
                    if (picked && !personIds.includes(picked)) {
                      onPersonIdsChange([...personIds, picked]);
                    }
                  }}
                  onCreateRequest={(seed) => useUiStore.getState().openCreatePerson(seed)}
                  placeholder={
                    selectable.length === 0 && people.length > 0
                      ? "所有人都选过了"
                      : "输入姓名、标签或星系…"
                  }
                  keepOpen
                />
              </div>
            );
          }}
        </Field>

        <Field label="地点" hint="可选">
          {({ id, ...rest }) => (
            <Input
              id={id}
              value={location}
              placeholder="例如：南湖公园"
              autoComplete="off"
              onChange={(event) => onLocationChange(event.target.value)}
              {...rest}
            />
          )}
        </Field>

        <Field label="时间">
          {({ id }) => (
            <Input
              id={id}
              type="date"
              value={interactionDate}
              onChange={(event) => onDateChange(event.target.value)}
            />
          )}
        </Field>

        <Field label="附件" hint="可选，最多 6 张">
          {({ id }) => (
            <div className="flex flex-wrap items-center gap-2">
              <input
                id={id}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => {
                  void onPickFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <Button
                variant="secondary"
                size="md"
                loading={uploading}
                icon={<Paperclip className="size-4" aria-hidden />}
                onClick={() => document.getElementById(id)?.click()}
              >
                选择图片
              </Button>
              {attachments.map((url) => (
                <span key={url} className="relative inline-flex">
                  <img src={url} alt="" className="size-10 rounded-sm object-cover" />
                  <button
                    type="button"
                    aria-label="移除这张图片"
                    onClick={() => onAttachmentsChange(attachments.filter((item) => item !== url))}
                    className="absolute -top-1.5 -right-1.5 inline-flex size-4 items-center justify-center rounded-full bg-elevated text-ink-3 hover:text-ink"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>
      </div>

      {/* 落点确认：一条记录到底会进谁的档案，说清楚。 */}
      {isSolo ? (
        <div className="flex items-center gap-2">
          <Avatar name="我" src={selfAvatarUrl} size="sm" />
          <span className="text-sm text-ink-2">
            这条会记进你自己的时间轴，星图上不会多出一颗星
          </span>
        </div>
      ) : (
        personIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-2">
              {personIds.length === 1
                ? "这次记录会放进 "
                : `这次记录会分别放进这 ${personIds.length} 个人的档案：`}
            </span>
            {personIds.map((selectedId) => {
              const person = people.find((item) => item.id === selectedId);
              if (!person) return null;
              return (
                <span key={selectedId} className="inline-flex items-center gap-1.5">
                  <Avatar name={person.name} src={person.avatarUrl} size="xs" />
                  <span className="text-sm text-ink-2">{person.name}</span>
                </span>
              );
            })}
          </div>
        )
      )}

      <div className="flex flex-wrap items-center gap-3">
        <EmojiPicker value={mood} onChange={onMoodChange} placeholder="这一刻的心情" />
        <span className="text-sm text-ink-4">可选，之后在回忆里一眼就能看到。</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          loading={pending}
          disabled={pending || text.trim().length === 0}
          onClick={onSubmit}
        >
          整理一下 →
        </Button>
        {/*
          「先记下来」：不走解析，直接存原文。
          用户只想先把事情记下来时，不该被迫先确认近况和日期。
        */}
        <Button
          variant="secondary"
          size="lg"
          loading={quickPending}
          disabled={pending || quickPending || text.trim().length === 0}
          onClick={onQuickSave}
        >
          先记下来
        </Button>
        <span className="text-sm text-ink-4">
          先记下来会原样保存这句话，之后随时可以补充整理。
        </span>
      </div>
    </div>
  );
}
