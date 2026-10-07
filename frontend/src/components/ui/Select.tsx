import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <span className="relative flex w-full items-center">
      <select
        ref={ref}
        className={cn(
          "h-[42px] w-full appearance-none rounded-md border bg-elevated pr-9 pl-3 text-body text-ink",
          "transition-colors duration-[140ms] focus:border-accent-border focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "[&>option]:bg-elevated [&>option]:text-ink",
          invalid ? "border-danger/50" : "border-line",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-ink-3" aria-hidden />
    </span>
  );
});
