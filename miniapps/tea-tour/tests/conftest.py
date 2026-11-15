# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Throwaway Postgres and the install's database step, reused from platform/cli (run with its requirements too)."""
import importlib.util
import sys
from pathlib import Path

import psycopg
import pytest
from psycopg.conninfo import make_conninfo

APP_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))  # factories, importable by name from every test file

# The CLI's pg_url fixture (and its sys.path entry for dxos_cli), loaded under another name than "conftest".
_spec = importlib.util.spec_from_file_location("cli_conftest", APP_DIR.parents[1] / "platform/cli/tests/conftest.py")
_cli_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cli_conftest)
pg_url = _cli_conftest.pg_url

from dxos_cli.database import drop_app_database, ensure_app_database  # noqa: E402

from factories import bearer  # noqa: E402,F401  (re-exported for the test files that import it from here)

TABLES = "reviews, inquiries, booking_events, payments, bookings, tour_media, departures, tours, settings, media"


@pytest.fixture(scope="session")
def app_db_url(pg_url):
    """Schema and role app_tea_tour with migrations/ applied as that role, exactly as ./dxos install does."""
    with psycopg.connect(pg_url, autocommit=True) as admin:
        drop_app_database(admin, "tea-tour")
        password = ensure_app_database(admin, "tea-tour", APP_DIR / "migrations")
    return make_conninfo(pg_url, user="app_tea_tour", password=password)


@pytest.fixture
def db(app_db_url, monkeypatch):
    """Empty tables and DXOS_APP_DB_URL set; yields an autocommit connection as the app role."""
    from tea_tour import store
    monkeypatch.setenv("DXOS_APP_DB_URL", app_db_url)
    with store.connect(app_db_url) as conn:
        conn.execute(f"TRUNCATE {TABLES}")
        yield conn


@pytest.fixture
def client(db):
    """The app over HTTP as the gateway presents it (prefix stripped, root path set); errors become 500 pages."""
    from fastapi.testclient import TestClient

    from tea_tour import main, web
    with TestClient(main.app, root_path=web.PREFIX, raise_server_exceptions=False, follow_redirects=False) as test_client:
        yield test_client
