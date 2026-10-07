import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * 规范 §39.1 Button
 * Variants: primary / secondary / ghost / danger
 * Heights: sm 32 / md 40 / lg 46 — 不要使用渐变。
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent",
  secondary: "bg-elevated text-ink border border-line hover:border-line-hover",
  ghost: "text-ink-2 hover:text-ink hover:bg-hover-fill",
  danger: "text-danger border border-line hover:border-danger/40 hover:bg-danger/5",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm rounded-sm gap-1.5",
  md: "h-10 px-4 text-body rounded-md gap-2",
  lg: "h-[46px] px-5 text-body rounded-md gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 只放图标时必填，规范 §43 要求所有 icon button 有 aria-label。 */
  "aria-label"?: string;
  icon?: ReactNode;
  block?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, icon, block, loading, children, disabled, ...rest },
  ref,
) {
  const iconOnly = !children && Boolean(icon);
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-medium select-none",
        "transition-colors duration-[140ms] active:duration-[100ms]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        iconOnly && (size === "sm" ? "w-8 px-0" : size === "lg" ? "w-[46px] px-0" : "w-10 px-0"),
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});
