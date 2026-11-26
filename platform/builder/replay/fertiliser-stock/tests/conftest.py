# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""A throwaway Postgres for the tests: the gates export DXOS_TEST_DB_URL (a superuser URL of a scratch server)."""
import base64
import json
import os
import sys
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

APP_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_DIR))

from fertiliser_stock import store  # noqa: E402

ROLE = "app_gen_fertiliser_stock"


@pytest.fixture(scope="session")
def app_db_url():
    """Schema and role of the app with migrations/ applied as that role, the way ./dxos install does it."""
    admin_url = os.environ.get("DXOS_TEST_DB_URL")
    if not admin_url:
        pytest.fail("DXOS_TEST_DB_URL is not set: the tests need a throwaway Postgres")
    with psycopg.connect(admin_url, autocommit=True) as admin:
        admin.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(ROLE)))
        admin.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(ROLE)))
        admin.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD 'test'").format(sql.Identifier(ROLE)))
        admin.execute(sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(sql.Identifier(ROLE), sql.Identifier(ROLE)))
    url = make_conninfo(admin_url, user=ROLE, password="test")
    with store.connect(url) as conn:
        for path in sorted((APP_DIR / "migrations").glob("*.sql")):
            conn.execute(path.read_text(encoding="utf-8"))
    return url


@pytest.fixture
def db(app_db_url, monkeypatch):
    monkeypatch.setenv("DXOS_APP_DB_URL", app_db_url)
    with store.connect(app_db_url) as conn:
        conn.execute("TRUNCATE movements")
        yield conn


def bearer(sub="kc-manager-tc", htx="TC", roles=("manager",), name="Quản trị TC") -> dict:
    claims = {"sub": sub, "name": name, "htx_code": htx, "realm_access": {"roles": list(roles)}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return {"Authorization": f"Bearer h.{payload}.s"}
