import { api } from "@/lib/api";
import type { Group, GroupInput, PersonDetail, PersonInput, PersonPatch, PersonSummary } from "@/types";

/** 规范 §45 People */
export const peopleService = {
  list: (filters?: { group?: string; search?: string }, signal?: AbortSignal) =>
    api.get<PersonSummary[]>("/people", { query: filters, signal }),

  get: (id: string, signal?: AbortSignal) => api.get<PersonDetail>(`/people/${id}`, { signal }),

  create: (input: PersonInput) => api.post<PersonDetail>("/people", input),

  update: (id: string, patch: PersonPatch) => api.patch<PersonDetail>(`/people/${id}`, patch),

  /** 规范 §58: V1 只实现「删除人物与所有相关记录」。 */
  remove: (id: string) => api.del<void>(`/people/${id}`),
};

/** 规范 §45 Groups */
export const groupsService = {
  list: (signal?: AbortSignal) => api.get<Group[]>("/groups", { signal }),
  create: (input: GroupInput) => api.post<Group>("/groups", input),
  update: (id: string, patch: Partial<GroupInput>) => api.patch<Group>(`/groups/${id}`, patch),
  remove: (id: string) => api.del<void>(`/groups/${id}`),
};
