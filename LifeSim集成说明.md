# LifeSim 接入说明（Orbit 第六个入口）

> 一句话：LifeSim 作为**独立的静态子应用**放进 Orbit，Orbit 只提供入口、登录态和返回按钮；
> 两套代码不互相 import，也不共享状态。LifeSim 不读取任何 Orbit 数据，是纯沙盒。
>
> 本文随发布仓库一起提交（GitHub: `Zhu-Haokun/orbit`；本机目录 `orbit_github`）。
> `orbit_local` 是本地调试副本，不参与发布，也不要在那里改功能。

---

## 1. 文件位置

```
orbit/                            ← 仓库根（本机目录 orbit_github）
├── frontend/
│   ├── public/
│   │   └── lifesim/              ← LifeSim 运行副本（index.html / css / js）
│   └── src/
│       └── pages/
│           ├── LabIntroPage.tsx  ← 入口页：介绍 + “进入实验场”，套 AppShell
│           └── LabPage.tsx       ← 运行页：全屏 iframe + “返回 Orbit”栏
└── LifeSim集成说明.md             ← 本文件
```

LifeSim 的原始独立版本仍在仓库根目录的 `概率/`（含 `tests/`、`ppt/`、截图、汇报 PPT 和 zip）。
**`概率/` 没有被改动**，仍然可以双击 `index.html` 独立运行，860 项测试也照旧。

`public/lifesim/` 只有运行所需的三样东西：`index.html`、`css/`、`js/`。共 41 个文件、约 643 KB。
`ppt/`、`tests/`、`截图/`、`*.zip`、`*.pptx` 都没有复制进来。

---

## 2. 两段式入口

点击侧栏「平行人生」不会直接加载 LifeSim，而是先到 **`/lab` 入口页**：

```
侧栏「平行人生」
   ↓
/lab          介绍页（套 AppShell，Orbit 侧栏还在）
   │          如果人生可以重演 10,000 次，你会看到什么？
   │          三种玩法 / 它不是什么 / 不读取任何记录
   ↓ 用户点「进入实验场」
/lab/play     LifeSim 运行页（全屏，不套 AppShell）
   ↓ 左上角「返回 Orbit」→ /galaxy
   ↓ 或浏览器返回 → /lab 入口页
```

为什么多这一步：

- 直接把人扔进 LifeSim 的完整界面，用户不知道它和 Orbit 是什么关系；
- 入口页用 Orbit 的语言解释“它是什么 / 不是什么”，并明确不读任何记录；
- 用户自己点进去，入口更像一扇门，而不是一次跳转；
- 运行页顶部「返回 Orbit」直接回星图；浏览器返回键则回到 `/lab` 入口页。

入口页是纯静态文案，不请求任何接口，也不读取任何人物或记录。

---

## 3. Orbit 侧改了什么

| 文件 | 改动 |
| --- | --- |
| `frontend/src/pages/LabIntroPage.tsx` | 新增：入口页（介绍 + 三种玩法 + 边界 + 进入按钮） |
| `frontend/src/pages/LabPage.tsx` | 新增：44px 返回栏 + 全屏 iframe，`src="/lifesim/index.html"` |
| `frontend/src/app/router.tsx` | `/lab` 放进 AppShell；`/lab/play` 单独 `RequireAuth`、不套 AppShell |
| `frontend/src/components/layout/Sidebar.tsx` | 第六项「平行人生」，`Sparkles` 图标 |
| `frontend/src/components/layout/MobileTabBar.tsx` | 第六项「实验」，移动端入口 |
| `frontend/src/pages/LabIntroPage.test.tsx` | 新增 2 项断言：先介绍、只给 `/lab/play` 入口、不加载 iframe |
| `frontend/src/pages/LabPage.test.tsx` | 新增 2 项断言：iframe 地址、返回 `/lab` / 新标签链接 |

后端**没有改**：`frontend/public/` 会被 Vite 复制进 `dist/`，`app/main.py` 的同源静态托管
直接就能服务 `/lifesim/index.html`。更新包白名单 `backend/app/core/release.py` 里本来就包含
`frontend/public/` 与 `frontend/dist/`，发布链路不用动。

> 规范 §0.4 写着“不新增一级导航”。第六项是产品方明确要求的例外：LifeSim 不参与关系记录，
> 只作为可玩性入口存在。它的位置在“搜索”之后、设置之前，不改变前五项的顺序与含义。
> 如果以后要收回这个入口，按 §7 回滚即可。

### 为什么运行页 `/lab/play` 不套 AppShell

LifeSim 自带左侧导航（开始 / 设计人生 / 运行 / 报告 / 平行宇宙 / 策略对照 / 实验室 / 档案 / 图鉴 / 设置）。
如果外面再套 Orbit 的 232px 侧栏，会变成两条导航并排。

所以：

- `/lab`（介绍页）在 AppShell 里，Orbit 侧栏一直在，用户可以随时去别处；
- `/lab/play`（运行页）让出整个窗口，只留一条 44px 的深色返回栏：

