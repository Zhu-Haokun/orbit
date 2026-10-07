"""``python -m app.seed`` —— 灌入完整 Demo 数据（规范 §47–§51 / §62 / §64）。

幂等策略：默认先清空演示账号名下的全部数据再重建；
如果演示数据已经存在且没带 ``--force``，则原样保留，只打印一行提示。

用法：

```bash
python -m app.seed            # 第一次建库 + 灌数据；已存在则跳过
python -m app.seed --force    # 清空演示账号的数据并重建
python -m app.seed --reset    # 删掉演示账号本身再重建（彻底回到初始状态）
python -m app.seed --quiet    # 只输出一行结果，适合脚本调用
```

建表用的是 ``app.db.session.init_db``（即 ``Base.metadata.create_all``），
因此没有 alembic 也能直接体验；生产环境请改用 ``alembic upgrade head``。
"""

from __future__ import annotations

import argparse
import sys
import uuid

import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal, init_db
from app.models.attachment import Attachment
from app.models.borrow_record import BorrowRecord
from app.models.commitment import Commitment
from app.models.enums import (
    BorrowDirection,
    BorrowStatus,
    CommitmentStatus,
    DatePrecision,
    RepeatType,
)
from app.models.group import Group, people_groups
from app.models.important_date import ImportantDate
from app.models.interaction import Interaction, normalize_interaction_date
from app.models.person import Person
from app.models.person_update import PersonUpdate
from app.models.preference import Preference
from app.models.user import User
from app.seed_data import (
    DEMO_BORROWS,
    DEMO_COMMITMENTS,
    DEMO_GROUPS,
    DEMO_IMPORTANT_DATES,
    DEMO_INTERACTIONS,
    DEMO_PEOPLE,
    DEMO_PREFERENCES,
    DEMO_USER,
    avatar_url,
)


def find_demo_user(db: Session) -> User | None:
    return db.execute(sa.select(User).where(User.email == DEMO_USER["email"])).scalars().first()


#: 演示数据里代表"我自己"的那个键，用于把几条独处记录挂在它名下。
SELF_KEY = "__self__"


def wipe_user_data(db: Session, user: User) -> None:
    """清空这个用户名下的全部数据，但保留账号本身。"""
    person_ids = list(db.execute(sa.select(Person.id).where(Person.user_id == user.id)).scalars().all())
    interaction_ids = list(db.execute(sa.select(Interaction.id).where(Interaction.user_id == user.id)).scalars().all())

    if interaction_ids:
        db.execute(sa.delete(Attachment).where(Attachment.interaction_id.in_(interaction_ids)))
        db.execute(sa.delete(Interaction).where(Interaction.id.in_(interaction_ids)))
    if person_ids:
        db.execute(sa.delete(PersonUpdate).where(PersonUpdate.person_id.in_(person_ids)))
        db.execute(sa.delete(ImportantDate).where(ImportantDate.person_id.in_(person_ids)))
        db.execute(sa.delete(Preference).where(Preference.person_id.in_(person_ids)))
        db.execute(sa.delete(people_groups).where(people_groups.c.person_id.in_(person_ids)))
    db.execute(sa.delete(Commitment).where(Commitment.user_id == user.id))
    db.execute(sa.delete(BorrowRecord).where(BorrowRecord.user_id == user.id))
    db.execute(sa.delete(Group).where(Group.user_id == user.id))
    db.execute(sa.delete(Person).where(Person.user_id == user.id))
    db.flush()


