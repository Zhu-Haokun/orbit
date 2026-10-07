import { cn } from "@/lib/cn";

/**
 * 规范 §12: Logo 为中心点 + 单条不完整轨道。
 */
export function OrbitLogo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <circle cx="12" cy="12" r="2.1" fill="var(--accent)" />
      <circle cx="12" cy="12" r="4.4" stroke="var(--accent)" strokeOpacity="0.22" strokeWidth="1" />
      <path
        d="M12 5.6A6.4 6.4 0 0 1 18.4 12"
        stroke="var(--accent)"
        strokeOpacity="0.9"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
