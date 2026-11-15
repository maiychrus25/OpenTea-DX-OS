# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Throwaway Postgres and the install's database step, reused from platform/cli.

By default the CLI's fixture starts a Docker Postgres, as in tea-tour. Without Docker, set TEA_EXPERIENCE_TEST_PG_URL
to a superuser URL of a Postgres you started yourself (an empty database is fine); the install step still runs.
"""
import base64
import importlib.util
import json
import os
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

from dxos_cli.database import drop_app_database, ensure_app_database  # noqa: E402

from tea_experience import store  # noqa: E402

PG_URL_ENV = "TEA_EXPERIENCE_TEST_PG_URL"
if os.environ.get(PG_URL_ENV):
    @pytest.fixture(scope="session")
    def pg_url():
        return os.environ[PG_URL_ENV]
else:
    pg_url = _cli_conftest.pg_url

TABLES = "htx_intro, core_parcels, core_sync_log, sites, experiences, experience_sites, season_notes"


@pytest.fixture(scope="session")
def app_db_url(pg_url):
    """Schema and role app_tea_experience with migrations/ applied as that role, exactly as ./dxos install does."""
    with psycopg.connect(pg_url, autocommit=True) as admin:
        drop_app_database(admin, "tea-experience")
        password = ensure_app_database(admin, "tea-experience", APP_DIR / "migrations")
    return make_conninfo(pg_url, user="app_tea_experience", password=password)


@pytest.fixture
def db(app_db_url, monkeypatch):
    """Empty tables and DXOS_APP_DB_URL set; yields a connection as the app role."""
    monkeypatch.setenv("DXOS_APP_DB_URL", app_db_url)
    with store.connect(app_db_url) as conn:
        conn.execute(f"TRUNCATE {TABLES}")
        yield conn


def add_site(conn, htx="TC", name="Đồi chè Hồng Thái", is_public=True, lat=None, lng=None, parcel_code=None,
             description=None, sort_order=0):
    return conn.execute(
        """INSERT INTO sites (htx_code, name, description, latitude, longitude, parcel_code, is_public, sort_order)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (htx, name, description, lat, lng, parcel_code, is_public, sort_order)).fetchone()[0]


def add_experience(conn, htx="TC", name="Hái chè buổi sáng", is_visible=True, months=(3, 4), price=150000,
                   duration=120, description=None, sites=()):
    exp_id = conn.execute(
        """INSERT INTO experiences (htx_code, name, description, duration_min, price_vnd, months, is_visible)
           VALUES (%s, %s, %s, %s, %s, %s::int[], %s) RETURNING id""",
        (htx, name, description, duration, price, list(months), is_visible)).fetchone()[0]
    for site_id in sites:
        conn.execute("INSERT INTO experience_sites (htx_code, experience_id, site_id) VALUES (%s, %s, %s)",
                     (htx, exp_id, site_id))
    return exp_id


def add_intro(conn, htx="TC", name="HTX Tân Cương", intro_text="Chè xanh đồi cao.", synced=True,
              address="Xóm Hồng Thái, Tân Cương, Đại Từ, Thái Nguyên (số nhà 12)", locality="Tân Cương, Đại Từ",
              certification="VietGAP"):
    """A copy as a refresh leaves it, plus the manager's own locality and certification."""
    conn.execute(
        """INSERT INTO htx_intro (htx_code, name, address, locality_public, crop_types, season_label, total_area_ha,
                                  member_count, certification, intro_text, synced_at)
           VALUES (%s, %s, %s, %s, 'Chè Trung du, Chè Kim Tuyên', 'Lứa 1/2026', 12.5, 40, %s, %s,
                   CASE WHEN %s THEN now() END)""",
        (htx, name, address, locality, certification, intro_text, synced))


def bearer(sub="kc-manager-tc", htx="TC", roles=("manager",), name="Quản trị TC") -> dict:
    claims = {"sub": sub, "name": name, "htx_code": htx, "realm_access": {"roles": list(roles)}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return {"Authorization": f"Bearer h.{payload}.s"}


NOW = datetime.now(timezone.utc)
FUTURE = NOW + timedelta(days=7)
