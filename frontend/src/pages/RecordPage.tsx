import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CircleCheck, X } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { RecordComposer } from "@/features/record/RecordComposer";
import {
  ParseResult,
  draftFromParse,
  toCommitInput,
  type RecordDraft,
} from "@/features/record/ParseResult";
import { usePeople } from "@/hooks/usePeople";
import { useMe } from "@/hooks/useMe";
import { useCreateInteraction, useDeleteDraft, useDrafts } from "@/hooks/useRecords";
import { ApiError } from "@/lib/api";
import { formatMonthDay, todayKey } from "@/lib/format";
import { mockParse } from "@/lib/mockParser";
import { collectIssues, recordSchema } from "@/lib/validation";
import { aiService } from "@/services/ai";
import { interactionsService } from "@/services/records";
import { toast } from "@/stores/toastStore";
import type { ParseResult as ParseResultPayload } from "@/types";

/**
 * 规范 §28–§32 记录页
 * 状态矩阵（§52 Record）：input / parsing / parsed / partial-result / parse-error / saving / saved
 *
 * 这是最高频交互：页面必须比传统表单更轻。
 */
type Stage = "input" | "parsing" | "parsed" | "partial-result" | "parse-error" | "saving" | "saved";

/**
 * 「先记下来」的收件箱（产品升级文档 P0-2 的延伸）。
 *
 * 快速记录之后如果直接跳走，用户就失去了"我刚记了什么"的上下文。
 * 这里把这一轮记下的条目留在记录页下方：可以接着写第二条，
 * 也可以点「去整理」把它送进解析流程（和「整理一下」完全一样）。
 *
 * 只是这一轮会话的清单 —— 内容早就存进档案了，这里不是"待保存"。
 */
