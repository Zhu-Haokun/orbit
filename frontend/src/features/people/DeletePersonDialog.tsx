import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useDeletePerson } from "@/hooks/usePeople";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { toast } from "@/stores/toastStore";
import type { PersonDetail } from "@/types";

/**
 * 规范 §58 删除策略
 * 危险操作：dismissible=false —— Esc 与点击遮罩都不关闭。
 * V1 只实现「删除人物与所有相关记录」，但 UI 必须把两个选项都说清楚。
 */

type DeleteMode = "profile-only" | "full";

const RADIO_CLASS = "mt-[3px] size-4 shrink-0 [accent-color:var(--accent)]";

export interface DeletePersonDialogProps {
  person: PersonDetail;
  open: boolean;
  onClose: () => void;
}

export function DeletePersonDialog({ person, open, onClose }: DeletePersonDialogProps) {
  const navigate = useNavigate();
  const deletePerson = useDeletePerson();
  const [mode, setMode] = useState<DeleteMode>("full");

  useEffect(() => {
    if (open) setMode("full");
  }, [open, person.id]);

  const onConfirm = () => {
    if (mode !== "full") return;
    deletePerson.mutate(person.id, {
      // useDeletePerson 自己会 toast「已删除」。
      onSuccess: () => navigate("/galaxy"),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "暂时没能完成这次操作，请稍后再试。"),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      dismissible={false}
      showClose={false}
      title={`删除“${person.name}”？`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={mode !== "full"}
            loading={deletePerson.isPending}
          >
            删除
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink-2">你可以选择：</p>

        <div className="flex flex-col gap-3" role="radiogroup" aria-label="删除方式">
          <div className="flex cursor-not-allowed items-start gap-3 rounded-md border border-line-subtle px-3 py-3 opacity-50">
            <input
              type="radio"
              name="delete-person-mode"
              value="profile-only"
              className={RADIO_CLASS}
              checked={false}
              readOnly
              disabled
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body text-ink">只删除人物档案，保留已匿名化的互动</span>
              <span className="text-sm text-ink-3">V1 暂不支持</span>
            </span>
          </div>

          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3",
              "transition-colors duration-[140ms]",
              mode === "full"
                ? "border-accent-border bg-accent-soft"
                : "border-line-subtle hover:border-line",
            )}
          >
            <input
              type="radio"
              name="delete-person-mode"
              value="full"
              className={RADIO_CLASS}
              checked={mode === "full"}
              onChange={() => setMode("full")}
            />
            <span className="text-body text-ink">删除人物与所有相关记录</span>
          </label>
        </div>

        <p className="text-sm text-ink-3">此操作不可撤销。</p>
      </div>
    </Modal>
  );
}
