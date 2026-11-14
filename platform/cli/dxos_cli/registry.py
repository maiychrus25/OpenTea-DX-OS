# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Bảng platform.installed_apps (platform/postgres/init/05-apps.sql): các app đã cài."""
from datetime import datetime

import psycopg
from psycopg.types.json import Jsonb


def installed_ids(conn: psycopg.Connection) -> set[str]:
    return {row[0] for row in conn.execute("SELECT id FROM platform.installed_apps")}


def register(conn: psycopg.Connection, manifest: dict) -> None:
    # Plain INSERT: a second commit of the same id fails loudly instead of overwriting an installed app.
    conn.execute(
        "INSERT INTO platform.installed_apps (id, name, version, menu, manifest) VALUES (%s, %s, %s, %s, %s)",
        (manifest["id"], manifest["name"], manifest["version"], Jsonb(manifest.get("menu", [])), Jsonb(manifest)),
    )


def update(conn: psycopg.Connection, manifest: dict) -> None:
    # Enablement rows are a different table and stay as they are.
    conn.execute("UPDATE platform.installed_apps SET name = %s, version = %s, menu = %s, manifest = %s WHERE id = %s",
                 (manifest["name"], manifest["version"], Jsonb(manifest.get("menu", [])), Jsonb(manifest),
                  manifest["id"]))


def unregister(conn: psycopg.Connection, app_id: str) -> None:
    conn.execute("DELETE FROM platform.installed_apps WHERE id = %s", (app_id,))


def enable(conn: psycopg.Connection, app_id: str, htx_code: str, enabled_by: str) -> None:
    conn.execute("INSERT INTO platform.app_enablements (app_id, htx_code, enabled_by) VALUES (%s, %s, %s)"
                 " ON CONFLICT (app_id, htx_code) DO NOTHING", (app_id, htx_code, enabled_by))


def disable_all(conn: psycopg.Connection, app_id: str) -> None:
    conn.execute("DELETE FROM platform.app_enablements WHERE app_id = %s", (app_id,))


def installed_apps(conn: psycopg.Connection) -> list[tuple[str, str, datetime]]:
    return conn.execute("SELECT id, version, installed_at FROM platform.installed_apps ORDER BY id").fetchall()
