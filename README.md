# Orbit / 人情星图 — Web V1

> 通讯录记住「他们是谁」，Orbit 记住「你们之间发生过什么」。

一个私人的关系记忆系统：记录共同经历、近况、答应过的事、重要日期、借还、喜好，
然后在需要的时候重新找回它们。它不是通讯录、不是 CRM、不是社交平台，也不是 AI 聊天助手。

---

## 0. 想直接用？去 Releases 下载

**不要用这个页面右上角的「Code → Download ZIP」** —— 那是源码，不含依赖，
首次启动要联网装几十个 Python 包，会等好几分钟。

请到 [**Releases**](https://github.com/Zhu-Haokun/orbit/releases/latest) 下载
`orbit-x.y.z-完整安装包.zip`：

```
解压 → 双击 start-orbit.bat → 浏览器自动打开
```

包里已经备好前端构建产物和全部 Python 依赖，**只要有 Python 3.12 或 3.13，
几秒就能开始用**，不需要 Node，也不需要联网装任何东西。

| 下载哪个 | 用途 |
|---|---|
| `orbit-x.y.z-完整安装包.zip`（约 17 MB） | **新用户第一次装** —— 开箱即用 |
| `orbit-x.y.z.zip`（约 0.7 MB） | 已有用户的**更新包**，由应用内自动下载，不用手动取 |
| 这个页面的 Code → Download ZIP | **源码**，给开发者；首次启动需自行装依赖 |

装好之后不用管更新：应用每次启动会安静地看一眼有没有新版本，
有新版本时左侧「设置」会出现一个小圆点。见 §更新。

---

## 1. 项目定位

Orbit 只做一件事：**保存关系中的上下文，让未来的自己重新找到它。**

Web V1 验证的核心闭环：

```
添加人物 → 出现在星图 → 记录一次互动 → 解析 / 手动结构化
        → 生成时间轴 → 生成近况 / 未完待续 / 重要日期
        → 在「今天」与人物详情中重新被找回
```

明确不做（V1）：关系评分、亲密度、社交排行榜、自动催你联系人、陌生人推荐、
社区 / 朋友圈、推送消息给被记录的人。

产品原则见 `Orbit_Web_V1_AI完整实现规范.md` §3。

---

## 2. 技术栈

| 层 | 选型 |
| --- | --- |
| Frontend | React 19 · TypeScript · Vite · React Router · Tailwind CSS v4 · Framer Motion · TanStack Query · Zustand · D3 (force) · Lucide · date-fns · zod |
| Backend | FastAPI · Python 3.12+ · SQLAlchemy 2 · Pydantic v2 · Alembic |
| Database | PostgreSQL（推荐）/ SQLite（本地开发默认，数据访问层保持可切换） |
| Auth | email + password · JWT access token |
| 测试 | Vitest + Testing Library（前端）· pytest（后端）|

---

## 3. 目录结构

```
orbit/
├── frontend/          # React 应用
│   └── src/
│       ├── app/           # router / providers
│       ├── components/    # ui / layout / galaxy / timeline / people
│       ├── features/      # auth / people / galaxy / record / today / memories / search
│       ├── pages/         # 路由页面
│       ├── hooks/         # TanStack Query 封装
│       ├── services/      # API 访问层（页面不直接 fetch）
│       ├── stores/        # Zustand：只存 UI 状态
│       ├── lib/           # api / format / hash / validation / mockParser
│       ├── styles/        # Design Tokens
│       └── types/         # 与后端一致的 API 契约
├── backend/           # FastAPI 应用
│   └── app/
│       ├── api/           # 路由
│       ├── core/          # config / security / deps
│       ├── db/            # session / base（可移植 GUID）
│       ├── models/        # SQLAlchemy 模型
│       ├── schemas/       # Pydantic（camelCase 输出）
│       ├── services/      # today / search / memories / export / commit
│       ├── ai/            # LLM 解析 + 规则解析降级
│       └── seed.py        # Demo 数据
├── docker-compose.yml # 可选：本地 PostgreSQL
└── README.md
```

前端静态资源：

- `frontend/public/avatars/` —— 12 个内置头像 SVG
- `frontend/public/demo/` —— 3 张演示照片 SVG（回忆页的拼贴与放大查看用）

---

## 4. 本地启动

前置：Node.js ≥ 20、Python ≥ 3.12、npm。

### 4.0 一键启动（Windows）

双击 **`start-orbit.bat`** 即可。它会自动完成：

1. 检查 Node / npm / Python 是否就绪
2. 首次运行时安装前端依赖、创建后端虚拟环境、写入 Demo 数据
3. 分别在新窗口启动后端与前端
4. 等页面真正能访问之后再打开浏览器（不是只等端口）

之后每次双击都会跳过已完成的步骤，只启动服务。关掉那两个窗口即停止。

> 这个 bat 里的文字**必须是纯 ASCII**。cmd.exe 每次 `goto`/`call` 都按字节偏移重新定位脚本，
> 标签前面只要出现多字节（中文）行，解析就会错位、脚本会散架 —— 这是 cmd 的固有限制，
> 换成 GBK 编码也一样。所以提示信息用英文，请不要"帮忙翻译"。

### 4.0.1 你的数据在哪

**全部在这台电脑上，不上传任何服务器。**

| 内容 | 位置 |
|---|---|
| 全部记录（人物 / 互动 / 近况 / …） | `backend/orbit.db`（一个 SQLite 文件） |
| 上传的图片 | `backend/uploads/` |

**备份 = 复制这两个东西**，没有别的。设置页的「存储位置」会显示完整路径和体积，可一键复制。

> 现在这个仓库在运行时**不需要 Node**：`frontend/dist` 已经提交进来了，FastAPI 直接托管它，
> `start-orbit.bat` 检测到就跳过装依赖那一步。改了前端源码记得 `npm run build` 再提交。

### 4.0.2 更新（代码会更新，数据永远不动）

Orbit 内置更新检查：

```
设置 → 关于 → 检查更新
   ├─ 已是最新  → 结束
   └─ 有新版本  → [下载更新]
                    ↓
              「已下载。请关闭所有 Orbit 窗口，
                再双击 update-staging\apply-update.bat」
                    ↓
              双击 apply-update.bat
                 ├─ 备份 orbit.db
                 ├─ 按白名单替换程序文件
                 ├─ 跑 alembic 迁移
                 └─ 失败自动回滚
```

为什么不让它全自动？因为**替换正在运行的程序文件会失败或损坏**。让程序先停下来、由外部脚本替换，
是唯一稳妥的做法 —— 用户只需要多点一下。

`apply-update.bat` 按白名单复制，**绝不会碰** `orbit.db`、`uploads/`、`.venv/`。
即使发布的更新包打包错了，后端代码也会**拒绝写入任何数据库文件**（`app/core/release.py`
里的 `FORBIDDEN_NAMES` / `SAFE_PREFIXES`）。

**发布新版本**：

1. 改 `release.json` 里的 `version` 和 `notes`
2. 打 tag（如 `v1.1.0`）并在 GitHub 上创建 **Release**
3. **上传一个 zip 附件**（更新检查会挑名字里带 `orbit` 的 zip）
4. 老用户下次打开设置就能看到更新

`release.json` 里的 `repository` 必须先填上你的仓库（如 `你的用户名/orbit`）。
留空时更新检查会安静地提示"还没有配置 GitHub 仓库地址"，不影响其他功能。

### 4.1 后端

```bash
cd backend

# 1) 依赖
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate
pip install -r requirements-dev.txt

# 2) 环境变量
copy .env.example .env      # Windows
cp .env.example .env        # macOS / Linux

# 3) 建表（二选一）
alembic upgrade head        # 推荐：走迁移
# 或者跳过迁移，seed 会自动 create_all

# 4) Demo 数据（可重复执行）
python -m app.seed              # 完整演示数据
python -m app.seed --force      # 清空重建
python -m app.seed --empty      # 只建账号、不写人物，用来验收空状态

# 5) 启动
uvicorn app.main:app --reload --port 8000
```

后端地址：<http://127.0.0.1:8000> ，接口文档：<http://127.0.0.1:8000/docs> ，
健康检查：<http://127.0.0.1:8000/api/health>

### 4.2 前端

```bash
cd frontend
npm install
npm run dev
```

前端地址：<http://127.0.0.1:5173>

`vite.config.ts` 里把 dev server 绑在 `127.0.0.1`（不是默认的 `::1`），
否则部分 Windows 环境下浏览器打不开。

### 4.3 测试与构建

```bash
# 前端
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # vitest run
npm run build         # typecheck + vite build

# 后端
.venv\Scripts\python.exe -m ruff check app tests
.venv\Scripts\python.exe -m pytest
```

---

## 5. 环境变量

后端读 `backend/.env`（模板见 `.env.example`）：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `ENVIRONMENT` | `development` 允许默认密钥；`production` 启动时强制校验 `JWT_SECRET` | `development` |
| `DATABASE_URL` | 数据库连接串。改这一个变量即可切 PostgreSQL | `sqlite:///./orbit.db` |
| `JWT_SECRET` | 签发 access token 的密钥。生产环境必须 ≥ 32 字节且不能是默认值 | `change-me-in-production` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | access token 有效期 | `10080` |
| `CORS_ORIGINS` | 允许的前端来源，逗号分隔 | `http://localhost:5173,http://127.0.0.1:5173` |
| `UPLOAD_DIR` | 上传文件落盘目录，通过 `/uploads` 提供访问 | `./uploads` |
| `MAX_UPLOAD_MB` | 单张图片上限 | `5` |
| `LLM_API_KEY` / `LLM_MODEL` / `LLM_BASE_URL` | 可选 LLM 解析。留空则用内置规则解析器 | 空 |

前端读 `frontend/.env`（模板见 `.env.example`），只有 API 基地址一项。

---

## 6. Demo 账号

```
邮箱：demo@orbit.local
密码：orbitdemo
昵称：林默
```

登录页有「体验 Demo」按钮，可以一键用这组账号进入。

---

## 7. Seed

`python -m app.seed` 会写入：

| 内容 | 数量 |
| --- | --- |
| 人物 | 14 |
| 星系 | 5（宿舍 / 摄影社 / 实验室 / 高中 / 家人） |
| 互动 | 36（其中 3 条带演示照片） |
| 近况 | 5 |
| 未完待续 | 5 |
| 重要日期 | 4 |
| 偏好 | 6 |
| 借还 | 5 |

演示人物都预置了内置头像，所以第一次打开星图就有辨识度。

常用参数：

- `--force` 清空演示账号的数据并重建
- `--reset` 连同演示账号一起删掉再重建
- `--empty` 只建账号、不写任何人物，用来验收各页面的空状态
- `--quiet` 只输出一行结果

---

## 8. AI 是可选的

不配 `LLM_API_KEY` 时，记录页用内置的规则解析器（`app/ai/`），
完全离线、不发任何网络请求，功能不降级到不可用：

- 解析不出结构化内容时，页面会走「部分结果」分支，让你手动整理或只存为一条互动
- 任何解析结果都可以在保存前编辑，AI 不会直接写库

---

## 9. 产品升级（第二轮）

依据 `Orbit_产品升级头脑风暴与设计参考.md` 里建议的「最小可验证版本」做了五件事，
都不需要新增一级导航，也不引入任何关系评分或 AI 推断。

### 9.1 记录成功回执

保存之后不再是一个 toast 就跳走，而是一张回执：
**存进了谁的档案、哪一天、属于哪个星系、新增了几条什么**，再由用户自己决定
「查看档案」还是「继续记录」。数字来自真实的提交结果，不是估算。

「仅保存为一条互动」也会走同一张回执，只是内容里只有互动。

### 9.2 人物页三视图

`全部 / 摘要 / 时间轴`，默认仍是 `全部`（保持原来的用法不被打破），
选择记在 `localStorage`。摘要把一个人的信息压成一屏：
事实行、下一件值得记住的日子、最近在忙什么、最近的记忆、还没完的事。

### 9.3 回忆页：回顾带 + 主图拼贴

- **回顾带**：进回忆页时在最上面挑 1–2 条旧内容。优先「几年前的今天」，
  没有就退到「留下过照片的记忆」。**没有合适的就不显示，绝不硬凑。**
  只在「全部年份」下出现 —— 切到某一年时用户已经在主动找了。
- **主图拼贴**：三张以上图片时给一张大主图 + 右侧小图，比一排等大的缩略图更有记忆感。

### 9.4 搜索结果直接定位

点记忆类搜索结果会跳到 `/people/<id>?interaction=<iid>`，
人物页自动切到能看见时间轴的视图、展开那一条、滚动到中间并短暂高亮。

### 9.5 星图的关系路径

选中一个人之后，只留下**中心 → 这个人 → 同星系的人**，其余全部压暗。
连线数量没有增加，仍然是可解释的少数几条。

---

## 10. 产品升级（第三轮）

依据 `Orbit_用户吸引力与体验深度优化建议.md` 的「最小下一版本（V1.1）」清单，
本轮做了其中的前半部分。核心思路是把已有的这条循环做深，而不是继续加功能：

```
偶然想起一个人 → 低摩擦记录 → 立刻得到可信的回执
             → 进入人物 / 星图 / 回忆 → 未来被温和地重新发现
```

### 10.1 三层字体语气

全站原本只有一套无衬线，标题和正文是同一个语气，所有页面看起来都像"同一种工具页面"。
`styles/index.css` 现在补了两层 token：

| token | 用途 |
| --- | --- |
| `--font-sans` | 正文、操作、输入、状态（不变） |
| `--font-display` | 回忆标题、月份、精选记忆标题、重要日期标题 |
| `--font-data` | 日期与数量，配合 `tabular-nums` 对齐 |

只走系统已有字体，**不请求外部 Google Fonts** —— 网络受限时不会失败。
目前应用在「回忆」和「人物摘要」，没有全站重做。

### 10.2 星图的「此刻值得看」入口

星图是强视觉入口，但看完星星常常不知道下一步做什么。搜索框下面加了一条
**每次只显示一项**的上下文入口，不新增一级导航。候选只来自已有事实，按序取第一个命中：

1. 有人还没有任何记录 → 去记录
2. 60 天内的重要日期 → 打开那个人
3. 最近有记录的人 → 打开那个人

**刻意不做**「最重要的人」「最该联系的人」这类推断 —— 规范与文档都禁止关系评分。

### 10.3 记录页「先记下来」

保留完整解析，旁边增加一条低摩擦路径：**不解析、直接存原文**。
人物没选也可以 —— 会先看原文里是否正好提到一个人，是就自动归到 ta 名下。

### 10.4 Today 的第一句改成事实摘要

原来是「今天有 N 件与你在乎的人有关的事情。」，读起来像待办计数。
现在先说一件具体的事，再补总量：「今天可以看看：小鹿的比赛答辩 · 有一段可以回看的记忆。」

### 10.5 回忆页的回顾理由与排版

- 回顾带每一条都写明**为什么现在显示**（「2 年前的今天」「留下过 1 张照片」）
- 月份标题从 12px 无衬线改成了 20px 展示字体，章节感更强

### 10.6 未完待续可以手动补

以前「未完待续」**只能**由记录解析产生，用户没有办法自己加一条。
现在区块标题旁有「添加」，空状态也有就地动作。

---

## 11. 头像

人物头像有三种来源，都在「新建人物 / 编辑人物」的头像字段里：

1. **上传本地图片**（主路径）—— 选文件时前端就先校验类型与体积，
   不合格立刻提示，不用等上传完才知道。支持 jpg / png / webp，单张 ≤ 5MB。
   上传成功后落在 `backend/uploads/`，通过 `/uploads/<uuid>.<ext>` 提供访问。
2. **内置默认头像** —— `frontend/public/avatars/` 下 12 个 SVG 小牌子
   （月亮 / 北星 / 彗星 / 远山 / 海浪 / 叶子 / 猫 / 飞鸟 / 仙人掌 / 咖啡 / 相机 / 书）。
   都是同一套配色的线条图腾，缩到 32px 也看得清，裁成圆形不会切到内容。
3. **图片链接** —— 少量场景用，直接填 http(s) 地址。

星图上的表现：

- **有头像的人**：星星本体就是那张头像（圆形裁切 + 一圈 accent 描边），
  并带一层随「最近是否有记录」变化的柔光。
- **没有头像的人**：保持规范 §14.3 的「中心亮点 + 非常轻 glow」，
  不会因为没图就变成一个空洞。

> 说明：规范 §14.3 原文写的是「不要默认用头像作为星星本体」。
> 这里按产品方的要求做了调整 —— 一片纯白点很难分辨谁是谁。
> 想回到纯光点，把 `PersonStar.tsx` 里渲染 `<image>` 的那一段去掉即可。

---

## 12. 星图的位置语义

| 视觉变量 | 含义 |
| --- | --- |
| 星体大小 | 你手动设置的关注层级（圈层） |
| 亮度 | 最近是否有新的记录 |
| 方向 | 所属星系 |
| 距离 | 上次联系有多久；核心圈的人一直在最近处 |

- **距离**：最近有记录的人靠内，越久没联系越往外扩散（180 天封顶）。
- **核心圈 = 特别关注**：不受时间影响，始终待在最内圈。
  同一星系里有多位核心圈成员时，半径按组内序号等距分配，避免他们互相挤位。
- 同一个星系的人排成一个**扇形**，不会全部叠在同一根辐条上。

星图上**不显示星系名称** —— 点开人物就能看到身份，常驻标签只会让画面变吵。

---

## 13. 设计约定

- 所有颜色、字号、圆角、动效时长都来自 `frontend/src/styles/index.css` 的 token，
  组件里不写死色值
- 星图的背景星点是**确定性**的（位置 / 大小 / 明暗来自 hash），
  并且带"呼吸"动画与随拖拽的视差；`prefers-reduced-motion` 下会停掉视差
- 文案保持平静、不催促（规范 §53）
- 不出现任何关系评分、亲密度或排名
- `prefers-reduced-motion` 下所有装饰性动画都会退化为静态

---

## 14. Roadmap

```
Web V1（当前）
  ↓ 真实用户试用
  ↓ 修正记录成本与星图可用性
PWA
  ↓ 移动端适配强化
Capacitor
  ↓
Android APK
  ↓
本地通知 / 语音 / 相机 / 生物识别
```

V1 已经在结构上为这条路线留好位置：响应式、manifest、图标、
token 存储抽象（`frontend/src/lib/tokenStorage.ts`）、不依赖 Desktop-only API。
规范 §68 中列为 P1/P2 的功能（图片上传完善、借还完整 CRUD、Light mode、
年度报告、语义搜索、本地通知）按同一优先级推进。

`Orbit_产品升级头脑风暴与设计参考.md` 里的 Sprint B / Sprint C 尚未开始：
人物页的主题视图、地点与主题筛选、共同出现的人、故事串、星图星系 hover 预览、
年度回顾、稍后回看、导出 ZIP、用户自定义星系布局。
