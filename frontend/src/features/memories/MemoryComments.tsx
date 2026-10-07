import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Send, X } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { useCreateComment, useDeleteComment } from "@/hooks/useMe";
import { cn } from "@/lib/cn";
import { formatMonthDay } from "@/lib/format";
import { toast } from "@/stores/toastStore";
import type { MemoryComment, MemoryItem } from "@/types";

/**
 * 回忆下面的评论（需求："回看以前的时候可能会被触动，想简单说一句"）。
 *
 * 评论和互动分开：互动是"当时发生了什么"，评论是"现在回头看我想说什么"。
 * 所以它是后加的，不动原始记录，也可以带一个心情表情。
 */

function CommentRow({ comment, onDelete }: { comment: MemoryComment; onDelete: () => void }) {
  return (
    <li className="group flex items-start gap-2 py-1.5">
      {comment.emoji && <span className="text-base leading-6">{comment.emoji}</span>}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-body text-ink-2">{comment.content}</p>
        <span className="text-micro text-ink-4 tabular-nums">
          {formatMonthDay(comment.createdAt)}
        </span>
      </div>
      <button
        type="button"
        aria-label="删除这条评论"
        onClick={onDelete}
        className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-4 opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
      >
        <X className="size-3" aria-hidden />
      </button>
    </li>
  );
}

export function MemoryComments({ item }: { item: MemoryItem }) {
  const create = useCreateComment();
  const remove = useDeleteComment();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);

  const comments = item.comments ?? [];

  const submit = () => {
    const content = draft.trim();
    if (!content) return;
    create.mutate(
      { interactionId: item.interactionId, input: { content, emoji } },
      {
        onSuccess: () => {
          setDraft("");
          setEmoji(null);
          setOpen(false);
        },
        onError: () => toast.error("暂时没能保存这条评论。"),
      },
    );
  };

  return (
    <div className="flex flex-col gap-1">
      {comments.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-subtle/60">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              onDelete={() =>
                remove.mutate(
                  { interactionId: item.interactionId, commentId: comment.id },
                  { onError: () => toast.error("暂时没能删除这条评论。") },
                )
              }
            />
          ))}
        </ul>
      )}

      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-line-subtle bg-surface p-2">
          <textarea
            rows={2}
            autoFocus
            value={draft}
            aria-label="写一句评论"
            placeholder="现在回头看，想说点什么…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
              if (event.key === "Escape") setOpen(false);
            }}
            className="w-full resize-none bg-transparent text-body text-ink outline-none placeholder:text-ink-4"
          />
          <div className="flex items-center justify-between gap-2">
            <EmojiPicker value={emoji} onChange={setEmoji} placeholder="心情（可选）" />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={create.isPending}
                disabled={draft.trim().length === 0}
                icon={<Send className="size-3.5" aria-hidden />}
                onClick={submit}
              >
                留下
              </Button>
            </div>
          </div>
        </div>
      ) : comments.length > 0 ? (
        // 已有评论：把入口做成"评论数 + 最近一句"，它就不再是空动作。
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full flex-col gap-1 rounded-md bg-surface/60 px-3 py-2 text-left transition-colors duration-[140ms] hover:bg-hover-fill"
        >
          <span className="inline-flex items-center gap-1.5 text-sm text-ink-3">
            <MessageCircle className="size-3.5" aria-hidden />
            {comments.length} 条评论
          </span>
          <span className="truncate text-sm text-ink-2">
            {comments[comments.length - 1]!.emoji ? `${comments[comments.length - 1]!.emoji} ` : ""}
            {comments[comments.length - 1]!.content}
          </span>
        </button>
      ) : (
        /*
         * 一条评论都没有时不主动索取输入：
         * 39 条记录都挂一句"说点什么"会变成 39 次重复的低对比噪声，
         * 每条记忆都像等待补填的表单。桌面端只在 hover / 键盘聚焦时出现，
         * 移动端（没有 hover）保持常驻但更轻。
         */
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-sm text-sm text-ink-4 transition-opacity duration-[140ms] hover:text-ink-2 focus-visible:opacity-100",
            "opacity-0 group-hover/memory:opacity-100 max-md:opacity-60",
          )}
        >
          <MessageCircle className="size-3.5" aria-hidden />
          说点什么
        </button>
      )}
    </div>
  );
}

/**
 * 回忆里的人物行。
 *
 * 之前只是一行 12px 的灰字，存在感太弱 —— 而"和谁"本来就是这段回忆最重要的信息。
 * 现在用头像 + 名字，并把「独处」单独标出来。
 */
export function MemoryPeople({ item }: { item: MemoryItem }) {
  const navigate = useNavigate();

  if (item.isSelf) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-ink-3">
        <span className="inline-flex size-1.5 rounded-full bg-accent" aria-hidden />
        独处 · 只有我自己
      </p>
    );
  }

  if (item.people.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {item.people.map((person) => (
        <li key={person.id}>
          {/* 人物名可点击：进入人物摘要。让每条记忆都不是"死文本"。 */}
          <button
            type="button"
            onClick={() => navigate(`/people/${person.id}`)}
            className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 transition-colors duration-[140ms] hover:bg-hover-fill"
          >
            <Avatar name={person.name} src={person.avatarUrl} size="xs" />
            <span className="text-body text-ink">{person.name}</span>
            {person.relationshipLabel && (
              <span className="text-sm text-ink-4">{person.relationshipLabel}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
