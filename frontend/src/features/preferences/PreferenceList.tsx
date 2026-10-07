import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useCreatePreference, useDeletePreference } from "@/hooks/useRecords";
import { ApiError } from "@/lib/api";
import { collectIssues, preferenceSchema } from "@/lib/validation";
import type { PersonDetail, PreferenceCategory } from "@/types";

/**
 * 规范 §25 偏好
 * 固定分组顺序，只渲染非空分组；不自动推断，只来自用户手动添加。
 */

const FORM_ID = "preference-form";

const CATEGORIES: ReadonlyArray<{ value: PreferenceCategory; label: string }> = [
  { value: "like", label: "喜欢" },
  { value: "dislike", label: "不喜欢" },
  { value: "wish", label: "最近想要" },
  { value: "interest", label: "兴趣" },
  { value: "food", label: "口味" },
  { value: "other", label: "其他" },
];

function PreferenceFormModal({
  open,
  personId,
  onClose,
}: {
  open: boolean;
  personId: string;
  onClose: () => void;
}) {
  const create = useCreatePreference();
  const [category, setCategory] = useState<PreferenceCategory>("like");
  const [content, setContent] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = preferenceSchema.safeParse({ personId, category, content });
    if (!parsed.success) {
      setErrors(collectIssues(parsed.error));
      return;
    }
    setErrors({});
    create.mutate(
      { personId, category: parsed.data.category, content: parsed.data.content },
      {
        onSuccess: () => {
          setContent("");
          onClose();
        },
        onError: (error) =>
          setErrors({
            form: error instanceof ApiError ? error.message : "暂时没能完成这次操作，请稍后再试。",
          }),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="添加偏好"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={create.isPending}>
            保存
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <Field label="分组">
          {({ id, ...rest }) => (
            <Select
              id={id}
              value={category}
              onChange={(event) => setCategory(event.target.value as PreferenceCategory)}
              {...rest}
            >
              {CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="内容" required error={errors.content}>
          {({ id, ...rest }) => (
            <Input
              id={id}
              value={content}
              placeholder="例如：胶片摄影"
              autoComplete="off"
              onChange={(event) => setContent(event.target.value)}
              {...rest}
            />
          )}
        </Field>

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      </form>
    </Modal>
  );
}

export function PreferenceList({ person }: { person: PersonDetail }) {
  const remove = useDeletePreference();
  const [open, setOpen] = useState(false);

  const grouped = CATEGORIES.map(({ value, label }) => ({
    value,
    label,
    items: person.preferences.filter((item) => item.category === value),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="flex flex-col gap-4">
      <CardHeader>
        <CardTitle>偏好</CardTitle>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus className="size-4" aria-hidden />}
          onClick={() => setOpen(true)}
        >
          添加
        </Button>
      </CardHeader>

      {grouped.length === 0 ? (
        <EmptyState
          compact
          title="还没有记录偏好。"
          action={{ label: "添加一条", onClick: () => setOpen(true) }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((group) => (
            <div key={group.value} className="flex flex-col gap-2">
              <p className="text-sm text-ink-3">{group.label}</p>
              <ul className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-line-subtle px-3 text-sm text-ink-2"
                  >
                    {item.content}
                    <button
                      type="button"
                      aria-label={`删除偏好：${item.content}`}
                      onClick={() => remove.mutate(item.id)}
                      className="inline-flex text-ink-4 transition-colors duration-[140ms] hover:text-ink"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <PreferenceFormModal open={open} personId={person.id} onClose={() => setOpen(false)} />
    </section>
  );
}
