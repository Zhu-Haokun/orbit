import { api } from "@/lib/api";
import type {
  BorrowRecord,
  BorrowRecordInput,
  BorrowRecordPatch,
  Commitment,
  CommitmentInput,
  CommitmentPatch,
  ImportantDate,
  ImportantDateInput,
  ImportantDatePatch,
  Interaction,
  InteractionInput,
  InteractionPatch,
  PersonUpdate,
  PersonUpdateInput,
  PersonUpdatePatch,
  Preference,
  PreferenceInput,
  PreferencePatch,
} from "@/types";

/**
 * 规范 §3: Orbit 记录的是“你们之间发生过什么”。
 * These are the six record kinds that hang off a person.
 */

export const interactionsService = {
  listByPerson: (personId: string, signal?: AbortSignal) =>
    api.get<Interaction[]>(`/people/${personId}/interactions`, { signal }),
  /** 还没整理的「先记下来」。放服务端，离开页面或刷新都不会丢。 */
  listDrafts: (signal?: AbortSignal) => api.get<Interaction[]>("/interactions/drafts", { signal }),
  create: (input: InteractionInput) => api.post<Interaction>("/interactions", input),
  update: (id: string, patch: InteractionPatch) => api.patch<Interaction>(`/interactions/${id}`, patch),
  remove: (id: string) => api.del<void>(`/interactions/${id}`),
};

/** 最近近况 —— 规范 §22 */
export const updatesService = {
  listByPerson: (personId: string, signal?: AbortSignal) =>
    api.get<PersonUpdate[]>(`/people/${personId}/updates`, { signal }),
  create: (input: PersonUpdateInput) => api.post<PersonUpdate>("/updates", input),
  update: (id: string, patch: PersonUpdatePatch) => api.patch<PersonUpdate>(`/updates/${id}`, patch),
  archive: (id: string) => api.patch<PersonUpdate>(`/updates/${id}`, { status: "archived" }),
  remove: (id: string) => api.del<void>(`/updates/${id}`),
};

/** 未完待续 —— 规范 §23 */
export const commitmentsService = {
  list: (filters?: { personId?: string; status?: string }, signal?: AbortSignal) =>
    api.get<Commitment[]>("/commitments", { query: filters, signal }),
  create: (input: CommitmentInput) => api.post<Commitment>("/commitments", input),
  update: (id: string, patch: CommitmentPatch) => api.patch<Commitment>(`/commitments/${id}`, patch),
  complete: (id: string) => api.patch<Commitment>(`/commitments/${id}`, { status: "done" }),
  postpone: (id: string) => api.patch<Commitment>(`/commitments/${id}`, { status: "later" }),
  remove: (id: string) => api.del<void>(`/commitments/${id}`),
};

/** 重要日期 —— 规范 §24 */
export const importantDatesService = {
  list: (filters?: { personId?: string }, signal?: AbortSignal) =>
    api.get<ImportantDate[]>("/important-dates", { query: filters, signal }),
  create: (input: ImportantDateInput) => api.post<ImportantDate>("/important-dates", input),
  update: (id: string, patch: ImportantDatePatch) =>
    api.patch<ImportantDate>(`/important-dates/${id}`, patch),
  remove: (id: string) => api.del<void>(`/important-dates/${id}`),
};

/** 偏好 —— 规范 §25: 不自动推断，只能来自用户手动添加或明确记录并确认。 */
export const preferencesService = {
  list: (filters?: { personId?: string }, signal?: AbortSignal) =>
    api.get<Preference[]>("/preferences", { query: filters, signal }),
  create: (input: PreferenceInput) => api.post<Preference>("/preferences", input),
  update: (id: string, patch: PreferencePatch) => api.patch<Preference>(`/preferences/${id}`, patch),
  remove: (id: string) => api.del<void>(`/preferences/${id}`),
};

/** 借还 —— 规范 §26 */
export const borrowRecordsService = {
  list: (filters?: { personId?: string; status?: string }, signal?: AbortSignal) =>
    api.get<BorrowRecord[]>("/borrow-records", { query: filters, signal }),
  create: (input: BorrowRecordInput) => api.post<BorrowRecord>("/borrow-records", input),
  update: (id: string, patch: BorrowRecordPatch) =>
    api.patch<BorrowRecord>(`/borrow-records/${id}`, patch),
  markReturned: (id: string) => api.patch<BorrowRecord>(`/borrow-records/${id}`, { status: "returned" }),
  remove: (id: string) => api.del<void>(`/borrow-records/${id}`),
};
