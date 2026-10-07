import { MemoryComments, MemoryPeople } from "@/features/memories/MemoryComments";
import { cn } from "@/lib/cn";
import { formatMonthDay, truncate } from "@/lib/format";
import { lightbox } from "@/stores/lightboxStore";
import type { MemoryItem } from "@/types";

/**
 * 规范 §34.3 Memory Timeline 的单条记忆
 *
 * 摄影社秋季外拍
 * [image][image]
 * 林夕 · 老陈 · 阿杰
 *
 * 规范 §27 / §80 精神：不要把每条内容都塞进厚重描边卡片，保持呼吸感。
 */

const COLLAGE_LIMIT = 4;

export interface MemoryCardProps {
  item: MemoryItem;
  className?: string;
}

function AttachmentCollage({ urls }: { urls: string[] }) {
  const shown = urls.slice(0, COLLAGE_LIMIT);
  const remaining = urls.length - shown.length;

  const tile = (url: string, index: number, className: string) => (
    <button
      key={`${url}-${index}`}
      type="button"
      aria-label="放大查看这张图片"
      onClick={() => lightbox.open(urls, index)}
      className={cn(
        "relative cursor-zoom-in overflow-hidden rounded-md border border-line-subtle bg-soft transition-opacity duration-[140ms] hover:opacity-85",
        className,
      )}
    >
      <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      {remaining > 0 && index === shown.length - 1 && (
        <span className="absolute right-2 bottom-2 rounded-pill bg-scrim px-2 py-0.5 text-micro text-ink">
          +{remaining}
        </span>
      )}
    </button>
  );

  if (shown.length === 1) {
    return <div className="max-w-[520px]">{tile(shown[0]!, 0, "aspect-[16/9] w-full")}</div>;
  }

  if (shown.length === 2) {
    return (
      <div className="grid max-w-[520px] grid-cols-2 gap-2">
        {shown.map((url, index) => tile(url, index, "aspect-[4/3]"))}
      </div>
    );
  }

  // 三张以上：给一张大主图，其余做小拼贴，比一排等大的缩略图更有记忆感。
  return (
    <div className="grid max-w-[520px] grid-cols-[2fr_1fr] gap-2">
      {tile(shown[0]!, 0, "aspect-[4/3]")}
      <div className="grid grid-rows-2 gap-2">
        {shown.slice(1, 3).map((url, index) => tile(url, index + 1, "aspect-[4/3]"))}
      </div>
    </div>
  );
}

export function MemoryCard({ item, className }: MemoryCardProps) {
  const excerpt = truncate(item.content, 120);
  const imageUrls = item.attachments
    .filter((attachment) => attachment.fileType === "image")
    .map((attachment) => attachment.fileUrl);
  const meta = [formatMonthDay(item.date), item.location].filter(Boolean).join(" · ");

  return (
    <article className={cn("group/memory flex flex-col gap-3 py-5 md:py-6", className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {item.mood && <span className="text-lg leading-none">{item.mood}</span>}
        <h3 className="font-display text-h3 text-ink">{item.title}</h3>
        {meta && <span className="text-sm text-ink-3 tabular-nums">{meta}</span>}
      </div>

      {/* 「和谁」是这段回忆最重要的信息，放在正文之前、用头像 + 名字。 */}
      <MemoryPeople item={item} />

      {excerpt && <p className="max-w-[65ch] text-body text-ink-2">{excerpt}</p>}

      {imageUrls.length > 0 && <AttachmentCollage urls={imageUrls} />}

      <MemoryComments item={item} />
    </article>
  );
}
