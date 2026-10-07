import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, LogOut } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/Switch";
import { StorageSection } from "@/features/settings/StorageSection";
import { AboutSection } from "@/features/settings/AboutSection";
import { downloadBlob, downloadJson } from "@/lib/api";
import { cn } from "@/lib/cn";
import { exportService } from "@/services/insights";
import { authService } from "@/services/auth";
import { BACKGROUND_OPTIONS, useBackgroundStore } from "@/stores/backgroundStore";
import { useSessionStore } from "@/stores/sessionStore";
import { toast } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";

/**
 * 规范 §36 设置页（max-width 820）
 * 分区：账户 / 外观 / 数据 / 隐私 / 关于 Orbit
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h3 text-ink">{title}</h2>
      <Card className="p-5">{children}</Card>
    </section>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const user = useSessionStore((state) => state.user);
  const signOut = useSessionStore((state) => state.signOut);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const backgroundTone = useBackgroundStore((state) => state.tone);
  const setBackgroundTone = useBackgroundStore((state) => state.setTone);
  const resetBackgroundTone = useBackgroundStore((state) => state.reset);

  const [exporting, setExporting] = useState<"json" | "csv" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onExportJson = async () => {
    setExporting("json");
    try {
      const payload = await exportService.json();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`orbit-export-${stamp}.json`, payload);
      toast.success("导出完成");
    } catch {
      toast.error("暂时没能导出，稍后再试。");
    } finally {
      setExporting(null);
    }
  };

  const onExportCsv = async () => {
    setExporting("csv");
    try {
      const blob = await exportService.csv();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(`orbit-export-${stamp}.csv`, blob);
      toast.success("导出完成");
    } catch {
      toast.error("暂时没能导出，稍后再试。");
    } finally {
      setExporting(null);
    }
  };

  const onSignOut = async () => {
    try {
      await authService.logout();
    } catch {
      // 服务端是无状态的，登出失败也不影响本地清理。
    }
    signOut();
    navigate("/login", { replace: true });
  };

  const onDeleteAccount = async () => {
    setDeleting(true);
    try {
      await authService.deleteAccount();
      signOut();
      toast.show("账户和所有记录都已经删除");
      navigate("/", { replace: true });
    } catch {
      toast.error("暂时没能删除，稍后再试。");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[820px]">
      <PageHeader title="设置" description="只属于你自己的星图。" />

      <div className="flex flex-col gap-10 px-4 pb-16 md:px-8">
        <Section title="账户">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink-3">称呼</span>
              <span className="text-body text-ink">{user?.nickname ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink-3">邮箱</span>
              <span className="text-body text-ink">{user?.email ?? "—"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                icon={<LogOut className="size-4" aria-hidden />}
                onClick={() => void onSignOut()}
              >
                退出登录
              </Button>
              <Button variant="danger" size="md" onClick={() => setDeleteOpen(true)}>
                删除账户
              </Button>
            </div>
          </div>
        </Section>

        <Section title="外观">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-body text-ink">主题</span>
              <span className="text-sm text-ink-3">默认深色。跟随系统时按你的系统偏好显示。</span>
            </div>
            <SegmentedControl
              label="主题"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "dark", label: "深色" },
                { value: "system", label: "跟随系统" },
              ]}
            />
          </div>

          {/*
            背景氛围：星图之外的页面之前共用一块纯黑，文字像浮在黑幕上。
            这里只提供少数几个验证过可读性的预设 —— 不做"任意图片铺满"，
            图片亮度不可控会直接吃掉正文，也给私人内容增加隐私边界。
          */}
          <div className="flex flex-col gap-3 border-t border-line-subtle pt-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-body text-ink">背景氛围</span>
              <span className="text-sm text-ink-3">
                只改底色与材质的色温，不改结构、不带动画。星图始终是自己的夜空。
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {BACKGROUND_OPTIONS.map((option) => {
                const active = backgroundTone === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setBackgroundTone(option.value)}
                    className={cn(
                      "flex flex-col gap-2 rounded-md border p-2 text-left transition-colors duration-[140ms]",
                      active
                        ? "border-accent-border bg-accent-soft"
                        : "border-line-subtle hover:border-line",
                    )}
                  >
                    {/* 预览用真实的层次，而不是一个纯色小方块。 */}
                    <span
                      className="relative flex h-14 w-full flex-col justify-end overflow-hidden rounded-sm border border-line-subtle p-1.5"
                      style={{ backgroundColor: option.swatch }}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background: `radial-gradient(120% 90% at 50% -20%, ${option.glow} 0%, transparent 65%)`,
                        }}
                      />
                      <span
                        className="relative mb-1 h-1.5 w-3/5 rounded-full"
                        style={{ backgroundColor: option.surface }}
                      />
                      <span
                        className="relative h-1 w-4/5 rounded-full opacity-60"
                        style={{ backgroundColor: option.surface }}
                      />
                    </span>
                    <span className="text-body text-ink">{option.label}</span>
                    <span className="text-sm text-ink-4">{option.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={backgroundTone === "orbit"}
                onClick={resetBackgroundTone}
              >
                恢复默认
              </Button>
              <span className="text-sm text-ink-4">默认是「深夜轨道」。</span>
            </div>
          </div>
        </Section>

        <Section title="数据">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-3">
              你的记录随时可以带走。JSON 是完整档案，CSV 方便在表格里查看。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="md"
                loading={exporting === "json"}
                icon={<Download className="size-4" aria-hidden />}
                onClick={() => void onExportJson()}
              >
                Export JSON
              </Button>
              <Button
                variant="ghost"
                size="md"
                loading={exporting === "csv"}
                icon={<Download className="size-4" aria-hidden />}
                onClick={() => void onExportCsv()}
              >
                Export CSV
              </Button>
            </div>
          </div>
        </Section>

        <Section title="存储位置">
          <StorageSection />
        </Section>

        <Section title="隐私">
          <div className="flex flex-col gap-2">
            <p className="text-body text-ink-2">你的星图默认只有你自己可见。</p>
            <p className="text-body text-ink-2">Orbit 不会通知被记录的人。</p>
            <p className="text-sm text-ink-4">
              Orbit 不对关系打分，也不会替你判断任何人的性格或关系质量。
            </p>
          </div>
        </Section>

        <Section title="关于 Orbit">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-body text-ink-2">把人与人之间，那些容易忘记的小事留住。</p>
              <p className="text-sm text-ink-4">
                代码可以更新，你的记录永远留在这台电脑上。
              </p>
            </div>
            <AboutSection />
          </div>
        </Section>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除账户？"
        description="你的星图、人物档案和全部记录都会被删除。"
        size="sm"
        dismissible={false}
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button variant="danger" size="md" loading={deleting} onClick={() => void onDeleteAccount()}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-2">此操作不可撤销。</p>
      </Modal>
    </div>
  );
}
