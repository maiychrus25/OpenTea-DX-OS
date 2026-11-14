# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Throwaway Postgres and the install's database step, reused from platform/cli (run with its requirements too)."""
import base64
import importlib.util
import json
import sys
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb
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

from custom_books import store  # noqa: E402

BOOK_NAME = "Chấm công hái chè"


@pytest.fixture(scope="session")
def app_db_url(pg_url):
    """Schema and role app_custom_books with migrations/ applied as that role, exactly as ./dxos install does."""
    with psycopg.connect(pg_url, autocommit=True) as admin:
        drop_app_database(admin, "custom-books")
        password = ensure_app_database(admin, "custom-books", APP_DIR / "migrations")
    return make_conninfo(pg_url, user="app_custom_books", password=password)


@pytest.fixture
def db(app_db_url, monkeypatch):
    """Empty tables and DXOS_APP_DB_URL set; yields a connection as the app role."""
    monkeypatch.setenv("DXOS_APP_DB_URL", app_db_url)
    with store.connect(app_db_url) as conn:
        conn.execute("TRUNCATE records, books")
        yield conn


def bearer(sub="kc-manager-tc", htx="TC", roles=("manager",), name="Quản trị TC") -> dict:
    claims = {"sub": sub, "name": name, "htx_code": htx, "realm_access": {"roles": list(roles)}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return {"Authorization": f"Bearer h.{payload}.s"}


def add_book(conn, htx="TC", name=BOOK_NAME, fields=(), status="PUBLISHED", officer="all", farmer="own",
             approval=False, icon="leaf", description="", created_by="kc-manager-tc"):
    """A book with the given Field objects (keys must be f1, f2, ...)."""
    return conn.execute(
        """INSERT INTO books (htx_code, name, description, icon, fields, next_key, officer_access, farmer_access,
                              approval, status, created_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (htx, name, description, icon, Jsonb([f.to_json() for f in fields]), len(fields) + 1, officer, farmer,
         approval, status, created_by)).fetchone()[0]


def add_record(conn, book_id, data, htx="TC", created_by="kc-manager-tc", created_by_name="Quản trị TC",
               entry_date="2026-11-10", status="APPROVED", household_id=None):
    return conn.execute(
        """INSERT INTO records (htx_code, book_id, data, entry_date, status, household_id, created_by, created_by_name)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (htx, book_id, Jsonb(data), entry_date, status, household_id, created_by, created_by_name)).fetchone()[0]
