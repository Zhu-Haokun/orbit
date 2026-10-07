import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PersonAvatarPicker, DEFAULT_AVATARS } from "@/features/people/PersonAvatarPicker";
import { uploadsService } from "@/services/ai";

/**
 * 头像选择器：本地上传（主）、内置默认头像、图片链接三条路，
 * 以及"选文件时就校验"（文档 P1-4）。
 */

vi.mock("@/services/ai", () => ({
  aiService: { parse: vi.fn(), commit: vi.fn() },
  uploadsService: { image: vi.fn() },
}));

function pngFile(name: string, megabytes: number): File {
  const bytes = new Uint8Array(Math.round(megabytes * 1024 * 1024));
  return new File([bytes], name, { type: "image/png" });
}

describe("PersonAvatarPicker", () => {
  beforeEach(() => {
    vi.mocked(uploadsService.image).mockReset();
    vi.mocked(uploadsService.image).mockResolvedValue({
      url: "/uploads/abc.png",
      fileType: "image",
    });
  });

  it("展开后能看到全部内置头像", async () => {
    const user = userEvent.setup();
    render(<PersonAvatarPicker value="" onChange={vi.fn()} name="林夕" />);

    await user.click(screen.getByRole("button", { name: "默认头像" }));

    expect(screen.getAllByRole("button", { name: /^使用.+头像$/ })).toHaveLength(
      DEFAULT_AVATARS.length,
    );
  });

  it("挑一个内置头像会回传它的地址", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PersonAvatarPicker value="" onChange={onChange} name="林夕" />);

    await user.click(screen.getByRole("button", { name: "默认头像" }));
    await user.click(screen.getByRole("button", { name: "使用月亮头像" }));

    expect(onChange).toHaveBeenCalledWith("/avatars/moon.svg");
  });

  it("上传本地图片成功后回传 /uploads 地址", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PersonAvatarPicker value="" onChange={onChange} name="林夕" />);

    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input, pngFile("me.png", 0.01));

    await waitFor(() => expect(uploadsService.image).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/uploads/abc.png"));
  });

  it("超过 5MB 的图片在前端就被拦下，不会发请求", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PersonAvatarPicker value="" onChange={onChange} name="林夕" />);

    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input, pngFile("huge.png", 6));

    expect(await screen.findByText(/换一张小于 5MB 的/)).toBeInTheDocument();
    expect(uploadsService.image).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("类型不对时也会立刻提示（accept 被绕过时兜底）", async () => {
    // input 的 accept 会挡住选择框里的 txt，但拖拽/程序化设置能绕过，
    // 所以组件里那一层类型校验仍然必要。这里直接派发 change 来覆盖它。
    const onChange = vi.fn();
    render(<PersonAvatarPicker value="" onChange={onChange} name="林夕" />);

    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([new Uint8Array(16)], "note.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("只支持 jpg、png、webp 这几种图片。")).toBeInTheDocument();
    expect(uploadsService.image).not.toHaveBeenCalled();
  });

  it("可以清除已经选好的头像", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PersonAvatarPicker value="/avatars/cat.svg" onChange={onChange} name="林夕" />);

    await user.click(screen.getByRole("button", { name: "清除" }));

    expect(onChange).toHaveBeenCalledWith("");
  });
});
