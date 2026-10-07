import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchPage } from "@/pages/SearchPage";
import { searchService } from "@/services/insights";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { SearchResults } from "@/types";

/**
 * 规范 §35 搜索：分类展示、关键词高亮、空结果文案。
 */

vi.mock("@/services/insights", () => ({
  todayService: { get: vi.fn() },
  searchService: { search: vi.fn() },
  memoriesService: { get: vi.fn() },
  exportService: { json: vi.fn(), csv: vi.fn() },
}));

const EMPTY: SearchResults = {
  query: "",
  people: [],
  memories: [],
  commitments: [],
  borrowRecords: [],
  total: 0,
};

const WITH_RESULT: SearchResults = {
  query: "剪辑",
  people: [],
  memories: [
    {
      person: { id: "p-1", name: "林夕", avatarUrl: null, relationshipLabel: "大学朋友" },
      interaction: {
        id: "i-1",
        personId: "p-1",
        title: "喝咖啡",
        content: "她说最近想开始学剪辑。",
        interactionDate: "2026-10-05T12:00:00Z",
        location: null,
        interactionType: null,
        source: "manual",
        mood: null,
        isDraft: false,
        createdAt: "2026-10-05T12:00:00Z",
        updatedAt: "2026-10-05T12:00:00Z",
        attachments: [],
      },
    },
  ],
  commitments: [],
  borrowRecords: [],
  total: 1,
};

describe("SearchPage", () => {
  beforeEach(() => {
    vi.mocked(searchService.search).mockReset();
    vi.mocked(searchService.search).mockResolvedValue(EMPTY);
  });

  it("输入关键词后按分类展示结果", async () => {
    vi.mocked(searchService.search).mockResolvedValue(WITH_RESULT);
    const user = userEvent.setup();
    renderWithProviders(<SearchPage />, { route: "/search" });

    await user.type(screen.getByPlaceholderText("搜索一个人、一件事、一段回忆…"), "剪辑");

    await waitFor(() => expect(searchService.search).toHaveBeenCalled());
    expect(await screen.findByText("记忆")).toBeInTheDocument();
    expect(await screen.findByText(/想开始学剪辑/)).toBeInTheDocument();
  });

  it("没有结果时显示 §35.3 的文案", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchPage />, { route: "/search" });

    await user.type(screen.getByPlaceholderText("搜索一个人、一件事、一段回忆…"), "不存在的东西");

    expect(await screen.findByText("没有找到相关记录。", {}, { timeout: 3000 })).toBeInTheDocument();
  });
});
