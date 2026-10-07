import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { RoundCheck } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Textarea";
import {
  useCompleteCommitment,
  useCreateCommitment,
  useDeleteCommitment,
  usePostponeCommitment,
  useUpdateCommitment,
} from "@/hooks/useRecords";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMonthDay } from "@/lib/format";
import { collectIssues, commitmentSchema } from "@/lib/validation";
import { toast } from "@/stores/toastStore";
import type { Commitment, PersonDetail } from "@/types";

/**
 * 规范 §23 未完待续
 * 圆点 checkbox + 柔和卡片；操作：完成 / 编辑 / 稍后 / 删除。
 * 规范 §54.1: 点击后圆点变勾 → 文本 opacity 下降 → 500ms 后折叠到已完成区。
 * 规范 §23: 禁止鲜红色「逾期」。
 * toast「这件事告一段落了」由 useCompleteCommitment 负责，这里不重复。
 */

const COLLAPSE_DELAY = 500;

export function CommitmentList({ person }: { person: PersonDetail }) {
  const complete = useCompleteCommitment();
  const postpone = usePostponeCommitment();
  const remove = useDeleteCommitment();
  const update = useUpdateCommitment();
  const create = useCreateCommitment();

  const timers = useRef<number[]>([]);
  const [justDone, setJustDone] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  // 以前「未完待续」只能由记录解析产生，用户没法自己补一条。
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const unfinished = person.commitments.filter(
    (item) => item.status === "open" || item.status === "later",
  );
  const finished = person.commitments.filter((item) => item.status === "done");

  const onError = (cause: unknown) =>
    toast.error(cause instanceof ApiError ? cause.message : "暂时没能完成这次操作，请稍后再试。");

  const sourceLabel = (item: Commitment) => {
    const source = item.sourceInteractionId
      ? person.interactions.find((interaction) => interaction.id === item.sourceInteractionId)
      : undefined;
    return `${formatMonthDay(source?.interactionDate ?? item.createdAt)}记录`;
  };

  const onCheck = (id: string) => {
    setJustDone((prev) => (prev.includes(id) ? prev : [...prev, id]));
    const timer = window.setTimeout(() => complete.mutate(id), COLLAPSE_DELAY);
    timers.current.push(timer);
  };

  const startEdit = (item: Commitment) => {
    setAdding(false);
    setEditingId(item.id);
    setDraft(item.content);
    setErrors({});
  };

  /** 手动补一条未完待续（产品升级文档 P0-4：空模块要能就地添加）。 */
  const addCommitment = () => {
    const content = newContent.trim();
    if (!content) {
      setAddError("写一句还没说完的事吧");
      return;
    }
    create.mutate(
      { personId: person.id, content, status: "open" },
      {
        onSuccess: () => {
          setNewContent("");
          setAdding(false);
          setAddError(null);
          toast.success("记下了");
        },
        onError: (cause) =>
          setAddError(cause instanceof ApiError ? cause.message : "暂时没能保存，稍后再试。"),
      },
    );
  };

  const save = (item: Commitment) => {
    const parsed = commitmentSchema.safeParse({
      personId: person.id,
      content: draft,
      dueText: item.dueText ?? "",
      dueDate: item.dueDate ?? "",
    });
    if (!parsed.success) {
      setErrors(collectIssues(parsed.error));
      return;
    }
    update.mutate(
      { id: item.id, patch: { content: parsed.data.content } },
      {
        onSuccess: () => {
          setEditingId(null);
          setErrors({});
        },
        onError,
      },
    );
  };

  return (
    <section className="flex flex-col gap-4">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>未完待续</CardTitle>
        </div>
        {!adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            添加
          </Button>
        )}
      </CardHeader>

      {adding && (
        <Card tone="soft">
          <div className="flex flex-col gap-2 px-4 py-3">
            <Textarea
              rows={2}
              autoFocus
              value={newContent}
              aria-label="新的未完待续"
              placeholder="例如：下次见面把照片发给她"
              invalid={Boolean(addError)}
              onChange={(event) => {
                setNewContent(event.target.value);
                setAddError(null);
              }}
            />
            {addError && <p className="text-sm text-danger">{addError}</p>}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="primary" loading={create.isPending} onClick={addCommitment}>
                保存
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setNewContent("");
                  setAddError(null);
                }}
              >
                取消
              </Button>
            </div>
          </div>
        </Card>
      )}

      {unfinished.length === 0 && !adding ? (
        <EmptyState
          compact
          title="暂时没有没说完的事情。"
          description="想到了什么就记一句，下次见面之前不会再忘。"
          action={{ label: "添加一条", onClick: () => setAdding(true) }}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {unfinished.map((item) => {
            const checked = justDone.includes(item.id);
            return (
              <Card as="li" key={item.id} tone="soft" className="flex items-start gap-3 px-4 py-3">
                <RoundCheck
                  size="sm"
                  checked={checked}
                  onChange={() => onCheck(item.id)}
                  label={`完成：${item.content}`}
                />
                <div
                  className={cn(
                    "flex min-w-0 flex-1 flex-col gap-2 transition-opacity duration-[140ms]",
                    checked && "opacity-50",
                  )}
                >
                  {editingId === item.id ? (
                    <>
                      <Textarea
                        rows={2}
                        value={draft}
                        aria-label="未完待续内容"
                        invalid={Boolean(errors.content)}
                        onChange={(event) => setDraft(event.target.value)}
                      />
                      {errors.content && <p className="text-sm text-danger">{errors.content}</p>}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          loading={update.isPending}
                          onClick={() => save(item)}
                        >
                          保存
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          取消
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-body text-ink">{item.content}</p>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="text-sm text-ink-3">{sourceLabel(item)}</p>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(item)}>
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              postpone.mutate(item.id, {
                                onSuccess: () => setJustDone((prev) => prev.filter((id) => id !== item.id)),
                                onError,
                              })
                            }
                          >
                            稍后
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove.mutate(item.id, { onError })}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </ul>
      )}

      {finished.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-3">已完成</p>
          <ul className="flex flex-col gap-1">
            {finished.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-4 py-1.5 opacity-60">
                <span
                  aria-hidden
                  className="mt-[3px] inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-accent-border text-accent"
                >
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
                <span className="text-body text-ink-2">{item.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
