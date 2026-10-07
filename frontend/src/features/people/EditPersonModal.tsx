import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  PersonFormFields,
  personFormFrom,
  personFormToInput,
  type PersonFormState,
} from "@/features/people/PersonFormFields";
import { useUpdatePerson } from "@/hooks/usePeople";
import { ApiError } from "@/lib/api";
import { collectIssues, personSchema } from "@/lib/validation";
import { toast } from "@/stores/toastStore";
import type { PersonDetail } from "@/types";

/**
 * 规范 §21.1 [编辑] —— 与新建共用字段。
 * 取空 groupIds 即可把这个人从所有星系里移出。
 */

const FORM_ID = "edit-person-form";

export interface EditPersonModalProps {
  person: PersonDetail;
  open: boolean;
  onClose: () => void;
}

export function EditPersonModal({ person, open, onClose }: EditPersonModalProps) {
  const updatePerson = useUpdatePerson(person.id);
  const [values, setValues] = useState<PersonFormState>(() => personFormFrom(person));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [synced, setSynced] = useState({ id: person.id, open });

  // 每次（重新）打开时用最新的数据重新填充；打开期间不覆盖用户正在输入的内容。
  // 在渲染期间调整 state 是 React 官方推荐的做法，也比在 effect 里同步少一次级联渲染。
  if (synced.id !== person.id || synced.open !== open) {
    setSynced({ id: person.id, open });
    if (open) {
      setValues(personFormFrom(person));
      setErrors({});
    }
  }

  const onChange = <K extends keyof PersonFormState>(key: K, value: PersonFormState[K]) => {
    setValues((prev) => {
      const next: PersonFormState = { ...prev };
      next[key] = value;
      return next;
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = personSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(collectIssues(parsed.error));
      return;
    }
    setErrors({});
    updatePerson.mutate(personFormToInput(values, person.isSelf), {
      onSuccess: () => {
        toast.success("已保存");
        onClose();
      },
      onError: (error) =>
        setErrors({
          form: error instanceof ApiError ? error.message : "暂时没能完成这次操作，请稍后再试。",
        }),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={person.isSelf ? "编辑我的资料" : "编辑资料"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={updatePerson.isPending}>
            保存
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <PersonFormFields
          values={values}
          errors={errors}
          onChange={onChange}
          isSelf={person.isSelf}
        />
        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      </form>
    </Modal>
  );
}
