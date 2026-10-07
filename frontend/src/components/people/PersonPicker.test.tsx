import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PersonPicker, matchPerson } from "@/components/people/PersonPicker";
import { makePerson } from "@/test/fixtures";
import type { PersonSummary } from "@/types";

/**
 * 人物选择器：人一多时原生 select 没法用，这里保证输入过滤与键盘操作可用（规范 §43）。
 */

const LINXI = makePerson({
  id: "p-linxi",
  name: "林夕",
  nickname: "小夕",
  relationshipLabel: "大学朋友",
  groups: [{ id: "g-photo", name: "摄影社", icon: null, sortOrder: 2 }],
});
const CHENYU = makePerson({
  id: "p-chenyu",
  name: "陈屿",
  nickname: "老陈",
  relationshipLabel: "学长",
  groups: [{ id: "g-lab", name: "实验室", icon: null, sortOrder: 3 }],
});
const AJIE = makePerson({ id: "p-jie", name: "阿杰", relationshipLabel: "高中朋友" });

const PEOPLE: PersonSummary[] = [LINXI, CHENYU, AJIE];

describe("matchPerson", () => {
  it("能按姓名、昵称、关系标签和星系匹配", () => {
    expect(matchPerson(LINXI, "林夕")).toBe(true);
    expect(matchPerson(LINXI, "小夕")).toBe(true);
    expect(matchPerson(LINXI, "大学")).toBe(true);
    expect(matchPerson(LINXI, "摄影")).toBe(true);
    expect(matchPerson(LINXI, "阿杰")).toBe(false);
  });

  it("空查询命中所有人", () => {
    expect(matchPerson(LINXI, "   ")).toBe(true);
  });
});

describe("PersonPicker", () => {
  it("聚焦后展开全部候选", async () => {
    const user = userEvent.setup();
    render(<PersonPicker people={PEOPLE} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findAllByRole("option")).toHaveLength(4); // 暂不指定 + 3 人
    expect(screen.getByText("林夕")).toBeInTheDocument();
    expect(screen.getByText("陈屿")).toBeInTheDocument();
  });

  it("输入片段后只留下匹配的人", async () => {
    const user = userEvent.setup();
    render(<PersonPicker people={PEOPLE} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole("combobox"));
    await user.keyboard("摄影");

    await waitFor(() => {
      expect(screen.getByText("林夕")).toBeInTheDocument();
      expect(screen.queryByText("陈屿")).not.toBeInTheDocument();
      expect(screen.queryByText("阿杰")).not.toBeInTheDocument();
    });
  });

  it("点击候选项回调所选 id", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PersonPicker people={PEOPLE} value={null} onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("陈屿"));

    expect(onChange).toHaveBeenCalledWith("p-chenyu");
  });

  it("键盘 ↑↓ + Enter 可以选中", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PersonPicker people={PEOPLE} value={null} onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    // 第 0 项是“暂不指定”，第 1 项是林夕。
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("p-linxi");
  });

  it("允许在列表底部直接新建人物", async () => {
    const onCreateRequest = vi.fn();
    const user = userEvent.setup();
    render(
      <PersonPicker
        people={PEOPLE}
        value={null}
        onChange={vi.fn()}
        onCreateRequest={onCreateRequest}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.keyboard("新人");
    await user.click(await screen.findByText(/新建人物/));

    expect(onCreateRequest).toHaveBeenCalledTimes(1);
  });

  it("允许清空已选人物", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PersonPicker people={PEOPLE} value="p-linxi" onChange={onChange} />);

    expect(screen.getByRole("combobox")).toHaveValue("林夕");

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("取消选择"));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
