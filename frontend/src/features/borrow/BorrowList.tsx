import { useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  useCreateBorrowRecord,
  useDeleteBorrowRecord,
  useUpdateBorrowRecord,
} from "@/hooks/useRecords";
import { ApiError } from "@/lib/api";
import { formatMonthDay, todayKey } from "@/lib/format";
import { blankToNull, borrowRecordSchema, collectIssues } from "@/lib/validation";
import type { BorrowDirection, BorrowRecord, BorrowStatus, PersonDetail } from "@/types";

/**
 * 规范 §26 借还
 * 每条记录一张卡片：物品、方向、日期、状态。
 * 状态只用语义色描边徽标，不做大面积填充；不出现「逾期」。
 */

const FORM_ID = "borrow-record-form";

const STATUS_META: Record<BorrowStatus, { label: string; tone: BadgeTone }> = {
  open: { label: "尚未归还", tone: "neutral" },
  returned: { label: "已归还", tone: "success" },
  cancelled: { label: "已取消", tone: "neutral" },
};

const DIRECTION_VALUES: ReadonlyArray<BorrowDirection> = ["lent_to", "borrowed_from"];

function directionLabel(direction: BorrowDirection, name: string): string {
  return direction === "lent_to" ? `我借给${name}` : `${name}借给我`;
}

interface BorrowFormState {
  direction: BorrowDirection;
  itemName: string;
  borrowDate: string;
  expectedReturnDate: string;
  notes: string;
}

function emptyBorrowForm(): BorrowFormState {
  return {
    direction: "lent_to",
    itemName: "",
    borrowDate: todayKey(),
    expectedReturnDate: "",
    notes: "",
  };
}

function borrowFormFrom(item: BorrowRecord): BorrowFormState {
  return {
    direction: item.direction,
    itemName: item.itemName,
    borrowDate: item.borrowDate.slice(0, 10),
    expectedReturnDate: item.expectedReturnDate ? item.expectedReturnDate.slice(0, 10) : "",
    notes: item.notes ?? "",
  };
}

function BorrowFormModal({
  open,
  personId,
  personName,
  editing,
  onClose,
}: {
  open: boolean;
  personId: string;
  personName: string;
  editing: BorrowRecord | null;
  onClose: () => void;
}) {
  const create = useCreateBorrowRecord();
  const update = useUpdateBorrowRecord();
  const [values, setValues] = useState<BorrowFormState>(emptyBorrowForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setValues(editing ? borrowFormFrom(editing) : emptyBorrowForm());
    setErrors({});
  }, [open, editing]);

  const onChange = <K extends keyof BorrowFormState>(key: K, value: BorrowFormState[K]) => {
    setValues((prev) => {
      const next: BorrowFormState = { ...prev };
      next[key] = value;
      return next;
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = borrowRecordSchema.safeParse({ personId, ...values });
    if (!parsed.success) {
      setErrors(collectIssues(parsed.error));
      return;
    }
    setErrors({});
    const patch = {
      direction: parsed.data.direction,
      itemName: parsed.data.itemName,
      borrowDate: parsed.data.borrowDate,
      expectedReturnDate: blankToNull(parsed.data.expectedReturnDate),
      notes: blankToNull(parsed.data.notes),
    };
    const onError = (cause: unknown) =>
      setErrors({
        form: cause instanceof ApiError ? cause.message : "暂时没能完成这次操作，请稍后再试。",
      });
    const onSuccess = () => onClose();

    if (editing) {
      update.mutate({ id: editing.id, patch }, { onSuccess, onError });
    } else {
      create.mutate({ personId, ...patch }, { onSuccess, onError });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "编辑借还" : "添加借还"}
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
        <Field label="方向">
          {({ id, ...rest }) => (
            <Select
              id={id}
              value={values.direction}
              onChange={(event) => onChange("direction", event.target.value as BorrowDirection)}
              {...rest}
            >
              {DIRECTION_VALUES.map((value) => (
                <option key={value} value={value}>
                  {directionLabel(value, personName)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="物品" required error={errors.itemName}>
          {({ id, ...rest }) => (
            <Input
              id={id}
              value={values.itemName}
              placeholder="例如：50mm 镜头"
              autoComplete="off"
              onChange={(event) => onChange("itemName", event.target.value)}
              {...rest}
            />
          )}
        </Field>

        <Field label="借出日期" error={errors.borrowDate}>
          {({ id, ...rest }) => (
            <Input
              id={id}
              type="date"
              value={values.borrowDate}
              onChange={(event) => onChange("borrowDate", event.target.value)}
              {...rest}
            />
          )}
        </Field>

        <Field label="预计归还" hint="不确定就留空。">
          {({ id, ...rest }) => (
            <Input
              id={id}
              type="date"
              value={values.expectedReturnDate}
              onChange={(event) => onChange("expectedReturnDate", event.target.value)}
              {...rest}
            />
          )}
        </Field>

        <Field label="备注">
          {({ id, ...rest }) => (
            <Input
              id={id}
              value={values.notes}
              autoComplete="off"
              onChange={(event) => onChange("notes", event.target.value)}
              {...rest}
            />
          )}
        </Field>

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      </form>
    </Modal>
  );
}

export function BorrowList({ person }: { person: PersonDetail }) {
  const remove = useDeleteBorrowRecord();
  const update = useUpdateBorrowRecord();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BorrowRecord | null>(null);

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (item: BorrowRecord) => {
    setEditing(item);
    setOpen(true);
  };

  return (
    <section className="flex flex-col gap-4">
      <CardHeader>
        <CardTitle>借还</CardTitle>
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden />} onClick={openCreate}>
          添加
        </Button>
      </CardHeader>

      {person.borrowRecords.length === 0 ? (
        <EmptyState
          compact
          title="没有正在借还的东西。"
          action={{ label: "添加一条", onClick: openCreate }}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {person.borrowRecords.map((item) => (
            <Card as="li" key={item.id} tone="soft" className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-body text-ink">{item.itemName}</p>
                  <p className="text-sm text-ink-2">{directionLabel(item.direction, person.name)}</p>
                </div>
                <Badge tone={STATUS_META[item.status].tone}>{STATUS_META[item.status].label}</Badge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm text-ink-3">{formatMonthDay(item.borrowDate)}</p>
                <div className="flex items-center gap-1">
                  {item.status === "open" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => update.mutate({ id: item.id, patch: { status: "returned" } })}
                    >
                      标记已归还
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                    编辑
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(item.id)}>
                    删除
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}

      <BorrowFormModal
        open={open}
        personId={person.id}
        personName={person.name}
        editing={editing}
        onClose={() => setOpen(false)}
      />
    </section>
  );
}
