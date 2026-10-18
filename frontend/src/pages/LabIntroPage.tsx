import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Compass,
  ShieldCheck,
  Sparkles,
  Telescope,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/**
 * 平行人生 · 入口页（第六个导航项先到这里，不直接进 iframe）。
 *
 * 为什么要有这一页：
 * - 直接把人扔进 LifeSim 的完整界面，用户不知道它和 Orbit 是什么关系；
 * - 这一页用 Orbit 的语言解释“它是什么 / 不是什么”，并明确它不读任何记录；
 * - 用户自己点“进入实验场”之后才加载 LifeSim，入口更像一扇门，而不是一次跳转。
 *
 * 页面本身是纯静态文案，不请求任何接口，也不读取任何人物或记录。
 */

const MODES = [
  {
    icon: Zap,
    title: "极速一生",
    desc: "5 秒生成完整一生，只看关键事件与概率拆解。",
  },
  {
    icon: Compass,
    title: "关键人生",
    desc: "在 6 个岔路口停下来，由你决定下一步，其余交给策略。",
  },
  {
    icon: Telescope,
    title: "平行宇宙",
    desc: "把同一种活法重演 10,000 次，看分布、尾部风险与相关结构。",
  },
] as const;

const STATS = [
  { value: "17", label: "种随机事件" },
  { value: "9", label: "种概率分布" },
  { value: "6", label: "个策略维度" },
  { value: "10,000", label: "次重演 / 局" },
] as const;

/** 固定的星点，避免每次渲染位置都变（也避免引入随机数）。 */
const STARS = [
  [6, 18, 2, 0.5],
  [13, 72, 1, 0.4],
  [21, 36, 1, 0.3],
  [29, 84, 2, 0.35],
  [35, 12, 1, 0.5],
  [44, 58, 1, 0.3],
  [52, 26, 2, 0.4],
  [58, 78, 1, 0.35],
  [66, 14, 1, 0.45],
  [73, 48, 2, 0.3],
  [81, 22, 1, 0.4],
  [88, 66, 1, 0.35],
  [94, 38, 2, 0.3],
  [10, 48, 1, 0.25],
  [48, 8, 1, 0.35],
  [76, 88, 1, 0.3],
] as const;

const ENTER_CLASS =
  "inline-flex h-[46px] items-center justify-center gap-2 rounded-md bg-accent px-5 text-body font-medium text-on-accent transition-colors duration-[140ms] hover:bg-accent-hover active:duration-[100ms]";

