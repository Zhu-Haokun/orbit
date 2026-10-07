import { Copy, HardDrive } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useStorage } from "@/hooks/useStorage";
import { toast } from "@/stores/toastStore";

/**
 * 当前存储位置（设置页）。
 *
 * 私人记录工具最该回答的一个问题：**我的东西到底存在哪？**
 *
 * 这里只**显示**，不提供"在运行时换目录"的按钮：SQLite 在服务运行期间
 * 持有文件句柄，uploads 又是启动时挂载的静态目录 —— 运行中挪动它们
 * 会直接损坏数据。要换位置就去改 .env 里的两个变量然后重启，
 * 那是一条能验证、也能回退的路径。
 */

const ENV_LINES = [
  "# 想让数据放到别处（同步盘、移动硬盘），改这两行：",
  "DATABASE_URL=sqlite:///D:/OrbitData/orbit.db",
  "UPLOAD_DIR=D:/OrbitData/uploads",
];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function PathRow({
  label,
  display,
  absolute,
  meta,
}: {
  label: string;
  /** 从项目文件夹开始的路径，例如 ``人情星图\orbit\backend\orbit.db``。 */
  display: string;
  /** 本机绝对路径，只在提示里出现、也只复制这个。 */
  absolute: string;
  meta?: string;
}) {
  const onCopy = () => {
    // 复制的是绝对路径 —— 粘贴到资源管理器里能直接打开。
    navigator.clipboard.writeText(absolute).then(
      () => toast.success("已复制完整路径"),
      () => toast.error("浏览器没有允许复制，手动选中吧。"),
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-body text-ink">{label}</span>
        {meta ? <span className="text-sm text-ink-4 tabular-nums">{meta}</span> : null}
      </div>
      <div className="flex items-center gap-2">
        <code
          className="min-w-0 flex-1 truncate rounded-sm border border-line-subtle bg-surface px-2 py-1 font-data text-sm text-ink-2"
          title={absolute}
        >
          {display}
        </code>
        <Button
          size="sm"
          variant="ghost"
          aria-label="复制完整路径"
          icon={<Copy className="size-3.5" aria-hidden />}
          onClick={onCopy}
        />
      </div>
    </div>
  );
}

export function StorageSection() {
  const storage = useStorage();
  const info = storage.data;
  // 展示路径从"打包发出去的那一层文件夹"开始，不带本机前缀（D:\...\）。
  const prefix = info ? `${info.packageRootName}\\` : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <HardDrive className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
        <p className="text-sm text-ink-3">
          你的记录全部存在<span className="text-ink-2">这台电脑上</span>
          ，没有上传到任何服务器。换电脑或重装之前，把下面这两个位置复制走就是完整备份。
        </p>
      </div>

      {storage.isError ? <p className="text-sm text-ink-4">暂时读不到存储位置。</p> : null}

      {info ? (
        <div className="flex flex-col gap-3">
          <PathRow
            label="数据库"
            display={`${prefix}${info.databaseDisplay}`}
            absolute={info.databasePath}
            meta={
              info.databaseExists
                ? `${formatBytes(info.databaseBytes)} · 人物、互动、近况等全部记录`
                : "还没有创建"
            }
          />
          <PathRow
            label="上传的图片"
            display={`${prefix}${info.uploadDisplay}`}
            absolute={info.uploadPath}
            meta={
              info.uploadExists
                ? `${formatBytes(info.uploadBytes)} · ${info.uploadFileCount} 个文件`
                : "还没有上传过图片"
            }
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-md border border-line-subtle bg-surface px-3 py-2.5">
        <p className="text-sm text-ink-3">
          路径都以<span className="text-ink-2">{info?.packageRootName ?? "项目"}</span>
          文件夹为起点，所以整个文件夹打包发给别人，路径依然对得上。
        </p>
        <p className="text-sm text-ink-3">
          想把数据放到别处（同步盘、移动硬盘）？在下面这个文件里改两行，然后重启 Orbit：
        </p>
        <code className="font-data text-sm text-ink-2">
          {prefix}
          {info?.envFileDisplay ?? "orbit\\backend\\.env"}
        </code>
        <div className="mt-1 flex flex-col gap-0.5">
          {ENV_LINES.map((line) => (
            <code key={line} className="font-data text-sm text-ink-3">
              {line}
            </code>
          ))}
        </div>
        <p className="text-sm text-ink-4">
          改之前先把上面两个位置<span className="text-ink-3">完整复制</span>
          到新目录，再改配置、重启，最后确认记录还在。
        </p>
      </div>

      <p className="text-sm text-ink-4">
        另外几个只跟界面有关的偏好（登录状态、主题、背景氛围）存在浏览器本地，不包含任何记录内容。
      </p>
    </div>
  );
}
