"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-05

手写的初始迁移（规范 §44 / §6.2 / §62）：建出全部 11 张表。
执行 ``alembic upgrade head`` 之后应用即可直接启动，``main.py`` 不会再调用
``Base.metadata.create_all``（那条路径留给 ``python -m app.seed`` 的本地 Demo）。

可移植性说明：

* 主键统一用 ``sa.CHAR(36)``。这是 ``app.db.base.GUID`` 在非 PostgreSQL 上的实现；
  PostgreSQL 会把它映射成原生 ``uuid``。手写迁移里用同一套字符串列，
  两种数据库都能直接建表。
* 所有枚举列都是 ``VARCHAR(32)``，取值与 ``frontend/src/types/index.ts`` 完全一致
  （规范 §77），与 ``app.db.base.enum_column`` 生成的 DDL 一致，不依赖数据库原生 enum。
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID_LENGTH = 36
ENUM_LENGTH = 32


def _uuid(name: str, *, nullable: bool = False) -> sa.Column:
    return sa.Column(name, sa.CHAR(UUID_LENGTH), nullable=nullable)


def _enum(name: str, values: tuple[str, ...], *, default: str, nullable: bool = False) -> sa.Column:
    """字符串枚举列。

    与 ``app.db.base.enum_column`` 完全一致：``VARCHAR(32)`` 存枚举的 ``value``，
    不建数据库原生 enum，也不加 CHECK（SQLite 上改约束代价高）。
    取值集合写在注释里，方便后来的人对照 ``frontend/src/types/index.ts``：
    ``{', '.join(values)}``。
    """
    return sa.Column(
        name,
        sa.String(ENUM_LENGTH),
        nullable=nullable,
        server_default=default,
        comment=", ".join(values),
    )


def _created_at(name: str = "created_at") -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")
    )


def _updated_at(name: str = "updated_at") -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")
    )


