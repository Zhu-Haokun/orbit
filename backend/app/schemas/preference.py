"""Preference schema（``Preference``，规范 §44 / §25 偏好）。"""

from __future__ import annotations

import uuid

from pydantic import Field

from app.models.enums import PreferenceCategory
from app.schemas.common import CamelModel, UtcDatetime


class PreferenceRead(CamelModel):
    id: uuid.UUID
    person_id: uuid.UUID
    category: PreferenceCategory = PreferenceCategory.OTHER
    content: str
    source_interaction_id: uuid.UUID | None = None
    created_at: UtcDatetime


class PreferenceInput(CamelModel):
    person_id: uuid.UUID
    category: PreferenceCategory = PreferenceCategory.OTHER
    content: str = Field(min_length=1, max_length=255)
    source_interaction_id: uuid.UUID | None = None


class PreferencePatch(CamelModel):
    category: PreferenceCategory | None = None
    content: str | None = Field(default=None, min_length=1, max_length=255)
    source_interaction_id: uuid.UUID | None = None
