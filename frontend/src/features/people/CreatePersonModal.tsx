import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  PersonFormFields,
  emptyPersonForm,
  personFormToInput,
  type PersonFormState,
} from "@/features/people/PersonFormFields";
import { useCreatePerson } from "@/hooks/usePeople";
import { ApiError } from "@/lib/api";
import { collectIssues, personSchema } from "@/lib/validation";
import { toast } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * 规范 §20 新建人物 Modal
 * Desktop 520px / Mobile full-screen sheet（由 Modal 统一处理）。
 * 规范 §54.2: 保存后关闭 Modal，并给出「已加入你的星图」的反馈。
 *
 * 由 AppShell 渲染，自身读取 uiStore，不接收任何 props。
 */

const FORM_ID = "create-person-form";

export function CreatePersonModal() {
  const open = useUiStore((state) => state.createPersonOpen);
  const seed = useUiStore((state) => state.createPersonSeed);
  const setOpen = useUiStore((state) => state.setCreatePersonOpen);
  const createPerson = useCreatePerson();

  const [values, setValues] = useState<PersonFormState>(emptyPersonForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [syncedSeed, setSyncedSeed] = useState<string | null>(null);

  // 打开时（或带着新的预填姓名再次打开时）重置表单。
  // 渲染期间调整 state，避免 effect 里 setState 带来的级联渲染。
  if (open && syncedSeed !== seed) {
    setSyncedSeed(seed);
    setValues(seed ? { ...emptyPersonForm(), name: seed } : emptyPersonForm());
    setErrors({});
  }
  if (!open && syncedSeed !== null) {
    setSyncedSeed(null);
  }

  const onChange = <K extends keyof PersonFormState>(key: K, value: PersonFormState[K]) => {
    setValues((prev) => {
      const next: PersonFormState = { ...prev };
      next[key] = value;
      return next;
    });
  };

  const close = () => setOpen(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = personSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(collectIssues(parsed.error));
      return;
    }
    setErrors({});
    createPerson.mutate(personFormToInput(values), {
      onSuccess: (person) => {
        toast.success("已加入你的星图");
        // 规范 §54.2: 让星图刷新后自动聚焦这颗新星，否则人一多就找不到刚加的人。
        useUiStore.getState().requestFocusPerson(person.id);
        close();
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
      onClose={close}
      size="md"
      title="新建人物"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            取消
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={FORM_ID}
            loading={createPerson.isPending}
          >
            添加到星图
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <PersonFormFields values={values} errors={errors} onChange={onChange} />
        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      </form>
    </Modal>
  );
}
