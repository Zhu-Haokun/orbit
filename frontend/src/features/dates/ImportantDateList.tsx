import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  useCreateImportantDate,
  useDeleteImportantDate,
  useUpdateImportantDate,
} from "@/hooks/useRecords";
import { ApiError } from "@/lib/api";
import { formatImportantDate } from "@/lib/format";
import { blankToNull, collectIssues, importantDateSchema } from "@/lib/validation";
import type { DatePrecision, ImportantDate, PersonDetail, RepeatType } from "@/types";

/**
 * 规范 §24 重要日期
 * 横向小卡片；支持精确日期与模糊日期（exact / month / season / text）。
 * 每年重复的日期显示「每年」徽标。
 */

const FORM_ID = "important-date-form";

const PRECISION_OPTIONS: ReadonlyArray<{ value: DatePrecision; label: string }> = [
  { value: "exact", label: "精确日期" },
  { value: "month", label: "只有月份" },
  { value: "season", label: "大概季节" },
  { value: "text", label: "只有文字" },
];

interface DateFormState {
  title: string;
  datePrecision: DatePrecision;
  date: string;
  dateText: string;
  repeatType: RepeatType;
}

function emptyDateForm(): DateFormState {
  return { title: "", datePrecision: "exact", date: "", dateText: "", repeatType: "none" };
}

function dateFormFrom(item: ImportantDate): DateFormState {
  return {
    title: item.title,
    datePrecision: item.datePrecision,
    date: item.date ? (item.datePrecision === "month" ? item.date.slice(0, 7) : item.date.slice(0, 10)) : "",
    dateText: item.dateText ?? "",
    repeatType: item.repeatType,
  };
}

function ImportantDateFormModal({
  open,
  personId,
  editing,
  onClose,
}: {
  open: boolean;
  personId: string;
  editing: ImportantDate | null;
  onClose: () => void;
}) {
  const create = useCreateImportantDate();
  const update = useUpdateImportantDate();
  const [values, setValues] = useState<DateFormState>(emptyDateForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setValues(editing ? dateFormFrom(editing) : emptyDateForm());
    setErrors({});
  }, [open, editing]);

  const onChange = <K extends keyof DateFormState>(key: K, value: DateFormState[K]) => {
    setValues((prev) => {
      const next: DateFormState = { ...prev };
      next[key] = value;
      return next;
    });
  };

  const onPrecisionChange = (precision: DatePrecision) =>
    setValues((prev) => ({ ...prev, datePrecision: precision, date: "", dateText: "" }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const monthValue = values.datePrecision === "month" && values.date ? `${values.date}-01` : values.date;
    const parsed = importantDateSchema.safeParse({
      personId,
      title: values.title,
      datePrecision: values.datePrecision,
      date: monthValue,
      dateText: values.dateText,
      repeatType: values.repeatType,
    });
    if (!parsed.success) {
      setErrors(collectIssues(parsed.error));
      return;
    }
    setErrors({});
    const title = parsed.data.title;
    const datePrecision = parsed.data.datePrecision;
    const repeatType = parsed.data.repeatType;
    const date = blankToNull(parsed.data.date);
    const dateText = blankToNull(parsed.data.dateText);
    const onError = (cause: unknown) =>
      setErrors({
        form: cause instanceof ApiError ? cause.message : "暂时没能完成这次操作，请稍后再试。",
      });
    const onSuccess = () => onClose();

    if (editing) {
      update.mutate({ id: editing.id, patch: { title, datePrecision, repeatType, date, dateText } }, { onSuccess, onError });
    } else {
      create.mutate({ personId, title, datePrecision, repeatType, date, dateText }, { onSuccess, onError });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "编辑重要日期" : "添加重要日期"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={FORM_ID}
            loading={create.isPending || update.isPending}
          >
            保存
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <Field label="名称" required error={errors.title}>
          {({ id, ...rest }) => (
            <Input
              id={id}
              value={values.title}
              placeholder="例如：生日"
              autoComplete="off"
              onChange={(event) => onChange("title", event.target.value)}
              {...rest}
            />
          )}
        </Field>

        <Field label="精度">
          {({ id, ...rest }) => (
            <Select
              id={id}
              value={values.datePrecision}
              onChange={(event) => onPrecisionChange(event.target.value as DatePrecision)}
              {...rest}
            >
              {PRECISION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {values.datePrecision === "exact" && (
          <Field label="日期">
            {({ id, ...rest }) => (
              <Input
                id={id}
                type="date"
                value={values.date}
                onChange={(event) => onChange("date", event.target.value)}
                {...rest}
              />
            )}
          </Field>
        )}

        {values.datePrecision === "month" && (
          <Field label="月份">
            {({ id, ...rest }) => (
              <Input
                id={id}
                type="month"
                value={values.date}
                onChange={(event) => onChange("date", event.target.value)}
                {...rest}
              />
            )}
          </Field>
        )}

        {values.datePrecision === "season" && (
          <Field label="季节" hint="例如：春天、秋天。">
            {({ id, ...rest }) => (
              <Input
                id={id}
                value={values.dateText}
                placeholder="例如：春天"
                autoComplete="off"
                onChange={(event) => onChange("dateText", event.target.value)}
                {...rest}
              />
            )}
          </Field>
        )}

        {values.datePrecision === "text" && (
          <Field label="时间" hint="只记一句你记得的话。">
            {({ id, ...rest }) => (
              <Input
                id={id}
                value={values.dateText}
                placeholder="例如：去年秋天"
                autoComplete="off"
                onChange={(event) => onChange("dateText", event.target.value)}
                {...rest}
              />
            )}
          </Field>
        )}

        <Checkbox
          checked={values.repeatType === "yearly"}
          onChange={(next) => onChange("repeatType", next ? "yearly" : "none")}
          label="每年重复"
          hint="生日、纪念日这类每年都会回来的日子。"
        />

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      </form>
    </Modal>
  );
}

export function ImportantDateList({ person }: { person: PersonDetail }) {
  const remove = useDeleteImportantDate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ImportantDate | null>(null);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (item: ImportantDate) => {
    setEditing(item);
    setOpen(true);
  };

  return (
    <section className="flex flex-col gap-4">
      <CardHeader>
        <CardTitle>重要日期</CardTitle>
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden />} onClick={openCreate}>
          添加
        </Button>
      </CardHeader>

      {person.importantDates.length === 0 ? (
        <EmptyState
          compact
          title="还没有记录重要日期。"
          action={{ label: "添加一条", onClick: openCreate }}
        />
      ) : (
        <ul className="flex flex-wrap gap-3">
          {person.importantDates.map((item) => (
            <Card
              as="li"
              key={item.id}
              tone="soft"
              className="flex w-[152px] shrink-0 flex-col gap-2 p-3"
            >
              <button
                type="button"
                onClick={() => openEdit(item)}
                className="flex flex-col items-start gap-0.5 text-left"
              >
                <span className="text-h3 text-ink">
                  {formatImportantDate(item.date, item.datePrecision, item.dateText)}
                </span>
                <span className="text-sm text-ink-2">{item.title}</span>
              </button>
              <div className="flex items-center justify-between gap-2">
                {item.repeatType === "yearly" ? <Badge>每年</Badge> : <span aria-hidden />}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`删除重要日期：${item.title}`}
                  icon={<Trash2 className="size-3.5" aria-hidden />}
                  onClick={() => remove.mutate(item.id)}
                />
              </div>
            </Card>
          ))}
        </ul>
      )}

      <ImportantDateFormModal
        open={open}
        personId={person.id}
        editing={editing}
        onClose={() => setOpen(false)}
      />
    </section>
  );
}
