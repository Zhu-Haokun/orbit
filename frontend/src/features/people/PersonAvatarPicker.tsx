import { useRef, useState } from "react";
import { ImagePlus, Link2, Sparkles } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { uploadsService } from "@/services/ai";

/**
 * 头像选择器（规范 §20 头像选填 / §57 只支持图片 / §82 无头像时用姓名首字）。
 *
 * 三条路：本地上传（主）、内置默认头像（省事）、图片链接（少量场景）。
 * 前端先做类型与体积校验，不用等上传完才知道不行。
 */

/** 内置默认头像：不填图片也能挑一个，避免所有人都是同一颗白点。 */
export const DEFAULT_AVATARS = [
  { file: "moon.svg", label: "月亮" },
  { file: "star.svg", label: "北星" },
  { file: "comet.svg", label: "彗星" },
  { file: "mountain.svg", label: "远山" },
  { file: "wave.svg", label: "海浪" },
  { file: "leaf.svg", label: "叶子" },
  { file: "cat.svg", label: "猫" },
  { file: "bird.svg", label: "飞鸟" },
  { file: "cactus.svg", label: "仙人掌" },
  { file: "coffee.svg", label: "咖啡" },
  { file: "camera.svg", label: "相机" },
  { file: "book.svg", label: "书" },
] as const;

export function defaultAvatarUrl(file: string): string {
  return `/avatars/${file}`;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_AVATAR_MB = 5;

export interface PersonAvatarPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** 没有图片时用姓名首字做预览（规范 §82）。 */
  name: string;
  id?: string;
  "aria-describedby"?: string;
  invalid?: boolean;
}

export function PersonAvatarPicker({
  value,
  onChange,
  name,
  id,
  "aria-describedby": describedBy,
  invalid,
}: PersonAvatarPickerProps) {
  const [panel, setPanel] = useState<"none" | "defaults" | "link">("none");
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    // 规范 §57 / 文档建议：选文件时就校验，别等上传完才报错。
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLocalError("只支持 jpg、png、webp 这几种图片。");
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      setLocalError(
        `这张图有 ${(file.size / 1024 / 1024).toFixed(1)}MB，换一张小于 ${MAX_AVATAR_MB}MB 的。`,
      );
      return;
    }

    setLocalError(null);
    setUploading(true);
    try {
      const result = await uploadsService.image(file);
      onChange(result.url);
      setPanel("none");
    } catch (error) {
      setLocalError(error instanceof ApiError ? error.message : "图片暂时没能上传，稍后再试。");
    } finally {
      setUploading(false);
    }
  };

  const isDefault = DEFAULT_AVATARS.some((item) => defaultAvatarUrl(item.file) === value);

  return (
    <div className={cn("flex flex-col gap-3", invalid && "rounded-md")}>
      <div className="flex items-center gap-4">
        <Avatar name={name || "新的人"} src={value || null} size="xl" />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              id={id}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-describedby={describedBy}
              onChange={(event) => {
                void onPickFile(event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              loading={uploading}
              icon={<ImagePlus className="size-4" aria-hidden />}
              onClick={() => fileRef.current?.click()}
            >
              上传本地图片
            </Button>
            <Button
              variant={panel === "defaults" ? "primary" : "ghost"}
              size="sm"
              icon={<Sparkles className="size-4" aria-hidden />}
              onClick={() => setPanel(panel === "defaults" ? "none" : "defaults")}
            >
              默认头像
            </Button>
            <Button
              variant={panel === "link" ? "primary" : "ghost"}
              size="sm"
              icon={<Link2 className="size-4" aria-hidden />}
              onClick={() => setPanel(panel === "link" ? "none" : "link")}
            >
              图片链接
            </Button>
            {value && (
              <Button variant="ghost" size="sm" onClick={() => onChange("")}>
                清除
              </Button>
            )}
          </div>
          <p className="text-sm text-ink-4">
            {value
              ? isDefault
                ? "正在使用内置头像。"
                : "正在使用这张图片。"
              : "不填也行，星图上会用姓名首字。"}
          </p>
        </div>
      </div>

      {localError && <p className="text-sm text-danger">{localError}</p>}

      {panel === "defaults" && (
        <div className="grid grid-cols-6 gap-2 rounded-md border border-line-subtle bg-soft/40 p-3">
          {DEFAULT_AVATARS.map((item) => {
            const url = defaultAvatarUrl(item.file);
            const selected = value === url;
            return (
              <button
                key={item.file}
                type="button"
                aria-label={`使用${item.label}头像`}
                aria-pressed={selected}
                title={item.label}
                onClick={() => {
                  onChange(url);
                  setPanel("none");
                }}
                className={cn(
                  "rounded-pill transition-transform duration-[140ms] hover:scale-105",
                  selected && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                )}
              >
                <Avatar name={item.label} src={url} size="lg" className="size-full" />
              </button>
            );
          })}
        </div>
      )}

      {panel === "link" && (
        <Input
          type="url"
          value={value}
          placeholder="https://…"
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
