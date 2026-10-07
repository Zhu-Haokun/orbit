/**
 * Orbit / 人情星图 —— shared API contract.
 *
 * This file is the single source of truth for the shape of every payload that
 * crosses the network. The FastAPI backend mirrors these names exactly
 * (camelCase over the wire, see backend/app/schemas/common.py).
 *
 * See 规范 §44 数据模型 / §45 API / §77 TypeScript 类型.
 */

/* ------------------------------------------------------------------ *
 * Enums — 规范 §77: 保持前后端 enum 一致
 * ------------------------------------------------------------------ */

export type CircleLevel = "core" | "frequent" | "normal" | "occasional";

export type CommitmentStatus = "open" | "done" | "cancelled" | "later";

export type DatePrecision = "exact" | "month" | "season" | "text";

export type RepeatType = "none" | "yearly";

export type InteractionSource = "manual" | "ai_parsed";

export type UpdateStatus = "active" | "archived";

export type BorrowDirection = "borrowed_from" | "lent_to";

export type BorrowStatus = "open" | "returned" | "cancelled";

export type PreferenceCategory = "like" | "dislike" | "interest" | "wish" | "food" | "other";

export type AttachmentFileType = "image" | "file";

export type ParserKind = "llm" | "rules";

/* ------------------------------------------------------------------ *
 * Auth — 规范 §6.4 / §45 Auth
 * ------------------------------------------------------------------ */

export interface User {
  id: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  accessToken: string;
  tokenType: string;
  user: User;
}

export interface RegisterInput {
  nickname: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/* ------------------------------------------------------------------ *
 * Groups / People — 规范 §44 people, groups, people_groups
 * ------------------------------------------------------------------ */

export interface Group {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  personCount: number;
}

export interface GroupInput {
  name: string;
  icon?: string | null;
  sortOrder?: number;
}

/** A very small group reference, embedded inside a person payload. */
export interface GroupRef {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
}

export interface ImportantDateLite {
  id: string;
  title: string;
  date: string | null;
  dateText: string | null;
  datePrecision: DatePrecision;
  repeatType: RepeatType;
}

export interface PersonSummary {
  id: string;
  name: string;
  nickname: string | null;
  avatarUrl: string | null;
  relationshipLabel: string | null;
  metAt: string | null;
  notes: string | null;
  circleLevel: CircleLevel;
  groups: GroupRef[];
  createdAt: string;
  updatedAt: string;

  /** 「我」自己的那一条：星图中心用它，/api/people 不返回它。 */
  isSelf: boolean;
  mbti: string | null;
  interests: string | null;

