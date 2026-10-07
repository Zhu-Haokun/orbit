import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PersonAvatarPicker } from "@/features/people/PersonAvatarPicker";
import { useCreateGroup, useGroups } from "@/hooks/usePeople";
import { ApiError } from "@/lib/api";
import { blankToNull } from "@/lib/validation";
import { toast } from "@/stores/toastStore";
import type { CircleLevel, PersonDetail, PersonInput } from "@/types";

/**
 * 规范 §20 新建人物 / §21.1 编辑人物 —— 两处共用同一组字段。
 *
 * 姓名是唯一必填项（personSchema）；昵称、头像、关系标签、星系、
 * 认识时间、备注、圈层都可以留空。
 */

export interface PersonFormState {
  name: string;
  nickname: string;
  avatarUrl: string;
  relationshipLabel: string;
  metAt: string;
  notes: string;
  circleLevel: CircleLevel;
  groupIds: string[];
  /** 只有「我」用得到。 */
  mbti: string;
  interests: string;
}

/** 规范 §20 圈层选项：这只是用户手动放置的位置，不是评分。 */
const CIRCLE_OPTIONS: ReadonlyArray<{ value: CircleLevel; label: string }> = [
  { value: "core", label: "核心圈" },
  { value: "frequent", label: "常联系" },
  { value: "normal", label: "一般联系" },
  { value: "occasional", label: "偶尔联系" },
];

export function emptyPersonForm(): PersonFormState {
  return {
    name: "",
    nickname: "",
    avatarUrl: "",
    relationshipLabel: "",
    metAt: "",
    notes: "",
    circleLevel: "normal",
    groupIds: [],
    mbti: "",
    interests: "",
  };
}

export function personFormFrom(person: PersonDetail): PersonFormState {
  return {
    name: person.name,
    nickname: person.nickname ?? "",
    avatarUrl: person.avatarUrl ?? "",
    relationshipLabel: person.relationshipLabel ?? "",
    metAt: person.metAt ? person.metAt.slice(0, 10) : "",
    notes: person.notes ?? "",
    circleLevel: person.circleLevel,
    groupIds: person.groups.map((group) => group.id),
    mbti: person.mbti ?? "",
    interests: person.interests ?? "",
  };
}

/** 空字符串一律转成 null，方便后端把字段真正清空。 */
export function personFormToInput(values: PersonFormState, isSelf = false): PersonInput {
  return {
    name: values.name.trim(),
    nickname: blankToNull(values.nickname),
    avatarUrl: blankToNull(values.avatarUrl),
    relationshipLabel: blankToNull(values.relationshipLabel),
    metAt: blankToNull(values.metAt),
    notes: blankToNull(values.notes),
    circleLevel: values.circleLevel,
    groupIds: values.groupIds,
    // MBTI / 爱好只属于「我」；建别人的时候不发这两个字段。
    ...(isSelf ? { mbti: blankToNull(values.mbti.trim().toUpperCase()) } : {}),
    ...(isSelf ? { interests: blankToNull(values.interests) } : {}),
  };
}

export interface PersonFormFieldsProps {
  values: PersonFormState;
  errors: Record<string, string>;
  onChange: <K extends keyof PersonFormState>(key: K, value: PersonFormState[K]) => void;
  /**
   * 正在编辑「我」自己。
   *
   * 对自己问"关系标签""认识时间""属于哪个星系""在哪个圈层"都不成立 ——
   * 所以这些字段直接不显示，换成 MBTI 和爱好。
   */
  isSelf?: boolean;
}

