# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Throwaway Postgres and the install's database step, reused from platform/cli (run with its requirements too)."""
import base64
import importlib.util
import json
import sys
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

from leaf_purchase import store  # noqa: E402


@pytest.fixture(scope="session")
def app_db_url(pg_url):
    """Schema and role app_leaf_purchase with migrations/ applied as that role, exactly as ./dxos install does."""
    with psycopg.connect(pg_url, autocommit=True) as admin:
        drop_app_database(admin, "leaf-purchase")
        password = ensure_app_database(admin, "leaf-purchase", APP_DIR / "migrations")
    return make_conninfo(pg_url, user="app_leaf_purchase", password=password)


@pytest.fixture
def db(app_db_url, monkeypatch):
    """Empty tables and DXOS_APP_DB_URL set; yields a connection as the app role."""
    monkeypatch.setenv("DXOS_APP_DB_URL", app_db_url)
    with store.connect(app_db_url) as conn:
        conn.execute("TRUNCATE payouts, tickets, periods, grades")
        yield conn


def add_grade(conn, htx="TC", name="Loại 1", price_vnd=8000, active=True):
    return conn.execute("INSERT INTO grades (htx_code, name, price_vnd, active) VALUES (%s, %s, %s, %s) RETURNING id",
                        (htx, name, price_vnd, active)).fetchone()[0]


def add_ticket(conn, grade_id, htx="TC", household_id="h1", household_name="Hộ ông Ba", weighed_on="2030-05-01",
               kg="10.0", price_vnd=8000, voided=False):
    return conn.execute(
        """INSERT INTO tickets (htx_code, household_id, household_name, weighed_on, grade_id, grade_name, kg,
                                price_vnd, amount_vnd, voided)
           VALUES (%s, %s, %s, %s, %s, 'Loại 1', %s, %s, round(%s::numeric * %s), %s) RETURNING id""",
        (htx, household_id, household_name, weighed_on, grade_id, kg, price_vnd, kg, price_vnd, voided)).fetchone()[0]


def bearer(sub="kc-manager-tc", htx="TC", roles=("manager",), name="Quản trị TC") -> dict:
    claims = {"sub": sub, "name": name, "htx_code": htx, "realm_access": {"roles": list(roles)}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return {"Authorization": f"Bearer h.{payload}.s"}
