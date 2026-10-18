import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import LabIntroPage from "@/pages/LabIntroPage";

/**
 * 入口页的契约：
 * - 它本身不加载 LifeSim，只负责介绍；
 * - “进入实验场”指向 /lab/play，用户自己点进去；
 * - 必须明确它不读取 Orbit 的数据。
 */
describe("LabIntroPage", () => {
  it("先介绍，再给进入实验场的入口", () => {
    render(
      <MemoryRouter>
        <LabIntroPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("10,000");

    const links = screen.getAllByRole("link", { name: /进入实验场/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/lab/play");
    }

    // 入口页不是实验场本身：这里不应该出现 iframe。
    expect(screen.queryByTitle("平行人生 · LifeSim 实验场")).not.toBeInTheDocument();
  });

  it("明确说明不读取 Orbit 数据，并给出边界", () => {
    render(
      <MemoryRouter>
        <LabIntroPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/不读取你的星图、人物和记录/)).toBeInTheDocument();
    expect(screen.getByText(/别把它当预言/)).toBeInTheDocument();
    // 入口页不再写“约 3 分钟 / 不需要注册”。
    expect(screen.queryByText(/约 3 分钟/)).not.toBeInTheDocument();
    expect(screen.queryByText(/不需要注册/)).not.toBeInTheDocument();
  });
});
