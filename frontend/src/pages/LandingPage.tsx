import { useNavigate } from "react-router-dom";

import { OrbitLogo } from "@/components/layout/OrbitLogo";
import { Button } from "@/components/ui/Button";

/**
 * 规范 §37 Landing Page
 * 不要营销过度：Hero + 最多 3 个功能点，不做 12 个营销模块。
 */
const POINTS = [
  { title: "记住共同经历", body: "一起吃过的那顿饭、走过的那条路，都可以留在这里。" },
  { title: "留下未完待续", body: "答应过的事不会随着聊天记录一起消失。" },
  { title: "重新找到过去的上下文", body: "当你想不起细节的时候，还能找回来。" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="galaxy-glow flex min-h-dvh flex-col bg-base">
      <header className="flex h-[72px] items-center px-6 md:px-10">
        <div className="flex items-center gap-2.5">
          <OrbitLogo size={22} />
          <span className="flex flex-col leading-tight">
            <span className="text-body font-medium text-ink">Orbit</span>
            <span className="text-micro text-ink-3">人情星图</span>
          </span>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <div className="flex max-w-[720px] flex-col items-center gap-6">
          <h1 className="text-h1 text-ink md:text-display">Orbit</h1>
          <p className="text-lg text-ink-2 md:text-h3 md:font-normal">
            把人与人之间，
            <br />
            那些容易忘记的小事留住。
          </p>
          <Button variant="primary" size="lg" className="mt-2" onClick={() => navigate("/login")}>
            进入我的星图
          </Button>
        </div>

        <ul className="mt-20 grid w-full max-w-[900px] gap-4 text-left md:grid-cols-3 md:gap-6">
          {POINTS.map((point) => (
            <li key={point.title} className="rounded-lg border border-line-subtle bg-surface p-5">
              <h2 className="text-h3 text-ink">{point.title}</h2>
              <p className="mt-2 text-sm text-ink-3">{point.body}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="px-6 pb-8 text-center text-micro text-ink-4 md:px-10">
        你的星图默认只有你自己可见。Orbit 不会通知被记录的人。
      </footer>
    </div>
  );
}
