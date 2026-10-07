"""Commitment schema（``Commitment``，规范 §44 / §23 未完待续）。"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.models.enums import CommitmentStatus
from app.schemas.common import CamelModel, UtcDatetime


class CommitmentRead(CamelModel):
    id: uuid.UUID
    person_id: uuid.UUID
    content: str
    due_date: UtcDatetime | None = None
    due_text: str | None = None
    status: CommitmentStatus = CommitmentStatus.OPEN
    source_interaction_id: uuid.UUID | None = None
    created_at: UtcDatetime
    completed_at: UtcDatetime | None = None


class CommitmentInput(CamelModel):
    person_id: uuid.UUID
    content: str = Field(min_length=1)
    due_date: datetime | None = None
    due_text: str | None = Field(default=None, max_length=120)
    status: CommitmentStatus = CommitmentStatus.OPEN
    source_interaction_id: uuid.UUID | None = None


class CommitmentPatch(CamelModel):
    content: str | None = Field(default=None, min_length=1)
    due_date: datetime | None = None
    due_text: str | None = Field(default=None, max_length=120)
    status: CommitmentStatus | None = None
    source_interaction_id: uuid.UUID | None = None
