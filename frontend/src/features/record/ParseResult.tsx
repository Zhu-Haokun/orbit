import { ArrowLeft, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { PersonPicker } from "@/components/people/PersonPicker";
import { formatMonthDay } from "@/lib/format";
import { lightbox } from "@/stores/lightboxStore";
import { ParsedFieldCard, ParsedRow } from "@/features/record/ParsedFieldCard";
import type {
  BorrowDirection,
  CommitParseInput,
  DatePrecision,
  ParseResult,
  PersonSummary,
  PreferenceCategory,
  RepeatType,
} from "@/types";

/**
 * 规范 §30 解析结果页面
 * 左：原始文本 / 右：结构化结果（Desktop ≥ 1000，小屏变上下结构）
 * 结构化结果严格分卡：人物 / 互动 / 近况 / 重要日期 / 未完待续 / 偏好
 * 每一项都有 勾选 / 编辑 / 删除；底部 重新整理 / 全部保存；保存前必须用户确认。
 */

let rowSeq = 0;
const nextKey = () => `row-${(rowSeq += 1)}`;

export interface RecordDraft {
  personId: string | null;
  /** 一起经历的人：同一条回忆也会进他们的档案（结构化内容只挂主人物）。 */
  personIds: string[];
  title: string;
  content: string;
  interactionDate: string;
  /** 地点由用户在记录页填写，解析结果里可以再改。 */
  location: string | null;
  updates: Array<{ key: string; keep: boolean; content: string }>;
  commitments: Array<{ key: string; keep: boolean; content: string; dueText: string | null }>;
  importantDates: Array<{
    key: string;
    keep: boolean;
    title: string;
    date: string | null;
    dateText: string | null;
    datePrecision: DatePrecision;
    repeatType: RepeatType;
  }>;
  preferences: Array<{
    key: string;
    keep: boolean;
    category: PreferenceCategory;
    content: string;
  }>;
  borrowRecords: Array<{
    key: string;
    keep: boolean;
    direction: BorrowDirection;
    itemName: string;
    borrowDate: string | null;
  }>;
  attachments: string[];
}

export function draftFromParse(result: ParseResult, text: string, attachmentUrls: string[]): RecordDraft {
  return {
    personId: result.personCandidates[0]?.id ?? null,
    personIds: [],
    title: result.interaction.title,
    content: result.interaction.content || text,
    interactionDate: result.interaction.interactionDate,
    location: result.interaction.location ?? null,
    updates: result.updates.map((item) => ({ key: nextKey(), keep: true, content: item.content })),
    commitments: result.commitments.map((item) => ({
      key: nextKey(),
      keep: true,
      content: item.content,
      dueText: item.dueText,
    })),
    importantDates: result.importantDates.map((item) => ({
      key: nextKey(),
      keep: true,
      title: item.title,
      date: item.date,
      dateText: item.dateText,
      datePrecision: item.datePrecision,
      repeatType: item.repeatType,
    })),
    preferences: result.preferences.map((item) => ({
      key: nextKey(),
      keep: true,
      category: item.category,
      content: item.content,
    })),
    borrowRecords: result.borrowRecords.map((item) => ({
      key: nextKey(),
      keep: true,
      direction: item.direction,
      itemName: item.itemName,
      borrowDate: item.borrowDate,
    })),
    attachments: attachmentUrls,
  };
}

const byKeep = <T extends { keep: boolean }>(rows: T[]) => rows.filter((row) => row.keep);

/**
 * 只提交用户勾选保留的内容（规范 §30 保存前必须用户确认）。
 *
 * `existingInteractionId` 用于「先记下来」之后再整理的场景：
 * 传了就更新那一条，不再新建，避免同一次经历在时间轴上出现两次。
 */
export function toCommitInput(
  draft: RecordDraft,
  existingInteractionId?: string | null,
): CommitParseInput | null {
  if (!draft.personId) return null;
  return {
    interaction: {
      personId: draft.personId,
      title: draft.title.trim() || "记录一次互动",
      content: draft.content,
      interactionDate: draft.interactionDate,
      location: draft.location,
      source: "ai_parsed",
    },
    updates: byKeep(draft.updates).map((row) => ({ content: row.content })),
    commitments: byKeep(draft.commitments).map((row) => ({
      content: row.content,
      dueText: row.dueText,
    })),
    importantDates: byKeep(draft.importantDates).map((row) => ({
      title: row.title,
      date: row.date,
      dateText: row.dateText,
      datePrecision: row.datePrecision,
      repeatType: row.repeatType,
    })),
    preferences: byKeep(draft.preferences).map((row) => ({
      category: row.category,
      content: row.content,
    })),
    borrowRecords: byKeep(draft.borrowRecords).map((row) => ({
      direction: row.direction,
      itemName: row.itemName,
      borrowDate: row.borrowDate,
    })),
    attachmentUrls: draft.attachments,
    ...(draft.personIds.length > 0 ? { personIds: draft.personIds } : {}),
    ...(existingInteractionId ? { interactionId: existingInteractionId } : {}),
  };
}

const PRECISION_LABEL: Record<DatePrecision, string> = {
  exact: "精确日期",
  month: "只有月份",
  season: "大概季节",
  text: "只有文字",
};

const CATEGORY_LABEL: Record<PreferenceCategory, string> = {
  like: "喜欢",
  dislike: "不喜欢",
  interest: "兴趣",
  wish: "最近想要",
  food: "口味",
  other: "其他",
};

export interface ParseResultProps {
  draft: RecordDraft;
  onChange: (draft: RecordDraft) => void;
  originalText: string;
  people: PersonSummary[];
  /** 规范 §31: 解析没有完全成功时的柔和提示。 */
  degraded?: boolean;
  saving: boolean;
  onReparse: () => void;
  onSave: () => void;
  onSaveInteractionOnly: () => void;
}

export function ParseResult({
  draft,
  onChange,
  originalText,
  people,
  degraded,
  saving,
  onReparse,
  onSave,
  onSaveInteractionOnly,
}: ParseResultProps) {
  const patch = (partial: Partial<RecordDraft>) => onChange({ ...draft, ...partial });

  const rowCount =
    draft.updates.length +
    draft.commitments.length +
    draft.importantDates.length +
    draft.preferences.length +
    draft.borrowRecords.length;

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 pt-8 pb-16 md:px-8 md:pt-10">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            aria-label="回到输入"
            icon={<ArrowLeft className="size-4" aria-hidden />}
            onClick={onReparse}
          />
          <div className="flex flex-col">
            <h1 className="text-h3 text-ink">整理好了，确认一下</h1>
            <p className="text-sm text-ink-3">
              只有勾选的内容会被保存，你可以直接在上面修改。
            </p>
          </div>
        </div>
      </header>

      {degraded && (
        <div className="rounded-lg border border-line-subtle bg-soft/60 px-4 py-3">
          <p className="text-body text-ink-2">这段内容没有完全整理好。</p>
          <p className="mt-1 text-sm text-ink-3">
            你可以手动调整，也可以直接按普通记录保存。
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3">
          <h2 className="text-sm text-ink-3">原始文本</h2>
          <div className="scroll-quiet max-h-[420px] overflow-y-auto rounded-lg border border-line-subtle bg-surface p-4">
            <p className="text-body whitespace-pre-wrap text-ink-2">{originalText}</p>
          </div>
          {draft.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {draft.attachments.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  aria-label="放大查看这张图片"
                  onClick={() => lightbox.open(draft.attachments, index)}
                  className="cursor-zoom-in rounded-sm transition-opacity duration-[140ms] hover:opacity-85"
                >
                  <img src={url} alt="" className="size-16 rounded-sm object-cover" />
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="flex flex-col gap-4">
          <ParsedFieldCard title="人物">
            <div className="flex flex-col gap-3">
              {people.length === 0 ? (
                <p className="text-sm text-ink-4">星图里还没有人，先去添加一个吧。</p>
              ) : (
                <>
                  {/* 主人物：结构化内容（近况 / 未完待续……）都挂在这位名下。 */}
                  <Field label="这条记录属于">
                    {({ id, ...rest }) => (
                      <PersonPicker
                        id={id}
                        {...rest}
                        people={people}
                        value={draft.personId}
                        onChange={(personId) => patch({ personId })}
                        allowEmpty={false}
                        placeholder="输入姓名、标签或星系…"
                      />
                    )}
                  </Field>

                  {/*
                    一起经历的人：同一条回忆也会进他们的档案。
                    上面选的是主人物，结构化内容只挂在主人物名下 ——
                    近况、未完待续通常是关于某一个人的，复制给所有人反而是错的。
                  */}
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-ink-4">
                      一起的还有（可选）—— 这条回忆也会进他们的档案
                    </span>
                    {(draft.personIds ?? []).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(draft.personIds ?? []).map((extraId) => {
                          const person = people.find((item) => item.id === extraId);
                          return (
                            <span
                              key={extraId}
                              className="inline-flex items-center gap-1 rounded-pill border border-accent-border bg-accent-soft py-0.5 pr-1 pl-2 text-sm text-ink"
                            >
                              {person?.name ?? "?"}
                              <button
                                type="button"
                                aria-label={`移除 ${person?.name ?? ""}`}
                                onClick={() =>
                                  patch({
                                    personIds: (draft.personIds ?? []).filter(
                                      (x) => x !== extraId,
                                    ),
                                  })
                                }
                                className="inline-flex size-4 items-center justify-center rounded-full text-ink-3 hover:text-ink"
                              >
                                <X className="size-3" aria-hidden />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <PersonPicker
                      people={people.filter(
                        (item) =>
                          item.id !== draft.personId && !(draft.personIds ?? []).includes(item.id),
                      )}
                      value={null}
                      onChange={(picked) => {
                        if (picked) patch({ personIds: [...(draft.personIds ?? []), picked] });
                      }}
                      placeholder="再加一个人…"
                      keepOpen
                    />
                  </div>
                </>
              )}
            </div>
          </ParsedFieldCard>

          <ParsedFieldCard title="互动">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
              <Field label="标题">
                {({ id }) => (
                  <Input
                    id={id}
                    value={draft.title}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                )}
              </Field>
              <Field label="时间">
                {({ id }) => (
                  <Input
                    id={id}
                    type="date"
                    value={draft.interactionDate}
                    onChange={(event) => patch({ interactionDate: event.target.value })}
                  />
                )}
              </Field>
            </div>

            {/*
              地点也能在这里补：开头忘了填、或者当时写不出来，
              整理这一步正好是回填的机会 —— "那次在南湖公园的事"比日期好找。
            */}
            <Field label="地点" hint="可选，之后可以按地点找回这一段">
              {({ id }) => (
                <Input
                  id={id}
                  value={draft.location ?? ""}
                  placeholder="例如：南湖公园"
                  autoComplete="off"
                  onChange={(event) => patch({ location: event.target.value || null })}
                />
              )}
            </Field>
          </ParsedFieldCard>

          <ParsedFieldCard
            title="近况"
            empty="这一段里没有识别到近况。"
            hint={draft.updates.length > 0 ? `${draft.updates.length} 条` : undefined}
          >
            {draft.updates.length > 0 ? (
              draft.updates.map((row) => (
                <ParsedRow
                  key={row.key}
                  label="近况"
                  keep={row.keep}
                  onKeepChange={(keep) =>
                    patch({
                      updates: draft.updates.map((item) =>
                        item.key === row.key ? { ...item, keep } : item,
                      ),
                    })
                  }
                  value={row.content}
                  onValueChange={(content) =>
                    patch({
                      updates: draft.updates.map((item) =>
                        item.key === row.key ? { ...item, content } : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    patch({ updates: draft.updates.filter((item) => item.key !== row.key) })
                  }
                />
              ))
            ) : undefined}
          </ParsedFieldCard>

          <ParsedFieldCard
            title="重要日期"
            empty="这一段里没有识别到重要日期。"
            hint={draft.importantDates.length > 0 ? `${draft.importantDates.length} 条` : undefined}
          >
            {draft.importantDates.length > 0 ? (
              draft.importantDates.map((row) => (
                <ParsedRow
                  key={row.key}
                  label="重要日期"
                  keep={row.keep}
                  onKeepChange={(keep) =>
                    patch({
                      importantDates: draft.importantDates.map((item) =>
                        item.key === row.key ? { ...item, keep } : item,
                      ),
                    })
                  }
                  value={row.title}
                  onValueChange={(title) =>
                    patch({
                      importantDates: draft.importantDates.map((item) =>
                        item.key === row.key ? { ...item, title } : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    patch({
                      importantDates: draft.importantDates.filter((item) => item.key !== row.key),
                    })
                  }
                  meta={[
                    PRECISION_LABEL[row.datePrecision],
                    row.date ? formatMonthDay(row.date) : (row.dateText ?? "时间待定"),
                    row.repeatType === "yearly" ? "每年重复" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))
            ) : undefined}
          </ParsedFieldCard>

          <ParsedFieldCard
            title="未完待续"
            empty="这一段里没有答应过的事情。"
            hint={draft.commitments.length > 0 ? `${draft.commitments.length} 条` : undefined}
          >
            {draft.commitments.length > 0 ? (
              draft.commitments.map((row) => (
                <ParsedRow
                  key={row.key}
                  label="未完待续"
                  keep={row.keep}
                  onKeepChange={(keep) =>
                    patch({
                      commitments: draft.commitments.map((item) =>
                        item.key === row.key ? { ...item, keep } : item,
                      ),
                    })
                  }
                  value={row.content}
                  onValueChange={(content) =>
                    patch({
                      commitments: draft.commitments.map((item) =>
                        item.key === row.key ? { ...item, content } : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    patch({ commitments: draft.commitments.filter((item) => item.key !== row.key) })
                  }
                  meta={row.dueText ? `提到的时间：${row.dueText}` : undefined}
                />
              ))
            ) : undefined}
          </ParsedFieldCard>

          <ParsedFieldCard
            title="偏好"
            empty="这一段里没有提到喜好。"
            hint={draft.preferences.length > 0 ? `${draft.preferences.length} 条` : undefined}
          >
            {draft.preferences.length > 0 ? (
              draft.preferences.map((row) => (
                <ParsedRow
                  key={row.key}
                  label="偏好"
                  keep={row.keep}
                  onKeepChange={(keep) =>
                    patch({
                      preferences: draft.preferences.map((item) =>
                        item.key === row.key ? { ...item, keep } : item,
                      ),
                    })
                  }
                  value={row.content}
                  onValueChange={(content) =>
                    patch({
                      preferences: draft.preferences.map((item) =>
                        item.key === row.key ? { ...item, content } : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    patch({ preferences: draft.preferences.filter((item) => item.key !== row.key) })
                  }
                  meta={CATEGORY_LABEL[row.category]}
                />
              ))
            ) : undefined}
          </ParsedFieldCard>

          {draft.borrowRecords.length > 0 && (
            <ParsedFieldCard title="借还" hint={`${draft.borrowRecords.length} 条`}>
              {draft.borrowRecords.map((row) => (
                <ParsedRow
                  key={row.key}
                  label="借还"
                  keep={row.keep}
                  onKeepChange={(keep) =>
                    patch({
                      borrowRecords: draft.borrowRecords.map((item) =>
                        item.key === row.key ? { ...item, keep } : item,
                      ),
                    })
                  }
                  value={row.itemName}
                  onValueChange={(itemName) =>
                    patch({
                      borrowRecords: draft.borrowRecords.map((item) =>
                        item.key === row.key ? { ...item, itemName } : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    patch({
                      borrowRecords: draft.borrowRecords.filter((item) => item.key !== row.key),
                    })
                  }
                  meta={row.direction === "lent_to" ? "我借给他/她" : "他/她借给我"}
                />
              ))}
            </ParsedFieldCard>
          )}
        </div>
      </div>

      <footer className="sticky bottom-0 flex flex-col gap-2 border-t border-line-subtle bg-base/95 py-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/*
            这里不能写"勾选" —— 页面上没有勾选框，上面出现的条目全都会保存，
            想不要只能逐条删掉。所以文案要照实说：留下的是"上面这 N 条"。
          */}
          <p className="text-sm text-ink-3">
            {rowCount > 0 ? (
              <>
                两个保存方式的区别：<span className="text-ink-2">全部保存</span> 会留下时间轴上这一条，
                以及上面这 <span className="text-ink-2">{rowCount} 条</span>结构化内容；
                <span className="text-ink-2">仅保存为一条互动</span> 只留时间轴，上面那些卡片不生成。
                上面出现的条目都会保存，不想要的可以直接删掉。
              </>
            ) : (
              <>
                这次没有识别出结构化内容，两种保存方式的结果一样：
                都会存成时间轴上的一条互动，之后随时可以补近况或未完待续。
              </>
            )}
          </p>
          {!draft.personId && <span className="text-sm text-warning">先选择一个人才能保存</span>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="md"
            icon={<RotateCcw className="size-4" aria-hidden />}
            onClick={onReparse}
            disabled={saving}
          >
            重新整理
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={onSaveInteractionOnly}
            disabled={saving}
            title="只把这段原文存成时间轴上的一条互动"
          >
            仅保存为一条互动
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={onSave}
            loading={saving}
            disabled={saving || !draft.personId}
          >
            全部保存
          </Button>
        </div>
      </footer>
    </div>
  );
}
