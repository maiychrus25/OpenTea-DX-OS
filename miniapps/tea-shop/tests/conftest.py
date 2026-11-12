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

from tea_shop import store  # noqa: E402


@pytest.fixture(scope="session")
def app_db_url(pg_url):
    """Schema and role app_tea_shop with migrations/ applied as that role, exactly as ./dxos install does."""
    with psycopg.connect(pg_url, autocommit=True) as admin:
        drop_app_database(admin, "tea-shop")
        password = ensure_app_database(admin, "tea-shop", APP_DIR / "migrations")
    return make_conninfo(pg_url, user="app_tea_shop", password=password)


@pytest.fixture
def db(app_db_url, monkeypatch):
    """Empty tables and DXOS_APP_DB_URL set; yields a connection as the app role."""
    monkeypatch.setenv("DXOS_APP_DB_URL", app_db_url)
    with store.connect(app_db_url) as conn:
        conn.execute("TRUNCATE order_items, orders, products")
        yield conn


def add_product(conn, htx="TC", name="Chè Shan tuyết", pack="Gói 200g", price_vnd=150000, stock=10, lot_code=None,
                active=True):
    return conn.execute(
        """INSERT INTO products (htx_code, name, pack, price_vnd, stock, lot_code, active)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (htx, name, pack, price_vnd, stock, lot_code, active)).fetchone()[0]


def bearer(sub="kc-manager-tc", htx="TC", roles=("manager",), name="Quản trị TC") -> dict:
    claims = {"sub": sub, "name": name, "htx_code": htx, "realm_access": {"roles": list(roles)}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return {"Authorization": f"Bearer h.{payload}.s"}
