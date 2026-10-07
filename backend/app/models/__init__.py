"""SQLAlchemy 模型（规范 §44 数据模型）。

每张表对应 §44 的一节；枚举值逐字对齐 ``frontend/src/types/index.ts``。
删除策略见 §58：删掉一个人，与他相关的全部记录一起消失。
"""

from __future__ import annotations

from app.models.attachment import Attachment
from app.models.borrow_record import BorrowRecord
from app.models.commitment import Commitment
from app.models.group import Group, people_groups
from app.models.important_date import ImportantDate
from app.models.interaction import Interaction
from app.models.memory_comment import MemoryComment
from app.models.person import Person
from app.models.person_update import PersonUpdate
from app.models.preference import Preference
from app.models.user import User

__all__ = [
    "Attachment",
    "BorrowRecord",
    "Commitment",
    "Group",
    "ImportantDate",
    "Interaction",
    "MemoryComment",
    "Person",
    "PersonUpdate",
    "Preference",
    "User",
    "people_groups",
]