def build_demo_data(db: Session, user: User, *, force: bool) -> dict[str, int]:
    """重建演示数据，返回各类记录条数（便于打印与自检）。"""
    if force:
        wipe_user_data(db, user)

    groups: dict[str, Group] = {}
    for item in DEMO_GROUPS:
        group = Group(user_id=user.id, name=item["name"], icon=item["icon"], sort_order=item["sort_order"])
        db.add(group)
        groups[item["name"]] = group
    db.flush()

    people: dict[str, Person] = {}
    for item in DEMO_PEOPLE:
        person = Person(
            user_id=user.id,
            name=item.name,
            nickname=None,
            avatar_url=avatar_url(item.avatar) if item.avatar else None,
            relationship_label=item.relationship_label,
            met_at=item.met_at,
            notes=item.notes,
            circle_level=item.circle_level,
        )
        person.groups = [groups[name] for name in item.groups if name in groups]
        db.add(person)
        people[item.name] = person
    db.flush()

    # 「我」自己：星图的中心点，也是「独处」记录挂靠的人。
    # /api/me 会在需要时按需创建，这里预置一份带内容的 Demo 版本。
    self_person = db.execute(
        sa.select(Person).where(Person.user_id == user.id, Person.is_self.is_(True))
    ).scalar_one_or_none()
    if self_person is None:
        self_person = Person(
            user_id=user.id,
            name=user.nickname or "我",
            avatar_url="/avatars/moon.svg",
            is_self=True,
            notes="喜欢把日子记下来，怕以后想不起来。",
            mbti="INFJ",
            interests="胶片摄影, 手冲咖啡, 长跑, 独立音乐",
        )
        db.add(self_person)
        db.flush()
    people[SELF_KEY] = self_person

    interactions: list[Interaction] = []
    #: 同一次共同经历共享一个 event_id —— 星图据此在这些人之间连线。
    event_ids: dict[str, uuid.UUID] = {}
    for item in DEMO_INTERACTIONS:
        person = people[item.person]
        event_id = None
        if item.event:
            event_id = event_ids.setdefault(item.event, uuid.uuid4())
        interaction = Interaction(
            user_id=user.id,
            person_id=person.id,
            title=item.title,
            content=item.content,
            interaction_date=normalize_interaction_date(item.date),
            location=item.location,
            interaction_type=item.interaction_type,
            mood=item.mood,
            event_id=event_id,
        )
        db.add(interaction)
        interactions.append(interaction)
    db.flush()

    # 演示照片：回忆页的拼贴、放大查看、回顾带都需要真实图片才演示得出来。
    for item, interaction in zip(DEMO_INTERACTIONS, interactions, strict=True):
        for url in item.attachments:
            db.add(
                Attachment(
                    interaction_id=interaction.id,
                    file_type="image",
                    file_url=url,
                )
            )
    db.flush()

    # §47.2 的近况：来源指向该人物最近一条互动，前端就能显示“来自 9 月 21 日的记录”。
    latest_interaction: dict[str, Interaction] = {}
    for item, interaction in zip(DEMO_INTERACTIONS, interactions, strict=True):
        current = latest_interaction.get(item.person)
        if current is None or interaction.interaction_date > current.interaction_date:
            latest_interaction[item.person] = interaction

    updates = 0
    for item in DEMO_PEOPLE:
        source = latest_interaction.get(item.name)
        for content in item.updates:
            db.add(
                PersonUpdate(
                    person_id=people[item.name].id,
                    content=content,
                    source_interaction_id=source.id if source is not None else None,
                )
            )
            updates += 1

    commitments = 0
    for item in DEMO_COMMITMENTS:
        person = people[item.person]
        db.add(
            Commitment(
                user_id=user.id,
                person_id=person.id,
                content=item.content,
                due_date=item.due_date,
                due_text=item.due_text,
                status=CommitmentStatus(item.status),
                source_interaction_id=(
                    latest_interaction[item.person].id if item.person in latest_interaction else None
                ),
            )
        )
        commitments += 1

    important_dates = 0
    for item in DEMO_IMPORTANT_DATES:
        db.add(
            ImportantDate(
                person_id=people[item.person].id,
                title=item.title,
                date=item.date,
                date_text=item.date_text,
                date_precision=DatePrecision(item.date_precision),
                repeat_type=RepeatType(item.repeat_type),
                notes=item.notes,
            )
        )
        important_dates += 1

    preferences = 0
    for item in DEMO_PREFERENCES:
        db.add(
            Preference(
                person_id=people[item.person].id,
                category=item.category,
                content=item.content,
                source_interaction_id=(
                    latest_interaction[item.person].id if item.person in latest_interaction else None
                ),
            )
        )
        preferences += 1

    borrows = 0
    for item in DEMO_BORROWS:
        db.add(
            BorrowRecord(
                user_id=user.id,
                person_id=people[item.person].id,
                direction=BorrowDirection(item.direction),
                item_name=item.item_name,
                borrow_date=item.borrow_date,
                expected_return_date=item.expected_return_date,
                status=BorrowStatus(item.status),
                notes=item.notes,
            )
        )
        borrows += 1

    db.commit()
    return {
        "groups": len(groups),
        "people": len(people),
        "interactions": len(interactions),
        "updates": updates,
        "commitments": commitments,
        "important_dates": important_dates,
        "preferences": preferences,
        "borrow_records": borrows,
    }


