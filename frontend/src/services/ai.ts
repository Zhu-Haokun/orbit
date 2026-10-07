import { api, upload } from "@/lib/api";
import type { CommitParseInput, CommitParseResult, ParseRequest, ParseResult, UploadResult } from "@/types";

/** 规范 §45 AI parse / §30 确认保存 */
export const aiService = {
  parse: (input: ParseRequest, signal?: AbortSignal) =>
    api.post<ParseResult>("/ai/parse-interaction", input, { signal }),

  /** 规范 §30: 保存前必须用户确认，这里提交用户勾选后的最终结果。 */
  commit: (input: CommitParseInput) => api.post<CommitParseResult>("/interactions/commit", input),
};

/** 规范 §57: 附件只支持图片。 */
export const uploadsService = {
  image: (file: File, signal?: AbortSignal) => upload<UploadResult>("/uploads", file, signal),
};
