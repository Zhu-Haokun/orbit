import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api";
import { collectIssues, loginSchema, registerSchema } from "@/lib/validation";
import { authService } from "@/services/auth";
import { useSessionStore } from "@/stores/sessionStore";
import { toast } from "@/stores/toastStore";

/**
 * 规范 §38 登录 / 注册
 * 字段保持最少；提供“体验 Demo”（§6.4 也可同时提供“进入 Demo”按钮）。
 */

function useAuthSubmit<T extends Record<string, unknown>>(
  run: (values: T) => Promise<void>,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } },
) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async (values: T) => {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(collectIssues(parsed.error as never));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await run(parsed.data as T);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "暂时没能完成这次操作，请稍后再试。";
      setErrors({ form: message });
    } finally {
      setPending(false);
    }
  };

  return { errors, setErrors, pending, submit };
}

export function LoginForm() {
  const navigate = useNavigate();
  const signIn = useSessionStore((state) => state.signIn);
  const [values, setValues] = useState({ email: "", password: "" });

  const { errors, pending, submit } = useAuthSubmit(
    async (input: { email: string; password: string }) => {
      const session = await authService.login(input);
      signIn(session);
      navigate("/galaxy", { replace: true });
    },
    loginSchema,
  );

  const onDemo = async () => {
    try {
      const session = await authService.demo();
      signIn(session);
      navigate("/galaxy", { replace: true });
    } catch {
      toast.error("暂时进不去 Demo，稍后再试。");
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(values);
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <Field label="邮箱" error={errors.email}>
        {({ id, ...rest }) => (
          <Input
            id={id}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={values.email}
            invalid={Boolean(errors.email)}
            onChange={(event) => setValues((prev) => ({ ...prev, email: event.target.value }))}
            {...rest}
          />
        )}
      </Field>

      <Field label="密码" error={errors.password}>
        {({ id, ...rest }) => (
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={values.password}
            invalid={Boolean(errors.password)}
            onChange={(event) => setValues((prev) => ({ ...prev, password: event.target.value }))}
            {...rest}
          />
        )}
      </Field>

      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

      <Button type="submit" variant="primary" size="lg" block loading={pending}>
        进入我的星图
      </Button>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-line-subtle" />
        <span className="text-micro text-ink-4">或</span>
        <span className="h-px flex-1 bg-line-subtle" />
      </div>

      <Button type="button" variant="secondary" size="lg" block onClick={onDemo}>
        体验 Demo
      </Button>
    </form>
  );
}

export function RegisterForm() {
  const navigate = useNavigate();
  const signIn = useSessionStore((state) => state.signIn);
  const [values, setValues] = useState({
    nickname: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const { errors, pending, submit } = useAuthSubmit(
    async (input: { nickname: string; email: string; password: string }) => {
      const session = await authService.register({
        nickname: input.nickname,
        email: input.email,
        password: input.password,
      });
      signIn(session);
      navigate("/galaxy", { replace: true });
    },
    registerSchema,
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(values);
  };

  const update = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <Field label="称呼" error={errors.nickname}>
        {({ id, ...rest }) => (
          <Input
            id={id}
            autoComplete="nickname"
            placeholder="别人怎么称呼你"
            value={values.nickname}
            invalid={Boolean(errors.nickname)}
            onChange={update("nickname")}
            {...rest}
          />
        )}
      </Field>

      <Field label="邮箱" error={errors.email}>
        {({ id, ...rest }) => (
          <Input
            id={id}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={values.email}
            invalid={Boolean(errors.email)}
            onChange={update("email")}
            {...rest}
          />
        )}
      </Field>

      <Field label="密码" hint="至少 6 位" error={errors.password}>
        {({ id, ...rest }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={values.password}
            invalid={Boolean(errors.password)}
            onChange={update("password")}
            {...rest}
          />
        )}
      </Field>

      <Field label="确认密码" error={errors.confirmPassword}>
        {({ id, ...rest }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={values.confirmPassword}
            invalid={Boolean(errors.confirmPassword)}
            onChange={update("confirmPassword")}
            {...rest}
          />
        )}
      </Field>

      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

      <Button type="submit" variant="primary" size="lg" block loading={pending}>
        创建我的星图
      </Button>
    </form>
  );
}
