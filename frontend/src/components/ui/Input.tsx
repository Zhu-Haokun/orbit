import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from "react";

import { cn } from "@/lib/cn";

/**
 * 规范 §39.3 Input
 * height 42 / radius 12 / background bg-elevated / border border-default
 * Focus: accent-border，不要默认蓝色浏览器 outline（由全局 :focus-visible 接管）。
 */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, icon, ...rest },
  ref,
) {
  return (
    <span className="relative flex w-full items-center">
      {icon && (
        <span className="pointer-events-none absolute left-3 flex text-ink-3" aria-hidden>
          {icon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          "h-[42px] w-full rounded-md border bg-elevated px-3 text-body text-ink",
          "placeholder:text-ink-4 transition-colors duration-[140ms]",
          "focus:border-accent-border focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          invalid ? "border-danger/50" : "border-line",
          icon && "pl-9",
          className,
        )}
        {...rest}
      />
    </span>
  );
});

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby": string | undefined }) => ReactNode;
}

/** Label + control + hint/error. Keeps every form in the app accessible by default. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = hint || error ? `${id}-desc` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <label htmlFor={id} className="text-sm text-ink-2">
          {label}
          {required && <span className="ml-1 text-accent">*</span>}
        </label>
      )}
      {children({ id, "aria-describedby": describedBy })}
      {(hint || error) && (
        <p id={`${id}-desc`} className={cn("text-sm", error ? "text-danger" : "text-ink-3")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