function QuickSavedList({
  items,
  onOpen,
  onDismiss,
}: {
  items: QuickSaved[];
  onOpen: (item: QuickSaved) => void;
  onDismiss: (item: QuickSaved) => void;
}) {
  return (
    <section className="mx-auto mt-2 flex w-full max-w-[760px] flex-col gap-3 px-4 pb-16 md:px-0">
      <div className="flex items-baseline gap-3">
        <h2 className="text-sm text-ink-3">还没整理的</h2>
        <span className="text-sm text-ink-4">
          先放在这里，不会进回忆；整理完或者删掉才会消失
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.interactionId}
            className="flex items-center gap-3 rounded-md border border-line-subtle bg-surface px-4 py-3"
          >
            <Avatar name={item.personName} src={item.avatarUrl} size="sm" />

            <button
              type="button"
              onClick={() => onOpen(item)}
              className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
            >
              <span className="flex items-center gap-2 text-sm text-ink-4">
                <span className="text-ink-2">{item.personName}</span>
                <span className="rounded-pill border border-line-subtle px-2 py-0.5">先记下来</span>
              </span>
              <span className="truncate text-body text-ink-2">{item.text}</span>
            </button>

            <Button size="sm" variant="ghost" onClick={() => onOpen(item)}>
              去整理
            </Button>
            <button
              type="button"
              aria-label={`从列表里移除：${item.text.slice(0, 12)}`}
              onClick={() => onDismiss(item)}
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors duration-[140ms] hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 保存回执（文档 P0-2「记忆回执」）。
 * 记录完之后要让用户看见"到底存进去了什么"，而不是一个 toast 就跳走。
 */

interface Receipt {
  personId: string;
  date: string;
  counts: Array<{ label: string; value: number }>;
  /** true = 这次是把「先记下来」的原文整理成结构化内容，不是新建记录。 */
  organized?: boolean;
}

/** 用「先记下来」存下的一条，展示在记录页下方。 */
interface QuickSaved {
  interactionId: string;
  personId: string;
  personName: string;
  avatarUrl: string | null;
  text: string;
  at: number;
}

const COUNT_LABELS = {
  interactions: "条互动",
  updates: "条近况",
  commitments: "件未完待续",
  importantDates: "个重要日期",
  preferences: "条偏好",
  borrowRecords: "条借还",
} as const;

function countsOf(source: Record<keyof typeof COUNT_LABELS, unknown[]>): Receipt["counts"] {
  return (Object.keys(COUNT_LABELS) as Array<keyof typeof COUNT_LABELS>)
    .map((key) => ({ label: COUNT_LABELS[key], value: source[key].length }))
    .filter((item) => item.value > 0);
}

/** 解析结果里到底认出了多少东西 —— 用来区分"部分成功"和"完全没成功"。 */
function structuredCount(result: ParseResultPayload): number {
  return (
    result.updates.length +
    result.commitments.length +
    result.importantDates.length +
    result.preferences.length +
    result.borrowRecords.length
  );
}

export default function RecordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetPersonId = searchParams.get("person");

  const { data: people = [], isLoading: peopleLoading } = usePeople();
  const createInteraction = useCreateInteraction();

  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [lastPreset, setLastPreset] = useState(presetPersonId);
  const [interactionDate, setInteractionDate] = useState(todayKey());
  const [location, setLocation] = useState("");
  /**
   * 这条记录属于谁。
   *
   * 只有这一份列表（多选）：第一个是"主人物"（解析时用作 selectedPersonId），
   * 其余的人会各自收到同一条互动。之前拆成"主人物 + 额外人物"两套 state，
   * 结果选择器只会覆盖主人物，第二个人永远加不进来。
   */
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>(
    presetPersonId ? [presetPersonId] : [],
  );
  /** 独处：和上面的人互斥。 */
  const [isSolo, setIsSolo] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [draft, setDraft] = useState<RecordDraft | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  /**
   * 「先记下来」存下的条目。
   *
   * 从**服务端**读（`GET /api/interactions/drafts`），不是组件 state ——
   * 否则离开记录页或刷新就丢了。它们还没被整理，所以也不会出现在回忆里
   * （后端用 `is_draft` 把它们挡在回忆 / 今天 / 搜索之外）。
   */
  const draftsQuery = useDrafts();
  const deleteDraft = useDeleteDraft();
  // 记录时可选的心情表情，以及「我」自己那一行（独处入口）。
  const me = useMe().data;

  /**
   * 保存时用的"主人物"：独处时是「我」，否则是选中的第一个人。
   * 解析把它当作 selectedPersonId，其余的人各拿一份同样的互动。
   */
  const personId = isSolo ? (me?.id ?? null) : (selectedPersonIds[0] ?? null);
  /** 除主人物之外的人 —— 后端会为他们各建一条。 */
  const extraPersonIds = isSolo ? [] : selectedPersonIds.slice(1);

  const quickSaved: QuickSaved[] = (draftsQuery.data ?? []).map((item) => {
    const person = people.find((p) => p.id === item.personId);
    return {
      interactionId: item.id,
      personId: item.personId,
      personName: person?.name ?? "",
      avatarUrl: person?.avatarUrl ?? null,
      text: item.content,
      at: Date.parse(item.createdAt),
    };
  });
  // 记录时可选的心情表情。
  const [mood, setMood] = useState<string | null>(null);

  // 从别的人物页跳进来时（?person= 变了），同步一次选择。
  // 在渲染期间调整 state 是 React 官方推荐的做法，比 effect 少一次级联渲染。
  if (presetPersonId !== lastPreset) {
    setLastPreset(presetPersonId);
    setSelectedPersonIds(presetPersonId ? [presetPersonId] : []);
    if (presetPersonId) setIsSolo(false);
  }

  /** 「继续记录」：清空这一轮，留在记录页接着写。 */
  const resetForAnother = () => {
    setText("");
    setDraft(null);
    setAttachments([]);
    setReceipt(null);
    setDegraded(false);
    setError(undefined);
    setInteractionDate(todayKey());
    // 地点、人物、独处状态都保留：连着记几条时通常还是同一批人和同一个地方。
    setStage("input");
  };

  /**
   * 只有一句原文、没有任何结构化内容时的兜底草稿（§31「手动整理」）。
   *
   * `draftFromParse` 只会从 `personCandidates` 里取人，所以必须把页面上
   * 已经选好的人**显式塞进 candidates** —— 否则「先记下来」会明明选了人
   * 却提示"先选一下这条记录属于谁"。
   */
  const minimalDraft = (targetPersonId: string | null = personId): RecordDraft =>
    draftFromParse(
      {
        parser: "rules",
        personCandidates: targetPersonId
          ? [{ id: targetPersonId, name: people.find((p) => p.id === targetPersonId)?.name ?? "", confidence: 1 }]
          : [],
        interaction: {
          title: text.trim().slice(0, 16) || "记录一次互动",
          content: text.trim(),
          interactionDate,
          location: location.trim() || null,
          interactionType: null,
        },
        updates: [],
        commitments: [],
        importantDates: [],
        preferences: [],
        borrowRecords: [],
      },
      text.trim(),
      attachments,
    );

  /**
   * 「先记下来」：完全不解析，把原文直接存成一条互动。
   *
   * Day One 的核心经验是"打开即写"—— 用户只想先把事情记下来时，
   * 不应该被迫先确认近况、日期和未完待续。
   *
   * 存完**不跳走**，而是留在记录页，把刚记下的这条挂在下面（见 quickSaved），
   * 用户可以接着写第二条，也可以点进去做下一步。
   */
  const quickSave = async () => {
    const target = minimalDraft();
    if (!target.personId) {
      // 没手动选人时，从原文里认一下：正好只提到一个人就当成他/她。
      const mentioned = people.filter((person) => text.includes(person.name));
      if (mentioned.length === 1) target.personId = mentioned[0]!.id;
    }
    if (!target.personId) {
      toast.error("先选一下这条记录属于谁，或者把人名写进那句话里。");
      return;
    }

    setStage("saving");
    try {
      const interaction = await createInteraction.mutateAsync({
        personId: target.personId,
        title: target.title.trim() || "记录一次互动",
        content: target.content,
        interactionDate: target.interactionDate,
        location: target.location,
        source: "manual",
        attachmentUrls: target.attachments,
        mood,
        // 关键：标记成草稿。它要等整理完才进回忆。
        isDraft: true,
        // 一起的人：后端会为每个人各建一条，分别进各自档案。
        personIds: extraPersonIds,
      });
      void interaction;
      resetForAnother();
      toast.success("先记下来了，还在下面");
    } catch (apiError) {
      setStage("input");
      toast.error(apiError instanceof ApiError ? apiError.message : "暂时没能保存，稍后再试。");
    }
  };

  // 正在整理的那条「先记下来」的互动：保存时更新它，而不是新建一条。
  const [organizingId, setOrganizingId] = useState<string | null>(null);

  /**
   * 「去整理」：把这条先记下来的原文放回输入框、选好人物，直接走一次解析。
   *
   * 不跳去人物档案 —— 档案里信息很多且大多和这条无关，
   * 用户想要的其实就是"在记录页点一下整理"，和「整理一下」完全一样。
   */
  const startOrganizing = (item: QuickSaved) => {
    setOrganizingId(item.interactionId);
    setText(item.text);
    setSelectedPersonIds([item.personId]);
    setIsSolo(false);
    void runParse({ text: item.text, personId: item.personId });
  };

  /** 规范 §29: 页面不要出现巨大 spinner，只显示一句正在整理 + 轻微 skeleton。 */
  const runParse = async (override?: { text?: string; personId?: string | null }) => {
    const sourceText = override?.text ?? text;
    const sourcePersonId = override?.personId ?? personId;

    const parsed = recordSchema.safeParse({
      text: sourceText,
      personId: sourcePersonId ?? undefined,
      interactionDate,
    });
    if (!parsed.success) {
      const issues = collectIssues(parsed.error);
      setError(issues.text ?? issues.interactionDate);
      return;
    }
    setError(undefined);
    setStage("parsing");
    setDegraded(false);

    const request = {
      text: sourceText.trim(),
      selectedPersonId: sourcePersonId,
      referenceDate: interactionDate,
    };

    let result: ParseResultPayload;
    try {
      result = await aiService.parse(request);
    } catch (parseError) {
      // 规范 §31 / §32: 任何解析失败（包括非 ApiError 的意外异常）都归一化处理，
      // 绝不让异常穿透出去，也绝不让流程断在解析这一步。
      console.error("[orbit] AI 解析不可用，改用本地规则解析", parseError);
      result = mockParse({
        text: request.text,
        selectedPersonId: request.selectedPersonId,
        referenceDate: request.referenceDate,
        people,
      });

      if (structuredCount(result) === 0 && result.personCandidates.length === 0) {
        // 本地也什么都没认出来 —— 进入 parse-error，交给用户手动整理。
        setDraft(draftFromParse(result, request.text, attachments));
        setStage("parse-error");
        return;
      }

      setDegraded(true);
      setDraft(draftFromParse(result, request.text, attachments));
      setStage("partial-result");
      return;
    }

    setDraft(draftFromParse(result, request.text, attachments));
    setStage("parsed");
  };

  const saveAll = async () => {
    if (!draft) return;
    const payload = toCommitInput(draft, organizingId);
    if (!payload) {
      toast.error("先选择这条记录属于谁。");
      return;
    }
    setStage("saving");
    try {
      const created = await aiService.commit(payload);
      const organizing = Boolean(organizingId);
      setReceipt({
        personId: payload.interaction.personId,
        date: payload.interaction.interactionDate,
        // 整理已有记录时互动本身不是"新增"，别再算进去。
        counts: countsOf({
          interactions: organizing ? [] : [created.interaction],
          updates: created.updates,
          commitments: created.commitments,
          importantDates: created.importantDates,
          preferences: created.preferences,
          borrowRecords: created.borrowRecords,
        }),
        organized: organizing,
      });
      setOrganizingId(null);
      setStage("saved");
      toast.success(organizing ? "整理好了" : "已经收进星图了");
    } catch (apiError) {
      setStage("parsed");
      toast.error(apiError instanceof ApiError ? apiError.message : "暂时没能保存，稍后再试。");
    }
  };

  const saveInteractionOnly = async (target?: RecordDraft) => {
    const source = target ?? draft;
    if (!source?.personId) {
      toast.error("先选择这条记录属于谁。");
      return;
    }
    setStage("saving");
    try {
      const payload = {
        personId: source.personId,
        title: source.title.trim() || "记录一次互动",
        content: source.content,
        interactionDate: source.interactionDate,
        attachmentUrls: source.attachments,
      };
      // 整理「先记下来」的那条时，只更新原文，不再新建一条。
      const interaction = organizingId
        ? await interactionsService.update(organizingId, payload)
        : await createInteraction.mutateAsync({ ...payload, source: "manual" });
      const organizing = Boolean(organizingId);
      setReceipt({
        personId: source.personId,
        date: interaction.interactionDate,
        counts: countsOf({
          interactions: organizing ? [] : [interaction],
          updates: [],
          commitments: [],
          importantDates: [],
          preferences: [],
          borrowRecords: [],
        }),
        organized: organizing,
      });
      setOrganizingId(null);
      setStage("saved");
      toast.success(organizing ? "整理好了" : "已经收进星图了");
    } catch (apiError) {
      setStage(target ? "parse-error" : "parsed");
      toast.error(apiError instanceof ApiError ? apiError.message : "暂时没能保存，稍后再试。");
    }
  };

  if (stage === "parsing") {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 pt-10 pb-16 md:px-0 md:pt-[120px]">
        <p className="text-body text-ink-2">正在整理这段记忆…</p>
        <div className="flex flex-col gap-4">
          <SkeletonBlock lines={2} />
          <SkeletonBlock lines={3} />
        </div>
        <div className="rounded-lg border border-line-subtle bg-surface p-4">
          <SkeletonBlock lines={2} />
        </div>
      </div>
    );
  }

  /* 文档 P0-2「记忆回执」：让用户看见这次到底存进去了什么，再自己决定去哪。 */
  if (stage === "saved" && receipt) {
    const savedPerson = people.find((person) => person.id === receipt.personId);
    const groupNames = savedPerson?.groups.map((group) => group.name).join("、");
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-5 px-4 pt-16 text-center md:pt-[140px]">
        <CircleCheck className="size-9 text-accent" aria-hidden strokeWidth={1.5} />

        <div className="flex flex-col gap-2">
          <h1 className="text-h3 text-ink">
            {receipt.organized
              ? "这条已经整理好了"
              : `这段记忆已经收进${savedPerson ? `${savedPerson.name}的档案` : "星图"}`}
          </h1>
          <p className="text-sm text-ink-4">
            {formatMonthDay(receipt.date)}
            {groupNames ? ` · ${groupNames}` : ""}
          </p>
        </div>

        {receipt.counts.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg border border-line-subtle bg-surface px-5 py-3">
            <span className="text-sm text-ink-3">{receipt.organized ? "整理出" : "新增"}</span>
            {receipt.counts.map((item) => (
              <span key={item.label} className="text-body text-ink">
                {item.value} {item.label}
              </span>
            ))}
          </div>
        )}

        {receipt.organized && receipt.counts.length === 0 && (
          <p className="text-sm text-ink-3">
            没整理出新的卡片，原文已经留在时间轴上了，之后随时可以再补。
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={() => navigate(`/people/${receipt.personId}`, { replace: true })}
          >
            查看档案
          </Button>
          <Button variant="secondary" size="md" onClick={resetForAnother}>
            继续记录
          </Button>
        </div>
      </div>
    );
  }

  /* 规范 §31 parse-error：不显示技术错误，只给两条出路。 */
  if (stage === "parse-error") {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 pt-10 pb-16 md:px-0 md:pt-[120px]">
        <div className="rounded-lg border border-line-subtle bg-soft/60 px-5 py-4">
          <p className="text-body text-ink-2">这段内容没有完全整理好。</p>
          <p className="mt-1 text-sm text-ink-3">
            你可以手动调整，也可以直接按普通记录保存。
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-surface p-4">
          <p className="text-sm text-ink-3">原始文本</p>
          <p className="mt-2 text-body whitespace-pre-wrap text-ink-2">{text}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              setDraft(minimalDraft());
              setStage("parsed");
            }}
          >
            手动整理
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void saveInteractionOnly(minimalDraft())}
          >
            仅保存为一条互动
          </Button>
          <Button variant="ghost" size="md" onClick={() => setStage("input")}>
            回到输入
          </Button>
        </div>
      </div>
    );
  }

  if ((stage === "parsed" || stage === "partial-result" || stage === "saving") && draft) {
    return (
      <ParseResult
        draft={draft}
        onChange={setDraft}
        originalText={text}
        people={people}
        degraded={degraded || stage === "partial-result"}
        saving={stage === "saving"}
        onReparse={() => {
          setDraft(null);
          setDegraded(false);
          setStage("input");
        }}
        onSave={saveAll}
        onSaveInteractionOnly={() => void saveInteractionOnly()}
      />
    );
  }

  return (
    <>
      <RecordComposer
        text={text}
        onTextChange={setText}
        personIds={selectedPersonIds}
        onPersonIdsChange={setSelectedPersonIds}
        interactionDate={interactionDate}
        onDateChange={setInteractionDate}
        location={location}
        onLocationChange={setLocation}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        people={people}
        onSubmit={() => void runParse()}
        pending={peopleLoading}
        onQuickSave={quickSave}
        quickPending={createInteraction.isPending}
        mood={mood}
        onMoodChange={setMood}
        isSolo={isSolo}
        onSoloChange={setIsSolo}
        selfAvatarUrl={me?.avatarUrl ?? null}
        error={error}
      />
      {!peopleLoading && people.length === 0 && (
        <p className="mx-auto w-full max-w-[760px] px-4 pb-16 text-sm text-ink-4 md:px-0">
          星图里还没有人。先到星图右下角的「添加人物」加一个，之后就能把记录放进 TA 的档案里。
        </p>
      )}
      {quickSaved.length > 0 && (
        <QuickSavedList
          items={quickSaved}
          onOpen={startOrganizing}
          onDismiss={(item) =>
            deleteDraft.mutate(item.interactionId, {
              onError: () => toast.error("暂时没能删除这条。"),
            })
          }
        />
      )}
    </>
  );
}