def upgrade() -> None:
    # --- users ------------------------------------------------------------- #
    op.create_table(
        "users",
        _uuid("id", nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("nickname", sa.String(120), nullable=False),
        sa.Column("avatar_url", sa.String(512), nullable=True),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # --- groups ------------------------------------------------------------ #
    op.create_table(
        "groups",
        _uuid("id", nullable=False),
        _uuid("user_id", nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("icon", sa.String(64), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        _created_at(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_groups_user_id", ondelete="CASCADE"),
    )
    op.create_index("ix_groups_user_id", "groups", ["user_id"])

    # --- people ------------------------------------------------------------ #
    op.create_table(
        "people",
        _uuid("id", nullable=False),
        _uuid("user_id", nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("nickname", sa.String(120), nullable=True),
        sa.Column("avatar_url", sa.String(512), nullable=True),
        sa.Column("relationship_label", sa.String(120), nullable=True),
        sa.Column("met_at", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        _enum(
            "circle_level",
            ("core", "frequent", "normal", "occasional"),
            default="normal",
        ),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_people_user_id", ondelete="CASCADE"),
    )
    op.create_index("ix_people_user_id", "people", ["user_id"])

    # --- people_groups ----------------------------------------------------- #
    op.create_table(
        "people_groups",
        _uuid("person_id", nullable=False),
        _uuid("group_id", nullable=False),
        sa.PrimaryKeyConstraint("person_id", "group_id"),
        sa.ForeignKeyConstraint(
            ["person_id"], ["people.id"], name="fk_people_groups_person_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["group_id"], ["groups.id"], name="fk_people_groups_group_id", ondelete="CASCADE"
        ),
    )

    # --- interactions ------------------------------------------------------ #
    op.create_table(
        "interactions",
        _uuid("id", nullable=False),
        _uuid("user_id", nullable=False),
        _uuid("person_id", nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("interaction_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("interaction_type", sa.String(64), nullable=True),
        _enum("source", ("manual", "ai_parsed"), default="manual"),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_interactions_user_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["person_id"], ["people.id"], name="fk_interactions_person_id", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_interactions_user_id", "interactions", ["user_id"])
    op.create_index("ix_interactions_person_id", "interactions", ["person_id"])
    op.create_index("ix_interactions_interaction_date", "interactions", ["interaction_date"])

    # --- person_updates ---------------------------------------------------- #
    op.create_table(
        "person_updates",
        _uuid("id", nullable=False),
        _uuid("person_id", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        _uuid("source_interaction_id", nullable=True),
        _enum("status", ("active", "archived"), default="active"),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["person_id"], ["people.id"], name="fk_person_updates_person_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["source_interaction_id"],
            ["interactions.id"],
            name="fk_person_updates_source_interaction_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_person_updates_person_id", "person_updates", ["person_id"])

    # --- commitments ------------------------------------------------------- #
    op.create_table(
        "commitments",
        _uuid("id", nullable=False),
        _uuid("user_id", nullable=False),
        _uuid("person_id", nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_text", sa.String(120), nullable=True),
        _enum("status", ("open", "done", "cancelled", "later"), default="open"),
        _uuid("source_interaction_id", nullable=True),
        _created_at(),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_commitments_user_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["person_id"], ["people.id"], name="fk_commitments_person_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["source_interaction_id"],
            ["interactions.id"],
            name="fk_commitments_source_interaction_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_commitments_user_id", "commitments", ["user_id"])
    op.create_index("ix_commitments_person_id", "commitments", ["person_id"])

    # --- important_dates --------------------------------------------------- #
    op.create_table(
        "important_dates",
        _uuid("id", nullable=False),
        _uuid("person_id", nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("date_text", sa.String(120), nullable=True),
        _enum("date_precision", ("exact", "month", "season", "text"), default="exact"),
        _enum("repeat_type", ("none", "yearly"), default="none"),
        sa.Column("notes", sa.Text(), nullable=True),
        _created_at(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["person_id"], ["people.id"], name="fk_important_dates_person_id", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_important_dates_person_id", "important_dates", ["person_id"])

    # --- preferences ------------------------------------------------------- #
    op.create_table(
        "preferences",
        _uuid("id", nullable=False),
        _uuid("person_id", nullable=False),
        _enum("category", ("like", "dislike", "interest", "wish", "food", "other"), default="other"),
        sa.Column("content", sa.String(255), nullable=False),
        _uuid("source_interaction_id", nullable=True),
        _created_at(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["person_id"], ["people.id"], name="fk_preferences_person_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["source_interaction_id"],
            ["interactions.id"],
            name="fk_preferences_source_interaction_id",
            ondelete="SET NULL",
        ),
    )
    op.create_index("ix_preferences_person_id", "preferences", ["person_id"])

    # --- borrow_records ---------------------------------------------------- #
    op.create_table(
        "borrow_records",
        _uuid("id", nullable=False),
        _uuid("user_id", nullable=False),
        _uuid("person_id", nullable=False),
        _enum("direction", ("borrowed_from", "lent_to"), default="lent_to"),
        sa.Column("item_name", sa.String(200), nullable=False),
        sa.Column("amount", sa.String(64), nullable=True),
        sa.Column("borrow_date", sa.Date(), nullable=False),
        sa.Column("expected_return_date", sa.Date(), nullable=True),
        _enum("status", ("open", "returned", "cancelled"), default="open"),
        sa.Column("notes", sa.Text(), nullable=True),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_borrow_records_user_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["person_id"], ["people.id"], name="fk_borrow_records_person_id", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_borrow_records_user_id", "borrow_records", ["user_id"])
    op.create_index("ix_borrow_records_person_id", "borrow_records", ["person_id"])

    # --- attachments ------------------------------------------------------- #
    op.create_table(
        "attachments",
        _uuid("id", nullable=False),
        _uuid("interaction_id", nullable=False),
        _enum("file_type", ("image", "file"), default="image"),
        sa.Column("file_url", sa.String(512), nullable=False),
        _created_at(),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["interaction_id"], ["interactions.id"], name="fk_attachments_interaction_id", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_attachments_interaction_id", "attachments", ["interaction_id"])


def downgrade() -> None:
    op.drop_index("ix_attachments_interaction_id", table_name="attachments")
    op.drop_table("attachments")
    op.drop_index("ix_borrow_records_person_id", table_name="borrow_records")
    op.drop_index("ix_borrow_records_user_id", table_name="borrow_records")
    op.drop_table("borrow_records")
    op.drop_index("ix_preferences_person_id", table_name="preferences")
    op.drop_table("preferences")
    op.drop_index("ix_important_dates_person_id", table_name="important_dates")
    op.drop_table("important_dates")
    op.drop_index("ix_commitments_person_id", table_name="commitments")
    op.drop_index("ix_commitments_user_id", table_name="commitments")
    op.drop_table("commitments")
    op.drop_index("ix_person_updates_person_id", table_name="person_updates")
    op.drop_table("person_updates")
    op.drop_index("ix_interactions_interaction_date", table_name="interactions")
    op.drop_index("ix_interactions_person_id", table_name="interactions")
    op.drop_index("ix_interactions_user_id", table_name="interactions")
    op.drop_table("interactions")
    op.drop_table("people_groups")
    op.drop_index("ix_people_user_id", table_name="people")
    op.drop_table("people")
    op.drop_index("ix_groups_user_id", table_name="groups")
    op.drop_table("groups")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