  /** Derived: 最近互动时间，用于星图亮度与 Hover Card。 */
  lastInteractionAt: string | null;
  /** Derived: 记录条数。 */
  interactionCount: number;
  /** Derived: 最近一条 active 的近况内容。 */
  latestUpdate: string | null;
  /** Derived: 未完成的未完待续数量。 */
  openCommitmentCount: number;
  /** Derived: 最近一个尚未过去的重要日期。 */
  nextImportantDate: ImportantDateLite | null;
}

export interface PersonDetail extends PersonSummary {
  updates: PersonUpdate[];
  commitments: Commitment[];
  importantDates: ImportantDate[];
  preferences: Preference[];
  borrowRecords: BorrowRecord[];
  interactions: Interaction[];
}

export interface PersonInput {
  name: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  relationshipLabel?: string | null;
  metAt?: string | null;
  notes?: string | null;
  circleLevel?: CircleLevel;
  groupIds?: string[];
  /** 只有「我」用得到：MBTI 与爱好，都是用户自己填的。 */
  mbti?: string | null;
  interests?: string | null;
}

export type PersonPatch = Partial<PersonInput>;

/* ------------------------------------------------------------------ *
 * Interactions — 规范 §44 interactions / attachments
 * ------------------------------------------------------------------ */

export interface Attachment {
  id: string;
  interactionId: string;
  fileType: AttachmentFileType;
  fileUrl: string;
  createdAt: string;
}

export interface Interaction {
  id: string;
  personId: string;
  title: string;
  content: string;
  interactionDate: string;
  location: string | null;
  interactionType: string | null;
  source: InteractionSource;
  /** 记录时选的心情表情（可选）。 */
  mood: string | null;
  /** 「先记下来」但还没整理：不进回忆 / 今天 / 搜索。 */
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
}

export interface InteractionInput {
  personId: string;
  title: string;
  content: string;
  interactionDate: string;
  location?: string | null;
  interactionType?: string | null;
  source?: InteractionSource;
  attachmentUrls?: string[];
  mood?: string | null;
  /** 「先记下来」创建时置 true；整理完成后由 commit 置回 false。 */
  isDraft?: boolean;
  /** 一起经历的人：后端会为每个人各建一条，分别进各自档案。 */
  personIds?: string[];
}

export type InteractionPatch = Partial<Omit<InteractionInput, "personId">>;

/* ------------------------------------------------------------------ *
 * Person updates — 规范 §44 person_updates（最近近况）
 * ------------------------------------------------------------------ */

export interface PersonUpdate {
  id: string;
  personId: string;
  content: string;
  sourceInteractionId: string | null;
  status: UpdateStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PersonUpdateInput {
  personId: string;
  content: string;
  sourceInteractionId?: string | null;
  status?: UpdateStatus;
}

export type PersonUpdatePatch = Partial<Omit<PersonUpdateInput, "personId">>;

/* ------------------------------------------------------------------ *
 * Commitments — 规范 §44 commitments（未完待续）
 * ------------------------------------------------------------------ */

export interface Commitment {
  id: string;
  personId: string;
  content: string;
  dueDate: string | null;
  dueText: string | null;
  status: CommitmentStatus;
  sourceInteractionId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CommitmentInput {
  personId: string;
  content: string;
  dueDate?: string | null;
  dueText?: string | null;
  status?: CommitmentStatus;
  sourceInteractionId?: string | null;
}

export type CommitmentPatch = Partial<Omit<CommitmentInput, "personId">>;

/* ------------------------------------------------------------------ *
 * Important dates — 规范 §24 / §44 important_dates
 * ------------------------------------------------------------------ */

export interface ImportantDate {
  id: string;
  personId: string;
  title: string;
  date: string | null;
  dateText: string | null;
  datePrecision: DatePrecision;
  repeatType: RepeatType;
  notes: string | null;
  createdAt: string;
}

export interface ImportantDateInput {
  personId: string;
  title: string;
  date?: string | null;
  dateText?: string | null;
  datePrecision?: DatePrecision;
  repeatType?: RepeatType;
  notes?: string | null;
}

export type ImportantDatePatch = Partial<Omit<ImportantDateInput, "personId">>;

/* ------------------------------------------------------------------ *
 * Preferences — 规范 §25 / §44 preferences
 * ------------------------------------------------------------------ */

export interface Preference {
  id: string;
  personId: string;
  category: PreferenceCategory;
  content: string;
  sourceInteractionId: string | null;
  createdAt: string;
}

export interface PreferenceInput {
  personId: string;
  category: PreferenceCategory;
  content: string;
  sourceInteractionId?: string | null;
}

export type PreferencePatch = Partial<Omit<PreferenceInput, "personId">>;

/* ------------------------------------------------------------------ *
 * Borrow records — 规范 §26 / §44 borrow_records
 * ------------------------------------------------------------------ */

export interface BorrowRecord {
  id: string;
  personId: string;
  direction: BorrowDirection;
  itemName: string;
  amount: string | null;
  borrowDate: string;
  expectedReturnDate: string | null;
  status: BorrowStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BorrowRecordInput {
  personId: string;
  direction: BorrowDirection;
  itemName: string;
  amount?: string | null;
  borrowDate: string;
  expectedReturnDate?: string | null;
  status?: BorrowStatus;
  notes?: string | null;
}

export type BorrowRecordPatch = Partial<Omit<BorrowRecordInput, "personId">>;

/* ------------------------------------------------------------------ *
 * Embedded person reference used by aggregate endpoints
 * ------------------------------------------------------------------ */

export interface PersonRef {
  id: string;
  name: string;
  avatarUrl: string | null;
  relationshipLabel: string | null;
}

/* ------------------------------------------------------------------ *
 * Today — 规范 §33 / §45 Today
 * ------------------------------------------------------------------ */

export interface TodayImportantDate extends ImportantDate {
  person: PersonRef;
  isToday: boolean;
  inDays: number;
  /** 规范 §33.3 “去年你记录：” */
  lastYearMemory: { title: string; content: string; date: string } | null;
}

export interface TodayCommitment extends Commitment {
  person: PersonRef;
  /** 记录来源日期，用于 “昨天记录”。 */
  recordedAt: string | null;
}

export interface TodayBorrowRecord extends BorrowRecord {
  person: PersonRef;
}

/** 规范 §33.5 值得回看的记忆 */
export interface MemoryPrompt {
  person: PersonRef;
  lastInteractionAt: string | null;
  lastInteractionTitle: string | null;
  lastInteractionContent: string | null;
  daysSince: number | null;
}

export interface TodayPayload {
  date: string;
  /** 规范 §33.1 “今天有 3 件与你在乎的人有关的事情。” */
  headlineCount: number;
  importantDates: TodayImportantDate[];
  commitments: TodayCommitment[];
  borrowRecords: TodayBorrowRecord[];
  memoryPrompts: MemoryPrompt[];
}

/* ------------------------------------------------------------------ *
 * Memories — 规范 §34
 * ------------------------------------------------------------------ */

export interface MemoryItem {
  interactionId: string;
  title: string;
  content: string;
  date: string;
  location: string | null;
  people: PersonRef[];
  groupNames: string[];
  attachments: Attachment[];
  /** 回看时留下的评论，按时间正序。 */
  comments: MemoryComment[];
  /** 记录时选的心情表情。 */
  mood: string | null;
  /** 这条是「独处」记录（挂在"我"名下）。 */
  isSelf: boolean;
}

export interface MemoryComment {
  id: string;
  interactionId: string;
  content: string;
  emoji: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCommentInput {
  content: string;
  emoji?: string | null;
}

export interface MemoryMonth {
  key: string;
  year: number;
  month: number;
  label: string;
  items: MemoryItem[];
}

export interface MemorySummary {
  year: number | null;
  interactionCount: number;
  peopleCount: number;
  placeCount: number;
}

export interface MemoriesPayload {
  year: number | null;
  years: number[];
  months: MemoryMonth[];
  summary: MemorySummary;
}

/* ------------------------------------------------------------------ *
 * Search — 规范 §35 / §45 Search
 * ------------------------------------------------------------------ */

export interface SearchPersonHit {
  person: PersonSummary;
  matchedIn: string[];
}

export interface SearchMemoryHit {
  interaction: Interaction;
  person: PersonRef | null;
}

export interface SearchCommitmentHit {
  commitment: Commitment;
  person: PersonRef | null;
}

export interface SearchBorrowHit {
  borrowRecord: BorrowRecord;
  person: PersonRef | null;
}

export interface SearchResults {
  query: string;
  people: SearchPersonHit[];
  memories: SearchMemoryHit[];
  commitments: SearchCommitmentHit[];
  borrowRecords: SearchBorrowHit[];
  total: number;
}

/* ------------------------------------------------------------------ *
 * AI parse — 规范 §30 / §45 AI parse / §46 Prompt 约束
 * ------------------------------------------------------------------ */

export interface PersonCandidate {
  id: string | null;
  name: string;
  confidence: number;
}

export interface ParsedInteraction {
  title: string;
  content: string;
  interactionDate: string;
  location: string | null;
  interactionType: string | null;
}

export interface ParsedUpdate {
  content: string;
}

export interface ParsedCommitment {
  content: string;
  dueDate: string | null;
  dueText: string | null;
}

export interface ParsedImportantDate {
  title: string;
  date: string | null;
  dateText: string | null;
  datePrecision: DatePrecision;
  repeatType: RepeatType;
}

export interface ParsedPreference {
  category: PreferenceCategory;
  content: string;
}

export interface ParsedBorrow {
  direction: BorrowDirection;
  itemName: string;
  borrowDate: string | null;
}

export interface ParseRequest {
  text: string;
  selectedPersonId: string | null;
  referenceDate: string;
}

export interface ParseResult {
  parser: ParserKind;
  personCandidates: PersonCandidate[];
  interaction: ParsedInteraction;
  updates: ParsedUpdate[];
  commitments: ParsedCommitment[];
  importantDates: ParsedImportantDate[];
  preferences: ParsedPreference[];
  borrowRecords: ParsedBorrow[];
}

/** 规范 §30 确认保存时提交的聚合载荷。 */
export interface CommitParseInput {
  interaction: InteractionInput;
  updates: Array<{ content: string; status?: UpdateStatus }>;
  commitments: Array<{ content: string; dueDate?: string | null; dueText?: string | null }>;
  importantDates: Array<{
    title: string;
    date?: string | null;
    dateText?: string | null;
    datePrecision?: DatePrecision;
    repeatType?: RepeatType;
  }>;
  preferences: Array<{ category: PreferenceCategory; content: string }>;
  borrowRecords: Array<{
    direction: BorrowDirection;
    itemName: string;
    borrowDate?: string | null;
  }>;
  attachmentUrls?: string[];
  /** 传了就更新这条已有互动（「先记下来」之后再整理），不传则新建。 */
  interactionId?: string;
  /** 一起经历的人：为每人各建一条互动（结构化内容仍只在主人物名下）。 */
  personIds?: string[];
}

export interface CommitParseResult {
  interaction: Interaction;
  updates: PersonUpdate[];
  commitments: Commitment[];
  importantDates: ImportantDate[];
  preferences: Preference[];
  borrowRecords: BorrowRecord[];
}

/* ------------------------------------------------------------------ *
 * Export — 规范 §88
 * ------------------------------------------------------------------ */

export interface ExportPayload {
  exportedAt: string;
  user: User;
  people: PersonSummary[];
  groups: Group[];
  interactions: Interaction[];
  commitments: Commitment[];
  importantDates: ImportantDate[];
  preferences: Preference[];
  borrowRecords: BorrowRecord[];
}

/* ------------------------------------------------------------------ *
 * Uploads — 规范 §57
 * ------------------------------------------------------------------ */

export interface UploadResult {
  url: string;
  fileType: AttachmentFileType;
}
