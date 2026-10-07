import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CreatePersonModal } from "@/features/people/CreatePersonModal";
import { peopleService, groupsService } from "@/services/people";
import { useUiStore } from "@/stores/uiStore";
import { renderWithProviders } from "@/test/renderWithProviders";
import type { PersonDetail } from "@/types";

/**
 * 规范 §20 新建人物 Modal + §72 “可创建人物”。
 */

vi.mock("@/services/people", () => ({
  peopleService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  groupsService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const CREATED = {
  id: "p-linxi",
  name: "林夕",
  nickname: null,
  avatarUrl: null,
  relationshipLabel: null,
  metAt: null,
  notes: null,
  circleLevel: "normal",
  groups: [],
  createdAt: "2026-10-05T12:00:00Z",
  updatedAt: "2026-10-05T12:00:00Z",
  lastInteractionAt: null,
  interactionCount: 0,
  latestUpdate: null,
  openCommitmentCount: 0,
  nextImportantDate: null,
  updates: [],
  commitments: [],
  importantDates: [],
  preferences: [],
  borrowRecords: [],
  interactions: [],
} as unknown as PersonDetail;

describe("CreatePersonModal", () => {
  beforeEach(() => {
    vi.mocked(groupsService.list).mockResolvedValue([]);
    vi.mocked(peopleService.create).mockReset();
    vi.mocked(peopleService.create).mockResolvedValue(CREATED);
    useUiStore.setState({ createPersonOpen: true });
  });

  it("填写姓名后可以加入星图，并关闭弹窗", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreatePersonModal />);

    await user.type(await screen.findByPlaceholderText("例如：林夕"), "林夕");
    await user.click(screen.getByRole("button", { name: "添加到星图" }));

    await waitFor(() => expect(peopleService.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(peopleService.create).mock.calls[0]?.[0]).toMatchObject({ name: "林夕" });
    await waitFor(() => expect(useUiStore.getState().createPersonOpen).toBe(false));
  });

  it("姓名为空时不会提交，并给出提示", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreatePersonModal />);

    await user.click(await screen.findByRole("button", { name: "添加到星图" }));

    expect(await screen.findByText("写一个名字吧")).toBeInTheDocument();
    expect(peopleService.create).not.toHaveBeenCalled();
  });
});
