import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { OrbitLogo } from "@/components/layout/OrbitLogo";

/**
 * 规范 §38 登录 / 注册：保持极简。Card width 420px。
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="galaxy-glow flex min-h-dvh flex-col items-center justify-center bg-base px-4 py-12">
      <div className="w-full max-w-[420px]">
        <Link to="/" className="mb-8 flex items-center gap-2.5">
          <OrbitLogo size={22} />
          <span className="flex flex-col leading-tight">
            <span className="text-body font-medium text-ink">Orbit</span>
            <span className="text-micro text-ink-3">人情星图</span>
          </span>
        </Link>

        <div className="rounded-xl border border-line-subtle bg-surface p-6 md:p-8">
          <div className="mb-6 flex flex-col gap-1">
            <h1 className="text-h2 text-ink">{title}</h1>
            {subtitle && <p className="text-sm text-ink-3">{subtitle}</p>}
          </div>
          {children}
        </div>

        {footer && <div className="mt-5 text-center text-sm text-ink-3">{footer}</div>}
      </div>
    </div>
  );
}
