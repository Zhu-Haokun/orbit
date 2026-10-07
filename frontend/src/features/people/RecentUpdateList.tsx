import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateUpdate, useUpdateUpdate } from "@/hooks/useRecords";
import { ApiError } from "@/lib/api";
import { formatMonthDay } from "@/lib/format";
import { toast } from "@/stores/toastStore";
import type { PersonDetail, PersonUpdate } from "@/types";

/**
 * 规范 §22 最近近况
 * 标题「最近」，最多 4 条；只展示内容与来源日期。
 * 规范 §22: 不要显示 AI 置信度。
 *
 * 「近况」= 这个人最近的状态（在准备什么、最近在忙什么），
 * 和「互动」不是一回事：互动是"某天发生的一件事"，近况是从那件事里提炼出的状态。
 * 所以标题下面必须写清楚，否则第一次用的人不知道这一栏是干嘛的。
 */

const MAX_ITEMS = 4;

export function RecentUpdateList({ person }: { person: PersonDetail }) {
  const update = useUpdateUpdate(person.id);
  const create = useCreateUpdate();
  // 自己的档案里说"这个人"很怪。
  const isSelf = person.isSelf;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const items = person.updates.filter((item) => item.status === "active").slice(0, MAX_ITEMS);

  const onError = (cause: unknown) =>
    toast.error(cause instanceof ApiError ? cause.message : "暂时没能完成这次操作，请稍后再试。");

  const sourceLabel = (item: PersonUpdate) => {
    const source = item.sourceInteractionId
      ? person.interactions.find((interaction) => interaction.id === item.sourceInteractionId)
      : undefined;
    // 手动写的近况没有来源记录，别硬说成"来自某天的记录"。
    if (!source) return `手动添加 · ${formatMonthDay(item.createdAt)}`;
    return `来自 ${formatMonthDay(source.interactionDate)} 的记录`;
  };

  const startEdit = (item: PersonUpdate) => {
    setAdding(false);
    setEditingId(item.id);
    setDraft(item.content);
    setError(null);
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setDraft("");
    setError(null);
  };

  const closeEditor = () => {
    setAdding(false);
    setEditingId(null);
    setError(null);
  };

  const save = (id: string) => {
    const content = draft.trim();
    if (!content) {
      setError("写一句近况吧");
      return;
    }
    update.mutate(
      { id, patch: { content } },
      {
        onSuccess: closeEditor,
        onError,
      },
    );
  };

  const saveNew = () => {
    const content = draft.trim();
    if (!content) {
      setError("写一句近况吧");
      return;
    }
    create.mutate(
      { personId: person.id, content },
      {
        onSuccess: () => {
          closeEditor();
          toast.success("已经记下了");
        },
        onError,
      },
    );
  };

  const editor = (onSave: () => void, saving: boolean, label: string) => (
    <>
      <Textarea
        rows={2}
        value={draft}
        autoFocus
        aria-label={label}
        invalid={Boolean(error)}
        placeholder="例如：最近在准备考研"
        onChange={(event) => setDraft(event.target.value)}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" loading={saving} onClick={onSave}>
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={closeEditor}>
          取消
        </Button>
      </div>
    </>
  );

  return (
    <section className="flex flex-col gap-4">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle>最近</CardTitle>
          <p className="text-sm text-ink-4">
            {isSelf
              ? "我最近的状态，比如「在准备考研」「最近在看房」。可以和一次记录一起产生，也可以单独写。"
              : "这个人最近的状态，比如「在准备考研」「最近在看房」。可以和一次记录一起产生，也可以单独写。"}
          </p>
        </div>
        {!adding && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus className="size-3.5" aria-hidden />}
            onClick={startAdd}
          >
            添加
          </Button>
        )}
      </CardHeader>

      {adding && (
        <Card tone="soft">
          <div className="flex flex-col gap-2 px-4 py-3">{editor(saveNew, create.isPending, "新近况")}</div>
        </Card>
      )}

      {items.length === 0 && !adding ? (
        <EmptyState
          compact
          title={isSelf ? "还没有记录状态。" : "还没有记录近况。"}
          description={
            isSelf
              ? "不是「某天发生了什么」，而是我最近处在什么状态。"
              : "近况不是「某天发生了什么」，而是他最近处在什么状态。"
          }
          action={{ label: "添加一条", onClick: startAdd }}
        />
      ) : (
        items.length > 0 && (
          <Card tone="soft">
            <ul className="flex flex-col divide-y divide-line-subtle">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 px-4 py-3">
                  {editingId === item.id ? (
                    editor(() => save(item.id), update.isPending, "近况内容")
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
                              update.mutate(
                                { id: item.id, patch: { status: "archived" } },
                                { onError },
                              )
                            }
                          >
                            归档
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )
      )}
    </section>
  );
}
