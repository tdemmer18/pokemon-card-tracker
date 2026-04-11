"""
Durable storage for checklist + per-user preferences.

Uses PostgreSQL when DATABASE_URL is set (Streamlit secrets or env). Otherwise falls
back to data/progress.json (fine for local dev; not durable on Streamlit Community Cloud).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

try:
    from sqlalchemy import JSON, ForeignKey, Integer, String, Text, create_engine, delete, select
    from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

    SQLALCHEMY_AVAILABLE = True
except ModuleNotFoundError:
    JSON = ForeignKey = Integer = String = Text = None
    create_engine = delete = select = None
    DeclarativeBase = object
    Mapped = Any
    Session = Any
    mapped_column = None
    sessionmaker = Any
    SQLALCHEMY_AVAILABLE = False


if SQLALCHEMY_AVAILABLE:
    class Base(DeclarativeBase):
        pass


    class TrackerUser(Base):
        __tablename__ = "tracker_user"

        id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
        username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
        preferences: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


    class CollectionEntry(Base):
        __tablename__ = "collection_entry"

        user_id: Mapped[int] = mapped_column(
            ForeignKey("tracker_user.id", ondelete="CASCADE"),
            primary_key=True,
        )
        pokemon_id: Mapped[int] = mapped_column(Integer, primary_key=True)


    class AppSetting(Base):
        __tablename__ = "app_setting"

        key: Mapped[str] = mapped_column(String(64), primary_key=True)
        value: Mapped[str] = mapped_column(Text, nullable=False)
else:
    class Base:
        pass


    class TrackerUser:
        pass


    class CollectionEntry:
        pass


    class AppSetting:
        pass


_engine = None
_SessionFactory: sessionmaker[Session] | None = None


def get_database_url() -> str | None:
    url = os.environ.get("DATABASE_URL", "").strip()
    if url:
        return url
    try:
        import streamlit as st

        secret = st.secrets.get("DATABASE_URL")
        if secret:
            return str(secret).strip()
    except Exception:
        pass
    return None


def create_db_engine(url: str):
    if not SQLALCHEMY_AVAILABLE:
        raise RuntimeError("sqlalchemy is required for DATABASE_URL support")
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=5,
        connect_args={"connect_timeout": 15},
    )


def init_db_engine(url: str):
    global _engine, _SessionFactory
    if _engine is not None:
        return
    if not SQLALCHEMY_AVAILABLE:
        raise RuntimeError("sqlalchemy is required for DATABASE_URL support")
    _engine = create_db_engine(url)
    Base.metadata.create_all(_engine)
    _SessionFactory = sessionmaker(bind=_engine, expire_on_commit=False)


def db_engine_ready() -> bool:
    return _engine is not None and _SessionFactory is not None


def get_session() -> Session:
    if not _SessionFactory:
        raise RuntimeError("Database not initialized")
    return _SessionFactory()


def db_read_all_prefs() -> dict[str, dict[str, Any]]:
    with get_session() as session:
        rows = list(session.scalars(select(TrackerUser)).all())
        return {u.username: dict(u.preferences or {}) for u in rows}


def db_read_full(
    default_user: str,
) -> tuple[str, dict[str, dict[int, bool]], dict[str, dict[str, Any]]]:
    """Return (active_username, users_progress, preferences_by_username)."""
    with get_session() as session:
        users_list = list(session.scalars(select(TrackerUser).order_by(TrackerUser.id)).all())
        if not users_list:
            return default_user, {default_user: {}}, {}

        id_to_name = {u.id: u.username for u in users_list}
        prefs_by_user = {u.username: dict(u.preferences or {}) for u in users_list}

        users: dict[str, dict[int, bool]] = {u.username: {} for u in users_list}
        for row in session.scalars(select(CollectionEntry)).all():
            name = id_to_name.get(row.user_id)
            if name:
                users[name][int(row.pokemon_id)] = True

        active_row = session.scalar(select(AppSetting).where(AppSetting.key == "active_username"))
        current = (active_row.value if active_row else users_list[0].username).strip()
        if current not in users:
            current = users_list[0].username
        return current, users, prefs_by_user


def db_write_full(
    current_user: str,
    users: dict[str, dict[int, bool]],
    prefs_for_active_user: dict[str, Any],
) -> None:
    with get_session() as session:
        by_name = {u.username: u for u in session.scalars(select(TrackerUser)).all()}

        for username in sorted(users.keys()):
            if username not in by_name:
                u = TrackerUser(username=username, preferences={})
                session.add(u)
        session.flush()
        by_name = {u.username: u for u in session.scalars(select(TrackerUser)).all()}

        for username, progress in users.items():
            uid = by_name[username].id
            session.execute(delete(CollectionEntry).where(CollectionEntry.user_id == uid))
            for pid, ok in progress.items():
                if ok:
                    session.add(CollectionEntry(user_id=uid, pokemon_id=int(pid)))

        if current_user in by_name:
            by_name[current_user].preferences = dict(prefs_for_active_user)

        row = session.scalar(select(AppSetting).where(AppSetting.key == "active_username"))
        if row:
            row.value = current_user
        else:
            session.add(AppSetting(key="active_username", value=current_user))
        session.commit()


def db_save_preferences_only(username: str, prefs: dict[str, Any]) -> None:
    with get_session() as session:
        user = session.scalar(select(TrackerUser).where(TrackerUser.username == username))
        if user is None:
            return
        user.preferences = dict(prefs)
        session.commit()


def _sanitize_username(name: str) -> str:
    return " ".join(name.strip().split())


def _normalize_user_progress(raw: Any) -> dict[int, bool]:
    if not isinstance(raw, dict):
        return {}
    out: dict[int, bool] = {}
    for k, v in raw.items():
        try:
            pk = int(k)
        except (TypeError, ValueError):
            continue
        if v:
            out[pk] = True
    return out


def file_read_full(
    progress_path: Path,
    default_user: str,
) -> tuple[str, dict[str, dict[int, bool]], dict[str, dict[str, Any]]]:
    if not progress_path.exists():
        return default_user, {default_user: {}}, {}
    try:
        raw = json.loads(progress_path.read_text())
    except json.JSONDecodeError:
        return default_user, {default_user: {}}, {}

    prefs_by_user: dict[str, dict[str, Any]] = {}
    if isinstance(raw, dict):
        up = raw.get("user_preferences")
        if isinstance(up, dict):
            for uname, blob in up.items():
                name = _sanitize_username(str(uname))
                if name and isinstance(blob, dict):
                    prefs_by_user[name] = dict(blob)

    if not isinstance(raw, dict):
        return default_user, {default_user: {}}, prefs_by_user

    if "users" in raw:
        users_raw = raw.get("users", {})
        users: dict[str, dict[int, bool]] = {}
        if isinstance(users_raw, dict):
            for username, user_progress in users_raw.items():
                normalized_name = _sanitize_username(str(username))
                if not normalized_name or not isinstance(user_progress, dict):
                    continue
                users[normalized_name] = _normalize_user_progress(user_progress)
        if not users:
            users = {default_user: {}}
        current_user = _sanitize_username(str(raw.get("current_user", default_user)))
        if current_user not in users:
            current_user = next(iter(users))
        return current_user, users, prefs_by_user

    return default_user, {default_user: _normalize_user_progress(raw)}, prefs_by_user


def file_write_full(
    progress_path: Path,
    current_user: str,
    users: dict[str, dict[int, bool]],
    active_user_prefs: dict[str, Any],
) -> None:
    _, _, existing_prefs = file_read_full(progress_path, current_user)
    merged_prefs = dict(existing_prefs)
    merged_prefs[current_user] = dict(active_user_prefs)

    serializable_users = {
        username: {str(key): value for key, value in progress.items() if value}
        for username, progress in sorted(users.items())
    }
    payload = {
        "current_user": current_user,
        "users": serializable_users,
        "user_preferences": {k: dict(v) for k, v in sorted(merged_prefs.items())},
    }
    progress_path.parent.mkdir(parents=True, exist_ok=True)
    progress_path.write_text(json.dumps(payload, indent=2, sort_keys=True))


def file_save_preferences_only(
    progress_path: Path,
    default_user: str,
    username: str,
    prefs: dict[str, Any],
) -> None:
    """Update only `user_preferences` for one user; preserve rest of file if present."""
    current_user, users, prefs_map = file_read_full(progress_path, default_user)
    prefs_map = dict(prefs_map)
    prefs_map[username] = dict(prefs)
    serializable_users = {
        u: {str(k): v for k, v in prog.items() if v} for u, prog in sorted(users.items())
    }
    payload = {
        "current_user": current_user,
        "users": serializable_users,
        "user_preferences": {k: dict(v) for k, v in sorted(prefs_map.items())},
    }
    progress_path.parent.mkdir(parents=True, exist_ok=True)
    progress_path.write_text(json.dumps(payload, indent=2, sort_keys=True))