export function PersonFormFields({
  values,
  errors,
  onChange,
  isSelf = false,
}: PersonFormFieldsProps) {
  const groupsQuery = useGroups();
  const groups = groupsQuery.data ?? [];
  const createGroup = useCreateGroup();

  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);
  const newGroupRef = useRef<HTMLInputElement>(null);

  const toggleGroup = (groupId: string) => {
    const next = values.groupIds.includes(groupId)
      ? values.groupIds.filter((id) => id !== groupId)
      : [...values.groupIds, groupId];
    onChange("groupIds", next);
  };

  /** 规范 §16 / §47.1：星系是用户自己的分组，应当能在添加人物时直接新建。 */
  const submitNewGroup = () => {
    const name = newGroupName.trim();
    if (!name) {
      setGroupError("给这个星系起个名字吧。");
      return;
    }
    if (groups.some((group) => group.name === name)) {
      setGroupError("已经有一个同名星系了。");
      return;
    }
    setGroupError(null);
    createGroup.mutate(
      { name },
      {
        onSuccess: (group) => {
          // 新建完直接选中，不用再点一次。
          onChange("groupIds", [...values.groupIds, group.id]);
          setNewGroupName("");
          setAddingGroup(false);
          toast.success(`已新建星系「${group.name}」`);
        },
        onError: (error) =>
          setGroupError(error instanceof ApiError ? error.message : "暂时没能新建星系。"),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Field label="姓名" required error={errors.name}>
        {({ id, ...rest }) => (
          <Input
            id={id}
            value={values.name}
            placeholder="例如：林夕"
            autoComplete="off"
            onChange={(event) => onChange("name", event.target.value)}
            {...rest}
          />
        )}
      </Field>

      <Field label="昵称" hint="可以留空。">
        {({ id, ...rest }) => (
          <Input
            id={id}
            value={values.nickname}
            placeholder="例如：小夕"
            autoComplete="off"
            onChange={(event) => onChange("nickname", event.target.value)}
            {...rest}
          />
        )}
      </Field>

      <Field label="头像" hint="上传一张本地图片，或者直接挑一个内置头像。不填也行。">
        {({ id, ...rest }) => (
          <PersonAvatarPicker
            id={id}
            {...rest}
            value={values.avatarUrl}
            name={values.name}
            onChange={(url) => onChange("avatarUrl", url)}
          />
        )}
      </Field>

      {isSelf ? (
        <>
          <Field label="MBTI" hint="选填。只当自我介绍用，不做任何解读。">
            {({ id, ...rest }) => (
              <Input
                id={id}
                value={values.mbti}
                placeholder="例如：INFJ"
                maxLength={8}
                autoComplete="off"
                onChange={(event) => onChange("mbti", event.target.value)}
                {...rest}
              />
            )}
          </Field>

          <Field label="爱好" hint="用逗号分隔，会显示成标签。">
            {({ id, ...rest }) => (
              <Input
                id={id}
                value={values.interests}
                placeholder="例如：胶片摄影, 长跑, 手冲咖啡"
                autoComplete="off"
                onChange={(event) => onChange("interests", event.target.value)}
                {...rest}
              />
            )}
          </Field>
        </>
      ) : (
        <Field label="关系标签" error={errors.relationshipLabel}>
          {({ id, ...rest }) => (
            <Input
              id={id}
              value={values.relationshipLabel}
              placeholder="例如：大学朋友"
              autoComplete="off"
              onChange={(event) => onChange("relationshipLabel", event.target.value)}
              {...rest}
            />
          )}
        </Field>
      )}

      {!isSelf && (
      <Field
        label="星系"
        hint={
          groupsQuery.isPending
            ? undefined
            : groups.length === 0
              ? "还没有星系，可以先跳过。"
              : "可以选多个。"
        }
      >
        {({ id, "aria-describedby": describedBy }) => (
          <div className="flex flex-col gap-2">
            <div
              id={id}
              role="group"
              aria-label="星系"
              aria-describedby={describedBy}
              className="flex flex-wrap items-center gap-2"
            >
              {groups.map((group) => (
                <Chip
                  key={group.id}
                  active={values.groupIds.includes(group.id)}
                  aria-label={`星系 ${group.name}`}
                  onClick={() => toggleGroup(group.id)}
                >
                  {group.name}
                </Chip>
              ))}

              {addingGroup ? (
                <span className="flex items-center gap-2">
                  <Input
                    ref={newGroupRef}
                    autoFocus
                    value={newGroupName}
                    maxLength={40}
                    placeholder="新星系的名字"
                    aria-label="新星系的名字"
                    className="h-7 w-[150px] rounded-pill px-3 text-sm"
                    onChange={(event) => {
                      setNewGroupName(event.target.value);
                      setGroupError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitNewGroup();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setAddingGroup(false);
                        setGroupError(null);
                      }
                    }}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={createGroup.isPending}
                    onClick={submitNewGroup}
                  >
                    建立
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddingGroup(false);
                      setGroupError(null);
                      setNewGroupName("");
                    }}
                  >
                    取消
                  </Button>
                </span>
              ) : (
                <Chip
                  aria-label="新建星系"
                  className="border-dashed text-ink-3"
                  onClick={() => setAddingGroup(true)}
                >
                  ＋ 新建星系
                </Chip>
              )}
            </div>
            {groupError && <p className="text-sm text-danger">{groupError}</p>}
          </div>
        )}
      </Field>
      )}

      {!isSelf && (
        <Field label="认识时间">
          {({ id, ...rest }) => (
            <Input
              id={id}
              type="date"
              value={values.metAt}
              onChange={(event) => onChange("metAt", event.target.value)}
              {...rest}
            />
          )}
        </Field>
      )}

      <Field label={isSelf ? "关于我" : "一句备注"} error={errors.notes}>
        {({ id, ...rest }) => (
          <Input
            id={id}
            value={values.notes}
            placeholder={isSelf ? "例如：喜欢把日子记下来。" : "例如：摄影社认识，喜欢胶片。"}
            autoComplete="off"
            onChange={(event) => onChange("notes", event.target.value)}
            {...rest}
          />
        )}
      </Field>

      {!isSelf && (
      <Field
        label="圈层"
        hint="这只是你手动放置的位置，不是评分。核心圈 = 特别关注，会一直待在星图最靠内的位置。"
      >
        {({ id, ...rest }) => (
          <Select
            id={id}
            value={values.circleLevel}
            onChange={(event) => onChange("circleLevel", event.target.value as CircleLevel)}
            {...rest}
          >
            {CIRCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      )}
    </div>
  );
}
