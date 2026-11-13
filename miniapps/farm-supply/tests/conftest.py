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

from farm_supply import store  # noqa: E402

LATER = datetime.now(timezone.utc) + timedelta(days=7)


@pytest.fixture(scope="session")
def app_db_url(pg_url):
    """Schema and role app_farm_supply with migrations/ applied as that role, exactly as ./dxos install does."""
    with psycopg.connect(pg_url, autocommit=True) as admin:
        drop_app_database(admin, "farm-supply")
        password = ensure_app_database(admin, "farm-supply", APP_DIR / "migrations")
    return make_conninfo(pg_url, user="app_farm_supply", password=password)


@pytest.fixture
def db(app_db_url, monkeypatch):
    """Empty tables and DXOS_APP_DB_URL set; yields a connection as the app role."""
    monkeypatch.setenv("DXOS_APP_DB_URL", app_db_url)
    with store.connect(app_db_url) as conn:
        conn.execute("TRUNCATE settlements, requests, items, rounds")
        yield conn


def add_round(conn, htx="TC", title="Phân NPK vụ xuân", deadline=LATER, status="OPEN"):
    return conn.execute("INSERT INTO rounds (htx_code, title, deadline, status) VALUES (%s, %s, %s, %s) RETURNING id",
                        (htx, title, deadline, status)).fetchone()[0]


def add_item(conn, round_id, htx="TC", name="Phân NPK 16-16-8", unit="bao 50kg", price_vnd=400000):
    return conn.execute("INSERT INTO items (htx_code, round_id, name, unit, price_vnd) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                        (htx, round_id, name, unit, price_vnd)).fetchone()[0]


def add_request(conn, round_id, item_id, htx="TC", household_id="h1", household_name="Hộ ông Ba", quantity=2):
    return conn.execute("""INSERT INTO requests (htx_code, round_id, item_id, household_id, household_name, quantity)
                           VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                        (htx, round_id, item_id, household_id, household_name, quantity)).fetchone()[0]


def bearer(sub="kc-manager-tc", htx="TC", roles=("manager",), name="Quản trị TC") -> dict:
    claims = {"sub": sub, "name": name, "htx_code": htx, "realm_access": {"roles": list(roles)}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return {"Authorization": f"Bearer h.{payload}.s"}