def seed(*, force: bool = False, reset: bool = False, empty: bool = False) -> tuple[bool, dict[str, int]]:
    """执行 seed。返回 ``(是否真的写入了, 统计)``。

    ``empty=True`` 只创建演示账号、不写任何人物，
    用来验收各页面的空状态（文档 P2-4），不需要手动删数据。
    """
    init_db()
    db = SessionLocal()
    try:
        user = find_demo_user(db)
        if user is not None and reset:
            wipe_user_data(db, user)
            db.execute(sa.delete(User).where(User.id == user.id))
            db.commit()
            user = None

        fresh_account = user is None
        if fresh_account:
            user = User(
                email=DEMO_USER["email"],
                password_hash=hash_password(DEMO_USER["password"]),
                nickname=DEMO_USER["nickname"],
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # 账号可能被改过密码，seed 后始终保证演示密码可用。
            user.password_hash = hash_password(DEMO_USER["password"])
            user.nickname = DEMO_USER["nickname"]
            db.commit()

        existing = db.execute(sa.select(sa.func.count(Person.id)).where(Person.user_id == user.id)).scalar_one()

        if empty:
            # 清干净，只留一个空账号。
            wipe_user_data(db, user)
            db.commit()
            return True, {"people": 0, "groups": 0, "interactions": 0}

        if existing and not force:
            return False, {"people": int(existing)}

        # 刚建好的账号名下肯定是空的，不需要再清一遍。
        stats = build_demo_data(db, user, force=not fresh_account)
        return True, stats
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Orbit Demo 数据初始化")
    parser.add_argument("--force", action="store_true", help="清空演示账号的数据并重建")
    parser.add_argument("--reset", action="store_true", help="连同演示账号一起删掉再重建")
    parser.add_argument(
        "--empty",
        action="store_true",
        help="只建账号、不写任何人物，用来验收空状态",
    )
    parser.add_argument("--quiet", action="store_true", help="只输出一行结果")
    args = parser.parse_args(argv)

    written, stats = seed(force=args.force, reset=args.reset, empty=args.empty)

    if args.quiet:
        print("seeded" if written else "skipped")
        return 0

    if args.empty:
        print("演示账号已就绪，但没有任何人物（用于验收空状态）。")
        print(f"  账号：{DEMO_USER['email']} / {DEMO_USER['password']}（{DEMO_USER['nickname']}）")
        print("  想恢复完整演示数据：python -m app.seed --force")
        return 0

    if not written:
        print(f"演示数据已经在了，跳过。（当前 {stats.get('people', 0)} 个人；想重建请加 --force）")
        return 0

    print("Orbit 演示数据已就绪。")
    print(f"  账号：{DEMO_USER['email']} / {DEMO_USER['password']}（{DEMO_USER['nickname']}）")
    print(
        "  人物 {people} · 星系 {groups} · 互动 {interactions} · 近况 {updates}"
        " · 未完待续 {commitments} · 重要日期 {important_dates}"
        " · 偏好 {preferences} · 借还 {borrow_records}".format(**stats)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
