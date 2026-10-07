/**
 * 规范 §76 推荐 Query Keys.
 * Centralised so cache invalidation never drifts between features.
 */
export const queryKeys = {
  session: ["session"] as const,
  people: (filters?: { group?: string; search?: string }) =>
    filters && (filters.group || filters.search)
      ? (["people", filters.group ?? "", filters.search ?? ""] as const)
      : (["people"] as const),
  person: (id: string) => ["person", id] as const,
  groups: ["groups"] as const,
  /** 星图上"一起出现过"的人对。 */
  galaxyLinks: ["galaxy-links"] as const,
  interactions: (personId: string) => ["interactions", personId] as const,
  /** 还没整理的「先记下来」。 */
  interactionDrafts: ["interaction-drafts"] as const,
  updates: (personId: string) => ["updates", personId] as const,
  commitments: (personId?: string, status?: string) =>
    ["commitments", personId ?? "", status ?? ""] as const,
  importantDates: (personId?: string) => ["importantDates", personId ?? ""] as const,
  preferences: (personId?: string) => ["preferences", personId ?? ""] as const,
  borrowRecords: (personId?: string, status?: string) =>
    ["borrowRecords", personId ?? "", status ?? ""] as const,
  today: ["today"] as const,
  memories: (filters?: {
    year?: number | null;
    groupId?: string | null;
    location?: string | null;
    personId?: string | null;
  }) =>
    [
      "memories",
      filters?.year ?? "all",
      filters?.groupId ?? "all",
      filters?.location ?? "all",
      filters?.personId ?? "all",
    ] as const,
  search: (query: string) => ["search", query] as const,
};
