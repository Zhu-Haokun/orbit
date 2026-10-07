import { Download, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useCancelUpdate, useDownloadUpdate, useUpdateCheck, useVersion } from "@/hooks/useVersion";

/**
 * 关于与更新（设置页）。
 *
 * 两条产品原则：
 *
 * 1. **不自动更新。** 检查更新是一次外网请求，只有用户点了才发。
 * 2. **不自动替换文件。** 下载只落到 ``update-staging/``；替换由
 *    ``apply-update.bat`` 在程序关闭后执行，那份脚本按白名单复制，
 *    绝不会碰 ``orbit.db`` 和 ``uploads/``。
 */

export function AboutSection() {
  const version = useVersion();
  const check = useUpdateCheck();
  const download = useDownloadUpdate();
  const cancel = useCancelUpdate();

  const info = version.data;
  const result = check.data;
  const hasUpdate = Boolean(result?.hasUpdate);
  const staged = Boolean(info?.staged);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-body text-ink">{info?.name ?? "Orbit / 人情星图"}</span>
        <span className="font-data text-sm text-ink-3 tabular-nums">
          v{info?.current ?? "…"}
        </span>
        {!info?.repository && (
          <span className="text-sm text-ink-4">
            （还没配置 GitHub 仓库地址，更新检查不可用）
          </span>
        )}
      </div>

      {/* 已经下载好、等用户关闭程序应用 */}
      {staged ? (
        <div className="flex flex-col gap-2 rounded-md border border-accent-border bg-accent-soft px-3 py-2.5">
          <p className="text-body text-ink">
            更新已下载好（{info?.stagedFiles ?? 0} 个文件），等待应用。
          </p>
          <p className="text-sm text-ink-2">
            请关闭所有 Orbit 窗口，然后双击
            <span className="font-data"> update-staging\apply-update.bat</span>
            。它会先备份 orbit.db，再替换程序文件并跑数据库迁移；失败会自动回滚。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              loading={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              取消这次更新
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="md"
              loading={check.isFetching}
              icon={<RefreshCw className="size-4" aria-hidden />}
              onClick={() => void check.refetch()}
            >
              检查更新
            </Button>
            {result && !result.error && !hasUpdate && (
              <span className="text-sm text-ink-3">已经是最新版本。</span>
            )}
          </div>

          {/* 离线 / 未配置仓库：说清楚原因，不吓人 */}
          {result?.error && (
            <p className="text-sm text-ink-4">{result.error}</p>
          )}

          {hasUpdate && result && (
            <div className="flex flex-col gap-2 rounded-md border border-line-subtle bg-surface px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Sparkles className="size-3.5 shrink-0 text-accent" aria-hidden />
                <span className="text-body text-ink">
                  有新版本 v{result.latest}
                </span>
                {result.publishedAt && (
                  <span className="text-sm text-ink-4 tabular-nums">
                    {result.publishedAt.slice(0, 10)}
                  </span>
                )}
              </div>

              {result.releaseNotes && (
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-ink-3">
                  {result.releaseNotes}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!result.canDownload}
                  loading={download.isPending}
                  icon={<Download className="size-3.5" aria-hidden />}
                  onClick={() => download.mutate()}
                >
                  下载更新
                </Button>
                {result.releaseUrl && (
                  <a
                    className={cn(
                      "text-sm text-ink-3 underline-offset-4 transition-colors duration-[140ms]",
                      "hover:text-ink hover:underline",
                    )}
                    href={result.releaseUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    在 GitHub 上查看
                  </a>
                )}
                {!result.canDownload && (
                  <span className="text-sm text-ink-4">这个版本没有提供 zip 附件。</span>
                )}
              </div>

              <p className="text-sm text-ink-4">
                下载只会把文件放到 <span className="font-data">update-staging\</span>
                ，不会动你的记录。真正替换在你关闭程序后由脚本执行。
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
