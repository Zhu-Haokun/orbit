import { z } from "zod";

/**
 * 规范 §6.1: 使用 zod 做输入校验；文案保持温和（§53）。
 * These schemas are shared by the forms so client and server rules stay aligned.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailField = z.string().trim().min(1, "请输入邮箱").regex(EMAIL_PATTERN, "邮箱格式看起来不太对");

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "请输入密码"),
});

export const registerSchema = z
  .object({
    nickname: z.string().trim().min(1, "写一个称呼吧").max(40, "称呼太长了"),
    email: emailField,
    password: z.string().min(6, "密码至少 6 位"),
    confirmPassword: z.string().min(1, "再输入一次密码"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "两次输入的密码不一样",
    path: ["confirmPassword"],
  });

/** 规范 §20 新建人物：只有姓名是必填项。 */
export const personSchema = z.object({
  name: z.string().trim().min(1, "写一个名字吧").max(60, "名字太长了"),
  nickname: z.string().trim().max(60).optional(),
  relationshipLabel: z.string().trim().max(60).optional(),
  metAt: z.string().trim().optional(),
  notes: z.string().trim().max(500, "备注太长了").optional(),
  circleLevel: z.enum(["core", "frequent", "normal", "occasional"]),
  groupIds: z.array(z.string()),
});

export type PersonFormValues = z.infer<typeof personSchema>;

/** 规范 §28 记录页：写一句就够了。 */
export const recordSchema = z.object({
  text: z.string().trim().min(1, "写一句就够了").max(4000, "这段记录有点长"),
  personId: z.string().optional(),
  interactionDate: z.string().min(1, "选一个日期"),
});

export const interactionSchema = z.object({
  personId: z.string().min(1, "选择一个人"),
  title: z.string().trim().min(1, "写一句标题").max(120, "标题太长了"),
  content: z.string().trim().max(4000).optional(),
  interactionDate: z.string().min(1, "选一个日期"),
  location: z.string().trim().max(80).optional(),
});

export const commitmentSchema = z.object({
  personId: z.string().min(1, "选择一个人"),
  content: z.string().trim().min(1, "写一件没说完的事").max(300, "太长了"),
  dueText: z.string().trim().max(60).optional(),
  dueDate: z.string().trim().optional(),
});

export const importantDateSchema = z.object({
  personId: z.string().min(1, "选择一个人"),
  title: z.string().trim().min(1, "写一个名称").max(80, "太长了"),
  datePrecision: z.enum(["exact", "month", "season", "text"]),
  date: z.string().trim().optional(),
  dateText: z.string().trim().max(60).optional(),
  repeatType: z.enum(["none", "yearly"]),
});

export const preferenceSchema = z.object({
  personId: z.string().min(1, "选择一个人"),
  category: z.enum(["like", "dislike", "interest", "wish", "food", "other"]),
  content: z.string().trim().min(1, "写一条偏好").max(120, "太长了"),
});

export const borrowRecordSchema = z.object({
  personId: z.string().min(1, "选择一个人"),
  direction: z.enum(["borrowed_from", "lent_to"]),
  itemName: z.string().trim().min(1, "写一样东西").max(120, "太长了"),
  borrowDate: z.string().min(1, "选一个日期"),
  expectedReturnDate: z.string().trim().optional(),
  notes: z.string().trim().max(300).optional(),
});

/** Flatten a ZodError into `{ fieldName: firstMessage }` for inline form errors. */
export function collectIssues(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/** Empty strings from controlled inputs become nulls for the API. */
export function blankToNull(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}