```
┌─────────────────────────────────────────────────────────────┐
│ ← 返回 Orbit    平行人生 · LifeSim · 人生概率实验室          │ 44px
├──────────────┬──────────────────────────────────────────────┤
│ LifeSim 自己的│                                               │
│ 侧栏          │   LifeSim 页面（iframe）                       │
│              │                                               │
└──────────────┴──────────────────────────────────────────────┘
```

移动端同理：底部 Tab 的「实验」先进入 `/lab` 介绍页（Tab 还在），点“进入实验场”才全屏。

### 为什么 iframe 地址必须是 `/lifesim/index.html`

`app/main.py` 的 SPA catch-all 规则是：`dist / full_path` **是文件**才返回它，否则回退 Orbit 的
`index.html`。所以：

- ✅ `/lifesim/index.html` —— 是文件，返回 LifeSim；
- ❌ `/lifesim/` —— 是目录，回退成 Orbit 首页（iframe 里会出现 Orbit 套 Orbit）。

如果以后想用目录 URL，需要给 `/lifesim` 单独 `mount` 一个 `StaticFiles`，但当前不需要。

---

## 4. 运行与构建

开发：

```bash
cd frontend
npm run dev          # http://127.0.0.1:5173
```

打开 `/lab` 看入口页；点“进入实验场”后加载 `/lifesim/index.html`。
Vite 会直接服务 `public/lifesim/`，不需要等后端。

生产 / 打包：

```bash
cd frontend
npm run build        # tsc --noEmit && vite build
```

`dist/lifesim/` 会被一并生成。FastAPI 启动后同源托管 `dist/`，打开
`http://127.0.0.1:8000/lab` 即可。

验证：

```bash
npm run typecheck
npm test             # 11 个测试文件、54 项通过
```

---

## 5. 同步 LifeSim 的改动

LifeSim 自己改自己的。改完 `概率/index.html`、`概率/css/` 或 `概率/js/` 之后，
把这三项复制到 `public/lifesim/`，再 `npm run build`：

```powershell
$src = "D:\CODE\learn_deep_learning\概率"
$dst = "D:\CODE\learn_deep_learning\人情星图\orbit_github\frontend\public\lifesim"
Copy-Item "$src\index.html" "$dst\index.html" -Force
Copy-Item "$src\css" "$dst\css" -Recurse -Force
Copy-Item "$src\js" "$dst\js" -Recurse -Force
```

也可以先改 `public/lifesim/` 里的副本，验证没问题后再回写到 `概率/`——但**不要两边同时改**，
否则下一次同步会覆盖。

---

## 6. 发布到 GitHub

`frontend/dist` 是**故意提交**的（见 README「为什么仓库里有 dist」）。所以改完前端必须重新构建：

```powershell
cd frontend
npm run build
cd ..
git add frontend/public/lifesim frontend/src frontend/dist README.md LifeSim集成说明.md
git status
git commit -m "平行人生：把 LifeSim 作为第六个入口接进来"
git push
```

要打发布包时用仓库自带的脚本（它会顺带校验包里没有数据库文件）：

```powershell
.\make-release.ps1 -Version 1.2.0 -Build
```

`make-release.ps1` 不会碰 git；提交和推送仍需你自己确认。

---

## 7. 边界与已知限制

- **不读数据**：LifeSim 不调用 `/api/*`，不读 `orbit.auth.token`，不读人物/记录。
  它的人生卡只存在 `localStorage['lifesim.state.v1']`。
- **多账号**：同一个浏览器切两个 Orbit 账号，LifeSim 的沙盒存档是共享的（因为它不区分账号）。
  这是“设备本地游戏”的语义；如果以后要按账号隔离，给 `store.js` 的 key 加用户 id 前缀即可。
- **浏览器返回键**：从 `/lab/play` 按返回会回到 `/lab`（入口页），不会直接弹回星图。
  但在 iframe 内切 `#/create`、`#/run` 不会写父页面 history —— 这是 iframe 的固有限制；
  用 LifeSim 自己的导航或左上角“返回 Orbit”即可。
- **浅色主题**：LifeSim 只有深色皮肤。运行页返回栏固定为深色，避免在浅色主题下出现
  “白条 + 黑应用”的接缝。入口页走 Orbit token，会跟随主题。
- **主线程**：10,000 次模拟约 1.7 秒，iframe 不隔离 CPU，大批量模拟时父页面可能掉帧。
  目前默认样本量够用；真要跑 10 万次，建议把 `core + sim` 放进 Web Worker（引擎本身不碰 DOM）。
- **冻结策略**：LifeSim 作为子应用保持冻结，Orbit 只做壳与入口；不把 LifeSim 重写成 React，
  也不在 Orbit 里 `import` 它的模块。

---

## 8. 回滚

删掉以下内容即可，LifeSim 文件和 `概率/` 都不受影响：

1. `frontend/public/lifesim/`
2. `frontend/src/pages/LabIntroPage.tsx`、`LabIntroPage.test.tsx`
3. `frontend/src/pages/LabPage.tsx`、`LabPage.test.tsx`
4. `router.tsx` 的 `/lab` 与 `/lab/play`、`Sidebar.tsx` 的第六项、`MobileTabBar.tsx` 的「实验」

然后 `npm run build`。