function EnterLink({ className }: { className?: string }) {
  return (
    <Link to="/lab/play" className={cn(ENTER_CLASS, className)}>
      进入实验场
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

/** 极简轨道图：三条不同角度的椭圆 + 中心星点，暗示“平行人生”。 */
function OrbitArt() {
  return (
    <div className="relative hidden aspect-square w-full max-w-[320px] justify-self-center lg:block">
      <svg viewBox="0 0 320 320" className="h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="lab-intro-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="160" cy="160" r="150" fill="url(#lab-intro-glow)" />

        <ellipse
          cx="160"
          cy="160"
          rx="134"
          ry="54"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.20"
          transform="rotate(-18 160 160)"
        />
        <ellipse
          cx="160"
          cy="160"
          rx="108"
          ry="42"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.30"
          transform="rotate(22 160 160)"
        />
        <ellipse
          cx="160"
          cy="160"
          rx="76"
          ry="30"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.45"
          transform="rotate(-6 160 160)"
        />

        {/* 三条轨道上的“另一条人生” */}
        <circle cx="283" cy="128" r="3" fill="var(--accent)" fillOpacity="0.85" />
        <circle cx="77" cy="205" r="2.5" fill="var(--accent)" fillOpacity="0.65" />
        <circle cx="180" cy="81" r="2" fill="var(--accent)" fillOpacity="0.55" />

        <circle cx="160" cy="160" r="7" fill="var(--accent)" />
        <circle cx="160" cy="160" r="2.5" fill="var(--bg-surface)" />
      </svg>
    </div>
  );
}

export default function LabIntroPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = "平行人生 · Orbit";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 md:px-8 md:pt-10">
      <section className="relative overflow-hidden rounded-xl border border-line-subtle bg-surface">
        {/* 背景：一层柔光 + 固定的星点，不做动画，保持安静 */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-accent-soft blur-3xl" />
          {STARS.map(([x, y, size, opacity], index) => (
            <span
              key={index}
              className="absolute rounded-full bg-accent"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                opacity,
              }}
            />
          ))}
        </div>

        <div className="relative grid gap-8 p-6 md:p-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
          <div>
            <Badge tone="accent" className="gap-1.5">
              <Sparkles className="size-3" aria-hidden />
              实验场 · 沙盒
            </Badge>

            <h1 className="mt-5 font-display text-[30px] leading-[1.22] text-ink sm:text-[34px] md:text-[38px]">
              如果人生可以重演
              <br />
              <span className="text-accent">10,000 次</span>，
              <br />
              你会看到什么？
            </h1>

            <p className="mt-4 max-w-[46ch] text-balance text-body leading-7 text-ink-2">
              这里没有正确答案。你设定性格、策略与世界环境，它用蒙特卡洛把你的选择重演成千上万次，
              然后如实告诉你：均值在哪里，风险藏在哪里，概率与运气各占多少。
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <EnterLink />
              <span className="text-micro text-ink-3">约 3 分钟 · 不需要注册</span>
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-micro text-ink-3">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
              不读取你的星图、人物和记录；所有计算都在浏览器里完成。
            </p>
          </div>

          <OrbitArt />
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line-subtle bg-line-subtle md:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="bg-surface px-4 py-3">
            <div className="font-data text-h2 text-ink tabular-nums">{stat.value}</div>
            <div className="mt-0.5 text-micro text-ink-3">{stat.label}</div>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-h2 text-ink">三种玩法</h2>
          <span className="text-micro text-ink-3">从 5 秒的一局，到一万次的重演</span>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <Card key={mode.title} tone="soft" className="p-4">
                <span className="flex size-9 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <Icon className="size-4" aria-hidden />
                </span>
                <h3 className="mt-3 font-display text-h3 text-ink">{mode.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-2">{mode.desc}</p>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-6 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
        <Card tone="soft" className="p-5 md:p-6">
          <div className="flex items-center gap-2 text-accent">
            <ShieldCheck className="size-3.5" aria-hidden />
            <span className="text-micro">边界</span>
          </div>
          <h2 className="mt-2 font-display text-h2 text-ink">它不是人生预测器</h2>
          <p className="mt-2 text-body leading-7 text-ink-2">
            它必然简化了现实：家庭支持的具体形式、行业技术变革、地域差异、个体禀赋的复杂性都没有被建模。
            它的价值是让你看清结构性权衡，而不是替你做出人生选择。
          </p>
          <ul className="mt-4 space-y-1.5 text-sm leading-6 text-ink-2">
            <li>· 单次结果可能极具偶然性；</li>
            <li>· 同一个策略对应的是一个分布，而不是一个结局；</li>
            <li>· 概率论不是用来精准预言一次人生，而是用来理解不确定性。</li>
          </ul>
        </Card>

        <Card tone="quiet" className="flex flex-col justify-between gap-6 p-5 md:p-6">
          <p className="font-display text-[20px] leading-9 text-ink">
            “Orbit 记住你走过的那条轨道；
            <br />
            这里让你看见没走的那几条。”
          </p>
          <div className="flex items-center gap-2 text-micro text-ink-3">
            <Sparkles className="size-3.5" aria-hidden />
            一个藏在星图里的沙盒实验 · 不记录任何东西
          </div>
        </Card>
      </section>

      <div className="mt-8 flex justify-center">
        <EnterLink />
      </div>
    </div>
  );
}
