"""HTTP 路由（规范 §45）。所有路由都挂在 ``/api`` 前缀下。"""

from __future__ import annotations

from app.api.ai import router as ai_router
from app.api.auth import router as auth_router
from app.api.borrow_records import router as borrow_records_router
from app.api.comments import router as comments_router
from app.api.commitments import router as commitments_router
from app.api.export import router as export_router
from app.api.galaxy import router as galaxy_router
from app.api.groups import router as groups_router
from app.api.important_dates import router as important_dates_router
from app.api.interactions import router as interactions_router
from app.api.me import router as me_router
from app.api.memories import router as memories_router
from app.api.people import router as people_router
from app.api.person_updates import router as person_updates_router
from app.api.preferences import router as preferences_router
from app.api.search import router as search_router
from app.api.storage import router as storage_router
from app.api.today import router as today_router
from app.api.uploads import router as uploads_router
from app.api.version import router as version_router

#: ``main.py`` 依次注册这些 router。
ROUTERS = (
    auth_router,
    groups_router,
    people_router,
    interactions_router,
    person_updates_router,
    commitments_router,
    important_dates_router,
    preferences_router,
    borrow_records_router,
    today_router,
    search_router,
    memories_router,
    ai_router,
    uploads_router,
    export_router,
    me_router,
    comments_router,
    galaxy_router,
    storage_router,
    version_router,
)

__all__ = ["ROUTERS"]
