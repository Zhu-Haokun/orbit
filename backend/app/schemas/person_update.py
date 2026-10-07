"""PersonUpdate schema（``PersonUpdate``，规范 §44 / §22 最近近况）。"""

from __future__ import annotations

import uuid

from pydantic import Field

from app.models.enums import UpdateStatus
from app.schemas.common import CamelModel, UtcDatetime


class PersonUpdateRead(CamelModel):
    id: uuid.UUID
    person_id: uuid.UUID
    content: str
    source_interaction_id: uuid.UUID | None = None
    status: UpdateStatus = UpdateStatus.ACTIVE
    created_at: UtcDatetime
    updated_at: UtcDatetime


class PersonUpdateInput(CamelModel):
    person_id: uuid.UUID
    content: str = Field(min_length=1)
    source_interaction_id: uuid.UUID | None = None
    status: UpdateStatus = UpdateStatus.ACTIVE


class PersonUpdatePatch(CamelModel):
    content: str | None = Field(default=None, min_length=1)
    source_interaction_id: uuid.UUID | None = None
    status: UpdateStatus | None = None
