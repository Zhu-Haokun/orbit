import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import LabPage from "@/pages/LabPage";

/**
 * 平行人生运行页的契约：
 * - 用 iframe 加载 /lifesim/index.html（不是目录 URL，否则会被 SPA catch-all 吞掉）；
 * - 提供返回 Orbit 的链接，进入后不会困在子应用里。
 */
describe("LabPage", () => {
  it("用 iframe 加载独立的 LifeSim 静态子应用", () => {
    render(
      <MemoryRouter>
        <LabPage />
      </MemoryRouter>,
    );

    const frame = screen.getByTitle("平行人生 · LifeSim 实验场");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "/lifesim/index.html");
  });

  it("提供返回 Orbit 和新标签打开的入口", () => {
    render(
      <MemoryRouter>
        <LabPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /返回 Orbit/ })).toHaveAttribute("href", "/galaxy");
    expect(screen.getByRole("link", { name: /新标签打开/ })).toHaveAttribute(
      "href",
      "/lifesim/index.html",
    );
  });
});
