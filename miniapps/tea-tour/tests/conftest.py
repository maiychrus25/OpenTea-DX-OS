# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Throwaway Postgres and the install's database step, reused from platform/cli (run with its requirements too)."""
import base64
import importlib.util
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
import pytest
from psycopg.conninfo import make_conninfo

APP_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_DIR))

# The CLI's pg_url fixture (and its sys.path entry for dxos_cli), loaded under another name than "conftest".
_spec = importlib.util.spec_from_file_location("cli_conftest", APP_DIR.parents[1] / "platform/cli/tests/conftest.py")
_cli_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cli_conftest)
pg_url = _cli_conftest.pg_url

from dxos_cli.database import drop_app_database, ensure_app_database  # noqa: E402

from tea_tour import store  # noqa: E402

LATER = datetime.now(timezone.utc) + timedelta(days=7)


@pytest.fixture(scope="session")
def app_db_url(pg_url):
    """Schema and role app_tea_tour with migrations/ applied as that role, exactly as ./dxos install does."""
    with psycopg.connect(pg_url, autocommit=True) as admin:
        drop_app_database(admin, "tea-tour")
        password = ensure_app_database(admin, "tea-tour", APP_DIR / "migrations")
    return make_conninfo(pg_url, user="app_tea_tour", password=password)


@pytest.fixture
def db(app_db_url, monkeypatch):
    """Empty tables and DXOS_APP_DB_URL set; yields a connection as the app role."""
    monkeypatch.setenv("DXOS_APP_DB_URL", app_db_url)
    with store.connect(app_db_url) as conn:
        conn.execute("TRUNCATE bookings, tours")
        yield conn


def add_tour(conn, htx="TC", title="Tour đồi chè Tân Cương", starts_at=LATER, seats=5, status="OPEN",
             guide_user_id=None, guide_name=None, price_vnd=250000):
    return conn.execute(
        """INSERT INTO tours (htx_code, title, starts_at, meeting_point, seats, price_vnd, guide_user_id, guide_name, status)
           VALUES (%s, %s, %s, 'Nhà văn hoá xóm Hồng Thái', %s, %s, %s, %s, %s) RETURNING id""",
        (htx, title, starts_at, seats, price_vnd, guide_user_id, guide_name, status)).fetchone()[0]


def add_booking(conn, tour_id, htx="TC", code="AAAA2222", guest_name="Khách", phone="0912345678", party_size=1,
                status="PENDING"):
    return conn.execute(
        """INSERT INTO bookings (htx_code, tour_id, code, guest_name, phone, party_size, status)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (htx, tour_id, code, guest_name, phone, party_size, status)).fetchone()[0]


def bearer(sub="kc-manager-tc", htx="TC", roles=("manager",), name="Quản trị TC") -> dict:
    claims = {"sub": sub, "name": name, "htx_code": htx, "realm_access": {"roles": list(roles)}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return {"Authorization": f"Bearer h.{payload}.s"}
