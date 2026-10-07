import type { PersonSummary } from "@/types";

/** 测试用的最小人物工厂，只覆盖断言需要的字段。 */
export function makePerson(overrides: Partial<PersonSummary> & { name: string }): PersonSummary {
  return {
    id: overrides.id ?? `person-${overrides.name}`,
    name: overrides.name,
    nickname: overrides.nickname ?? null,
    avatarUrl: null,
    relationshipLabel: overrides.relationshipLabel ?? null,
    metAt: overrides.metAt ?? null,
    notes: null,
    circleLevel: overrides.circleLevel ?? "normal",
    groups: overrides.groups ?? [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    isSelf: overrides.isSelf ?? false,
    mbti: overrides.mbti ?? null,
    interests: overrides.interests ?? null,
    lastInteractionAt: overrides.lastInteractionAt ?? null,
    interactionCount: overrides.interactionCount ?? 0,
    latestUpdate: overrides.latestUpdate ?? null,
    openCommitmentCount: overrides.openCommitmentCount ?? 0,
    nextImportantDate: overrides.nextImportantDate ?? null,
  };
}
