"""Demo 数据集（规范 §47–§51 / §64）。

这里只是**纯 Python 数据**，不碰数据库；写入逻辑在 :mod:`app.seed`。

关于日期的两条规则（§50 的显式要求）：

* 逐字写死的记录使用 2026 年的字面日期（摄影社秋季活动、生日、跨年……），
  这样“回忆”页会稳定长出多个月份；
* 只有 §50 明确要求“跟着今天走”的三件事（林夕生日、教资考试、小鹿答辩）
  使用相对锚点日期 :data:`ANCHOR_TODAY` 计算，保证任何一天跑 seed，
  “今天”页里都真的有东西可看。

锚点固定为 2026-10-05：它是规范 §45 示例里的 referenceDate，
也是“陈屿说他下个月准备去杭州工作”这句话最自然的语境。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from app import seed_roster

#: 绝对锚点：规范 §45 示例使用的日期。
ANCHOR_TODAY = date(2026, 10, 5)


def anchor(year: int, month: int, day: int) -> date:
    """构造锚点语境下的某一天。"""
    return date(year, month, day)


def days_from_anchor(days: int) -> date:
    """相对锚点的日期：``days_from_anchor(-1)`` 就是“昨天记录”。"""
    return ANCHOR_TODAY + timedelta(days=days)


def this_month_day(month: int, day: int) -> date:
    """今年的某月某日；若已过去则顺延到明年（生日 / 考试场景，§50）。"""
    try:
        candidate = date(ANCHOR_TODAY.year, month, day)
    except ValueError:  # 2 月 29 日
        candidate = date(ANCHOR_TODAY.year, 2, 28)
    if candidate < ANCHOR_TODAY:
        candidate = candidate.replace(year=ANCHOR_TODAY.year + 1)
    return candidate


#: 演示账号（§6.4 / §64）。
DEMO_USER = {
    "nickname": "林默",
    "email": "demo@orbit.local",
    "password": "orbitdemo",
}

#: §47.1 五个星系，``sort_order`` 决定星图筛选条的顺序。
#: 后面再拼上 ``seed_roster.EXTRA_GROUPS``（同事 / 健身 / 读书会……）。
_CORE_GROUPS = [
    {"name": "宿舍", "icon": "home", "sort_order": 0},
    {"name": "摄影社", "icon": "camera", "sort_order": 1},
    {"name": "实验室", "icon": "flask", "sort_order": 2},
    {"name": "高中", "icon": "book", "sort_order": 3},
    {"name": "家人", "icon": "heart", "sort_order": 4},
]

DEMO_GROUPS = [*_CORE_GROUPS, *seed_roster.EXTRA_GROUPS]


@dataclass(slots=True)
class SeedPerson:
    """§47.2 里的一个人，附上推导出来的近况 / 未完待续 / 重要日期 / 偏好。"""

    name: str
    relationship_label: str
    groups: list[str] = field(default_factory=list)
    circle_level: str = "normal"
    met_at: date | None = None
    notes: str | None = None
    updates: list[str] = field(default_factory=list)
    #: 内置默认头像（frontend/public/avatars/*.svg）。Demo 里不填的话星图就全是白点。
    avatar: str | None = None
    #: 活跃度画像（hot / warm / cooling / cold）；只用来推导互动的日期与条数，
    #: 不落库、也不参与任何界面判断。
    activity: str | None = None


def avatar_url(name: str) -> str:
    """把头像名转成前端可直接使用的地址。"""
    return f"/avatars/{name}.svg"


@dataclass(slots=True)
class SeedInteraction:
    """一条互动记录；``person`` 用姓名指代，写入时再解析成 id。"""

    person: str
    date: date
    title: str
    content: str
    location: str | None = None
    interaction_type: str | None = None
    #: 演示照片（frontend/public/demo/*.svg 或 /uploads/*）。
    attachments: list[str] = field(default_factory=list)
    #: 记录时选的心情表情（可选）。
    mood: str | None = None
    #: 同一次共同经历：带同一个 event 标签的互动会共享一个 event_id，
    #: 星图据此在这些人之间连线。
    event: str | None = None


@dataclass(slots=True)
class SeedCommitment:
    person: str
    content: str
    status: str = "open"
    due_date: date | None = None
    due_text: str | None = None


@dataclass(slots=True)
class SeedImportantDate:
    person: str
    title: str
    date: date | None = None
    date_text: str | None = None
    date_precision: str = "exact"
    repeat_type: str = "none"
    notes: str | None = None


@dataclass(slots=True)
class SeedPreference:
    person: str
    category: str
    content: str


@dataclass(slots=True)
class SeedBorrow:
    person: str
    direction: str
    item_name: str
    borrow_date: date
    status: str = "open"
    expected_return_date: date | None = None
    notes: str | None = None


#: §47.2 的 14 个人；近况来自 §47.2 与 §49 / §70 的场景。
#: 每人都配一个内置头像，这样星图开箱就有辨识度，而不是一片白点。
_CURATED_PEOPLE: list[SeedPerson] = [
    SeedPerson(
        name="林夕",
        relationship_label="大学朋友",
        groups=["摄影社"],
        circle_level="frequent",
        met_at=anchor(2025, 1, 18),
        updates=["准备教师资格证", "最近开始玩胶片摄影", "寒假想去重庆"],
        avatar="moon",
    ),
    SeedPerson(
        name="陈屿",
        relationship_label="学长",
        groups=["实验室"],
        circle_level="frequent",
        updates=["准备去杭州工作", "最近在看租房"],
        avatar="mountain",
    ),
    SeedPerson(
        name="阿杰",
        relationship_label="高中朋友",
        groups=["高中"],
        circle_level="core",
        avatar="comet",
    ),
    SeedPerson(
        name="小鹿",
        relationship_label="室友",
        groups=["宿舍"],
        circle_level="core",
        avatar="leaf",
    ),
    SeedPerson(
        name="周航",
        relationship_label="室友",
        groups=["宿舍"],
        circle_level="frequent",
        avatar="wave",
    ),
    SeedPerson(
        name="唐昕",
        relationship_label="摄影社朋友",
        groups=["摄影社"],
        circle_level="normal",
        avatar="camera",
    ),
    SeedPerson(
        name="许老师",
        relationship_label="指导老师",
        groups=["实验室"],
        circle_level="normal",
        avatar="book",
    ),
    SeedPerson(
        name="苏晴",
        relationship_label="高中同学",
        groups=["高中"],
        circle_level="occasional",
        avatar="bird",
    ),
    SeedPerson(
        name="妈妈",
        relationship_label="家人",
        groups=["家人"],
        circle_level="core",
        avatar="cactus",
    ),
    SeedPerson(
        name="爸爸",
        relationship_label="家人",
        groups=["家人"],
        circle_level="core",
        avatar="coffee",
    ),
    SeedPerson(
        name="宋言",
        relationship_label="实验室同学",
        groups=["实验室"],
        circle_level="normal",
        avatar="star",
    ),
    SeedPerson(
        name="江辰",
        relationship_label="摄影社朋友",
        groups=["摄影社"],
        circle_level="normal",
        avatar="camera",
    ),
    SeedPerson(name="郑可", relationship_label="同班同学", groups=[], circle_level="normal", avatar="cat"),
    SeedPerson(
        name="李楠",
        relationship_label="朋友",
        groups=["摄影社", "高中"],
        circle_level="frequent",
        avatar="moon",
    ),
]


def _jay() -> list[SeedInteraction]:
    """§48 阿杰：最后一条在很久以前，“今天”页才会出现“有一阵子没有新的记录”。"""
    return [
        SeedInteraction("阿杰", anchor(2026, 3, 21), "一起吃烤肉", "聊到高中时候的社团活动。", location="校门口烤肉店"),
        SeedInteraction("阿杰", anchor(2026, 1, 2), "聊了聊近况", "他换了一个新工作，说先适应一段时间。"),
        SeedInteraction("阿杰", anchor(2025, 12, 31), "一起跨年", "在他家楼下看烟花。"),
        SeedInteraction("阿杰", anchor(2025, 6, 18), "一起吃饭", "高中同学小聚。", location="学校后街"),
    ]


def _linxi() -> list[SeedInteraction]:
    """§48 林夕：火锅、摄影社活动、生日，加上更早的共同经历。"""
    return [
        SeedInteraction(
            "林夕",
            anchor(2026, 9, 21),
            "一起吃火锅",
            "她最近在准备教师资格证，11 月考试，寒假想去重庆。",
            location="学校旁边的火锅店",
        ),
        SeedInteraction(
            "林夕",
            anchor(2026, 8, 30),
            "参加摄影社秋季活动",
            "她借走了我的 50mm 镜头。",
            location="南湖公园",
        ),
        SeedInteraction("林夕", anchor(2026, 7, 16), "她的生日", "送过一本摄影集。"),
        SeedInteraction("林夕", anchor(2026, 5, 9), "一起逛书店", "她在找胶片摄影的书。", location="城市书房"),
        SeedInteraction("林夕", anchor(2025, 11, 12), "她的生日", "送了她一本摄影集。"),
        SeedInteraction("林夕", anchor(2025, 9, 14), "第一次外拍", "她说想试试胶片。", location="老城区"),
    ]


def _chenyu() -> list[SeedInteraction]:
    """§48 陈屿 + §70 演示脚本：抽屉里要能看到“准备去杭州工作 / 在看租房”。"""
    return [
        SeedInteraction(
            "陈屿",
            days_from_anchor(-1),
            "一起喝咖啡",
            "他说下个月准备去杭州工作，最近在看租房。我答应把之前整理的租房网站发给他。",
            location="图书馆一层的咖啡角",
        ),
        SeedInteraction(
            "陈屿", anchor(2026, 9, 12), "在实验室聊项目", "他推荐了一个数据可视化课程。", location="实验室"
        ),
        SeedInteraction("陈屿", anchor(2026, 6, 20), "一起吃饭", "聊了毕业论文的进度。"),
        SeedInteraction("陈屿", anchor(2026, 3, 8), "实验室组会", "他讲了一次组会，我被拉去旁听。", location="实验室"),
    ]


def _xiaolu() -> list[SeedInteraction]:
    return [
        SeedInteraction("小鹿", anchor(2026, 10, 2), "宿舍一起点外卖", "她下周准备参加比赛答辩。"),
        SeedInteraction("小鹿", anchor(2026, 8, 12), "一起搬家", "帮她把行李搬上了六楼。", location="宿舍楼"),
        SeedInteraction("小鹿", anchor(2026, 4, 26), "一起看电影", "随便挑了一部，看完聊到很晚。", location="学校影院"),
    ]


def _roommates() -> list[SeedInteraction]:
    return [
        SeedInteraction("周航", anchor(2026, 9, 28), "宿舍夜谈", "他说准备考研，问我借了复习资料。", location="宿舍"),
        SeedInteraction("周航", anchor(2026, 5, 30), "一起打球", "输了，但是玩得挺开心。", location="操场"),
    ]


def _photo_club() -> list[SeedInteraction]:
    return [
        SeedInteraction(
            "唐昕",
            anchor(2026, 10, 3),
            "摄影社外拍",
            "她带了三脚架，拍了一整卷。",
            location="南湖公园",
            attachments=["/demo/photo-camera.svg"],
        ),
        SeedInteraction(
            "唐昕", anchor(2026, 6, 6), "一起看展", "看了摄影展，她很喜欢其中一个系列。", location="市美术馆"
        ),
        SeedInteraction(
            "江辰",
            anchor(2026, 9, 6),
            "摄影社外拍",
            "他教我怎么用长焦。",
            location="江边",
            attachments=["/demo/photo-river.svg"],
        ),
        SeedInteraction("江辰", anchor(2026, 2, 14), "一起拍照", "拍了一组夜景。", location="老城区"),
        SeedInteraction(
            "李楠",
            anchor(2026, 9, 30),
            "一起喝咖啡",
            "聊到高中同学最近都在做什么。",
            location="街角咖啡",
            attachments=["/demo/photo-cafe.svg"],
        ),
        SeedInteraction("李楠", anchor(2026, 4, 4), "高中同学聚会", "见到了很久没见的几个人。", location="学校后街"),
    ]


def _lab() -> list[SeedInteraction]:
    return [
        SeedInteraction("许老师", anchor(2026, 9, 26), "讨论开题报告", "老师说下周组会要确认材料。", location="实验室"),
        SeedInteraction("许老师", anchor(2026, 3, 15), "第一次见面", "在办公室聊了研究方向。", location="办公室"),
        SeedInteraction("宋言", anchor(2026, 9, 19), "一起做实验", "跑了一晚上的数据。", location="实验室"),
        SeedInteraction("宋言", anchor(2026, 5, 21), "一起吃饭", "聊了他想去的几个城市。"),
    ]


def _high_school() -> list[SeedInteraction]:
    return [
        SeedInteraction("苏晴", anchor(2025, 10, 5), "一起吃饭", "聊到高中班主任。", location="高中门口的小店"),
        SeedInteraction("郑可", anchor(2026, 7, 8), "一起自习", "在同一间教室待了一下午。", location="图书馆"),
    ]


def _family() -> list[SeedInteraction]:
    return [
        SeedInteraction(
            "妈妈", days_from_anchor(-2), "视频通话", "她说家里准备换一个新的路由器。我答应周末帮忙看看型号。"
        ),
        SeedInteraction("妈妈", anchor(2026, 6, 1), "回家吃饭", "她做了我最喜欢的那道菜。", location="家"),
        SeedInteraction("妈妈", anchor(2026, 2, 17), "一起买年货", "在超市转了两个小时。", location="超市"),
        SeedInteraction("爸爸", anchor(2026, 6, 1), "回家吃饭", "他话不多，但一直在问我学校的事。", location="家"),
        SeedInteraction("爸爸", anchor(2025, 12, 20), "一起修东西", "帮他把阳台的灯换了。", location="家"),
    ]


#: 全部互动；写入顺序即时间轴顺序，读取时统一按日期倒序。
SELF_PERSON_KEY = "__self__"


# --------------------------------------------------------------------------- #
# 批量人物与互动
#
# Demo 需要 50+ 个人，而且要能看出"谁刚聊过、谁一年多没动静"。
# 所以不是随机堆日期，而是按**活跃度画像**分配：
#
#   hot      最近 0–6 天     6–8 条互动
#   warm     最近 20–70 天   4–6 条
#   cooling  最近 100–220 天 3–5 条
#   cold     最近 380–600 天 2–4 条（一年多没聊）
#
# 具体到某个人用名字的 hash 决定，所以每次 seed 结果完全一致（可复现）。
# --------------------------------------------------------------------------- #

#: 活跃度 → (最近一次互动距今的天数下限, 上限, 时间跨度天数, 条数下限, 条数上限)
_ACTIVITY_PROFILE: dict[str, tuple[int, int, int, int, int]] = {
    "hot": (0, 6, 420, 6, 8),
    "warm": (20, 70, 720, 4, 6),
    "cooling": (100, 220, 900, 3, 5),
    "cold": (380, 600, 1200, 2, 4),
}

#: 星系 → 适合这个圈子的互动主题。键必须和 ``seed_roster.EXTRA_GROUPS`` 对齐。
_GROUP_THEMES: dict[str, tuple[str, ...]] = {
    "宿舍": ("meal", "drink", "chat", "sport"),
    "摄影社": ("culture", "outdoor", "drink", "chat"),
    "实验室": ("study", "work", "meal", "chat"),
    "高中": ("meal", "chat", "sport", "culture"),
    "家人": ("family", "meal", "chat"),
    "同事": ("work", "meal", "drink", "chat"),
    "老同学": ("meal", "chat", "sport", "culture"),
    "健身房": ("sport", "outdoor", "meal", "chat"),
    "读书会": ("culture", "drink", "study", "chat"),
    "乐队": ("culture", "drink", "chat"),
    "邻居": ("meal", "family", "chat"),
    "客户": ("work", "meal", "chat"),
    "咖啡馆": ("drink", "culture", "chat"),
}
_DEFAULT_THEMES = ("meal", "drink", "chat", "culture")


def _hash_unit(seed: str) -> float:
    """把字符串稳定地映射到 [0, 1)。"""
    value = 0
    for char in seed:
        value = (value * 131 + ord(char)) % 1_000_003
    return value / 1_000_003


def _between(seed: str, low: int, high: int) -> int:
    return low + int(_hash_unit(seed) * (high - low + 1))


def _extra_people() -> list[SeedPerson]:
    """``seed_roster.EXTRA_PEOPLE`` → :class:`SeedPerson`。"""
    people: list[SeedPerson] = []
    for raw in seed_roster.EXTRA_PEOPLE:
        year, month, day = raw["met_at"]
        people.append(
            SeedPerson(
                name=raw["name"],
                relationship_label=raw["relationship_label"],
                groups=list(raw["groups"]),
                circle_level=raw["circle_level"],
                met_at=date(year, month, day),
                notes=raw.get("notes"),
                avatar=raw["avatar"],
                activity=raw["activity"],
            )
        )
    return people


def _themes_for(person: SeedPerson) -> tuple[str, ...]:
    """这个人适合哪些互动主题：合并他所属星系的主题，没匹配上就用默认。"""
    themes: list[str] = []
    for group in person.groups:
        for theme in _GROUP_THEMES.get(group, ()):
            if theme not in themes:
                themes.append(theme)
    return tuple(themes) or _DEFAULT_THEMES


def _extra_interactions() -> list[SeedInteraction]:
    """按活跃度画像给每个人生成互动记录。"""
    pool_of = seed_roster.THEMED_INTERACTIONS
    places = seed_roster.EXTRA_PLACES
    result: list[SeedInteraction] = []

    for person in _extra_people():
        profile = _ACTIVITY_PROFILE.get(person.activity or "warm", _ACTIVITY_PROFILE["warm"])
        recent_low, recent_high, span, count_low, count_high = profile

        days_ago = _between(f"{person.name}-recent", recent_low, recent_high)
        count = _between(f"{person.name}-count", count_low, count_high)
        themes = _themes_for(person)

        for index in range(count):
            # 第 0 条是最近的一次，往后间隔越来越大 —— 像真实使用中慢慢稀疏。
            if index == 0:
                offset = days_ago
            else:
                step = int(span / max(count - 1, 1) * (0.5 + index))
                offset = days_ago + step
            item_date = ANCHOR_TODAY - timedelta(days=offset)

            theme = themes[index % len(themes)]
            theme_pool = pool_of.get(theme) or pool_of["chat"]
            pick = theme_pool[_between(f"{person.name}-{index}-{theme}", 0, len(theme_pool) - 1)]

            location = pick.get("location")
            if location is None and _hash_unit(f"{person.name}-{index}-place") < 0.25:
                location = places[_between(f"{person.name}-{index}-pl", 0, len(places) - 1)]

            result.append(
                SeedInteraction(
                    person.name,
                    item_date,
                    pick["title"],
                    pick["content"],
                    location=location,
                )
            )

    return result


def _shared_events() -> list[SeedInteraction]:
    """共同经历：同一次事件记在每个人名下，并共享一个 event 标签。

    星图上"朋友之间的线"就来自这里 —— 只有真的同框过才会连起来。
    """
    return [
        # 摄影社秋季外拍：林夕 + 唐昕 + 江辰
        SeedInteraction(
            "唐昕", anchor(2026, 10, 3), "摄影社外拍", "带了三脚架，拍了一整卷。",
            location="南湖公园", attachments=["/demo/photo-camera.svg"], event="外拍-2026-10-03",
        ),
        SeedInteraction(
            "林夕", anchor(2026, 10, 3), "摄影社外拍", "带了三脚架，拍了一整卷。",
            location="南湖公园", event="外拍-2026-10-03",
        ),
        SeedInteraction(
            "江辰", anchor(2026, 10, 3), "摄影社外拍", "带了三脚架，拍了一整卷。",
            location="南湖公园", event="外拍-2026-10-03",
        ),
        # 高中同学聚会：阿杰 + 苏晴 + 李楠
        SeedInteraction(
            "阿杰", anchor(2026, 9, 18), "高中同学聚会", "在老地方坐了整整一下午。",
            location="学校后街", event="高中聚会-2026-09-18",
        ),
        SeedInteraction(
            "苏晴", anchor(2026, 9, 18), "高中同学聚会", "在老地方坐了整整一下午。",
            location="学校后街", event="高中聚会-2026-09-18",
        ),
        SeedInteraction(
            "李楠", anchor(2026, 9, 18), "高中同学聚会", "在老地方坐了整整一下午。",
            location="学校后街", event="高中聚会-2026-09-18",
        ),
        # 跨年：阿杰 + 小鹿 + 周航
        SeedInteraction(
            "阿杰", anchor(2025, 12, 31), "一起跨年", "在天台等到零点，冻得不行。",
            location="宿舍天台", event="跨年-2025",
        ),
        SeedInteraction(
            "小鹿", anchor(2025, 12, 31), "一起跨年", "在天台等到零点，冻得不行。",
            location="宿舍天台", event="跨年-2025",
        ),
        SeedInteraction(
            "周航", anchor(2025, 12, 31), "一起跨年", "在天台等到零点，冻得不行。",
            location="宿舍天台", event="跨年-2025",
        ),
        # 实验室组会后的饭局：陈屿 + 宋言 + 许老师
        SeedInteraction(
            "陈屿", anchor(2026, 5, 28), "组会后的饭局", "聊到很晚，差点没赶上末班车。",
            location="学校后街", event="组会饭局-2026-05-28",
        ),
        SeedInteraction(
            "宋言", anchor(2026, 5, 28), "组会后的饭局", "聊到很晚，差点没赶上末班车。",
            location="学校后街", event="组会饭局-2026-05-28",
        ),
        SeedInteraction(
            "许老师", anchor(2026, 5, 28), "组会后的饭局", "聊到很晚，差点没赶上末班车。",
            location="学校后街", event="组会饭局-2026-05-28",
        ),
    ]


def _solo_interactions() -> list[SeedInteraction]:
    """独处记录：没有别人，只有自己的一段生活片段。"""
    result: list[SeedInteraction] = []
    for raw in seed_roster.SOLO_INTERACTIONS:
        year, month, day = raw["date"]
        result.append(
            SeedInteraction(
                SELF_PERSON_KEY,
                date(year, month, day),
                raw["title"],
                raw["content"],
                location=raw.get("location"),
                mood=raw.get("mood"),
            )
        )
    return result


def _solo() -> list[SeedInteraction]:
    """「独处」的记录：没有别人，只有自己的一段生活片段。

    用 ``SELF_PERSON_KEY`` 指代"我"，写入时由 seed 解析成 is_self 那一行。
    """
    return [
        SeedInteraction(
            SELF_PERSON_KEY,
            anchor(2026, 10, 4),
            "一个人去看了场电影",
            "散场以后在路边坐了一会儿，风很凉。",
            location="老电影院",
            mood="🌙",
        ),
        SeedInteraction(
            SELF_PERSON_KEY,
            anchor(2026, 9, 27),
            "把阳台收拾干净了",
            "换了土，顺手把枯掉的叶子剪了。",
            location="家",
            mood="🌿",
        ),
        SeedInteraction(
            SELF_PERSON_KEY,
            anchor(2026, 9, 14),
            "跑完第一个十公里",
            "最后一公里几乎是走完的，但没停。",
            location="滨江步道",
            mood="💪",
        ),
    ]


#: 完整人物表：14 个手写的人 + ``seed_roster`` 里的 41 个批量人物 = 55 人。
#: 必须放在 ``_extra_people()`` 定义之后。
DEMO_PEOPLE: list[SeedPerson] = [*_CURATED_PEOPLE, *_extra_people()]


DEMO_INTERACTIONS: list[SeedInteraction] = [
    *_linxi(),
    *_chenyu(),
    *_jay(),
    *_xiaolu(),
    *_roommates(),
    *_photo_club(),
    *_lab(),
    *_high_school(),
    *_family(),
    *_solo(),
    *_solo_interactions(),
    # 共同经历：让星图上真的长出"朋友之间的线"。
    *_shared_events(),
    # 41 个批量人物各自的互动，按活跃度画像铺开时间。
    *_extra_interactions(),
]

#: §49 五条未完待续；小鹿那条已经是 done。
DEMO_COMMITMENTS: list[SeedCommitment] = [
    SeedCommitment("陈屿", "把租房网站发给他"),
    SeedCommitment("妈妈", "周末帮忙看路由器型号"),
    SeedCommitment("林夕", "下次见面把摄影活动照片发给她"),
    SeedCommitment("小鹿", "把比赛 PPT 模板发给她", status="done"),
    SeedCommitment("许老师", "确认下周组会材料"),
]

#: §50 重要日期。生日固定 11-12；考试与答辩跟着今天走，让“今天”页始终有内容。
DEMO_IMPORTANT_DATES: list[SeedImportantDate] = [
    SeedImportantDate("林夕", "生日", date=this_month_day(11, 12), repeat_type="yearly"),
    SeedImportantDate("林夕", "教师资格证考试", date=this_month_day(11, 22)),
    SeedImportantDate("陈屿", "去杭州入职", date_text="2026 年 11 月", date_precision="month"),
    SeedImportantDate("小鹿", "比赛答辩", date=ANCHOR_TODAY + timedelta(days=7)),
]

#: §51 偏好：只写用户明确记下的内容。
DEMO_PREFERENCES: list[SeedPreference] = [
    SeedPreference("林夕", "like", "胶片摄影"),
    SeedPreference("林夕", "like", "绿色"),
    SeedPreference("林夕", "interest", "陈奕迅"),
    SeedPreference("林夕", "wish", "重庆旅行"),
    SeedPreference("陈屿", "interest", "数据可视化"),
    SeedPreference("陈屿", "interest", "咖啡"),
]

#: 借还：借给林夕的 50mm 镜头必须在，这样“今天 / 借还”不是空的。
DEMO_BORROWS: list[SeedBorrow] = [
    SeedBorrow("林夕", "lent_to", "50mm 镜头", anchor(2026, 8, 30), notes="摄影社秋季活动那天借走的"),
    SeedBorrow("陈屿", "borrowed_from", "数据可视化课程笔记", anchor(2026, 9, 12)),
    SeedBorrow("小鹿", "lent_to", "移动硬盘", anchor(2026, 8, 12), notes="拷完素材记得还"),
    SeedBorrow("周航", "borrowed_from", "考研复习资料", anchor(2026, 9, 28)),
    SeedBorrow("许老师", "lent_to", "实验室门禁卡", anchor(2026, 3, 15), status="returned"),
]

__all__ = [
    "ANCHOR_TODAY",
    "DEMO_BORROWS",
    "DEMO_COMMITMENTS",
    "DEMO_GROUPS",
    "DEMO_IMPORTANT_DATES",
    "DEMO_INTERACTIONS",
    "DEMO_PEOPLE",
    "DEMO_PREFERENCES",
    "DEMO_USER",
    "SeedBorrow",
    "SeedCommitment",
    "SeedImportantDate",
    "SeedInteraction",
    "SeedPerson",
    "SeedPreference",
    "anchor",
    "days_from_anchor",
    "this_month_day",
]
