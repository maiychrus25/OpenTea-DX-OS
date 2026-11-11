# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Schema và role riêng của mỗi mini-app, migration và tệp env chứa mật khẩu (spec §5 bước 2, §6.4).

Every identifier goes through sql.Identifier and the password through sql.Literal; no SQL is built by formatting.
admin_conn must be an autocommit connection, so that each migration file gets its own real transaction.
"""
import os
import secrets
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

import psycopg
from psycopg import sql

from dxos_cli.manifest import schema_name
from dxos_cli.steps import InstallError

# LOGIN with a connection cap, so one app cannot exhaust the server; no other attribute.
ROLE_OPTIONS = sql.SQL("LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10")
ENV_KEY = "DXOS_APP_DB_URL"


def database_state(conn: psycopg.Connection, app_id: str) -> dict[str, bool]:
    name = schema_name(app_id)
    return {
        "schema_existed": conn.execute("SELECT 1 FROM pg_namespace WHERE nspname = %s", (name,)).fetchone() is not None,
        "role_existed": conn.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (name,)).fetchone() is not None,
    }


def missing_htx_columns(conn: psycopg.Connection, schema: str) -> list[str]:
    """Tables of the schema without an `htx_code text NOT NULL` column (schema_migrations is the CLI's own)."""
    return [row[0] for row in conn.execute(
        """SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = %s AND c.relkind IN ('r', 'p') AND c.relname <> 'schema_migrations'
             AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                             WHERE a.attrelid = c.oid AND a.attname = 'htx_code' AND NOT a.attisdropped
                               AND a.attnotnull AND a.atttypid = 'text'::regtype)
           ORDER BY c.relname""", (schema,))]


def ensure_app_database(admin_conn: psycopg.Connection, app_id: str, migrations_dir: Path,
                        password: str | None = None) -> str:
    """Create role and schema app_<x> (idempotent), apply new migrations as that role; return the role password.

    The password is set only when the role is created, or when the caller has none (its env file is gone).
    """
    name = schema_name(app_id)
    ident = sql.Identifier(name)
    if not migrations_dir.is_dir():
        raise InstallError(f"Không tìm thấy thư mục migration {migrations_dir}")
    if database_state(admin_conn, app_id)["role_existed"]:
        # Re-apply the options so an existing role can never keep more rights than a new one.
        admin_conn.execute(sql.SQL("ALTER ROLE {} WITH {}").format(ident, ROLE_OPTIONS))
        if password is None:
            password = secrets.token_urlsafe(32)
            admin_conn.execute(sql.SQL("ALTER ROLE {} PASSWORD {}").format(ident, sql.Literal(password)))
    else:
        password = password or secrets.token_urlsafe(32)
        admin_conn.execute(sql.SQL("CREATE ROLE {} WITH {} PASSWORD {}").format(ident, ROLE_OPTIONS, sql.Literal(password)))
    admin_conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {} AUTHORIZATION {}").format(ident, ident))
    for path in sorted(migrations_dir.glob("*.sql")):
        with admin_conn.transaction():
            admin_conn.execute(sql.SQL("SET LOCAL ROLE {}").format(ident))
            admin_conn.execute(sql.SQL("SET LOCAL search_path TO {}").format(ident))
            admin_conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations "
                               "(file text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
            if admin_conn.execute("SELECT 1 FROM schema_migrations WHERE file = %s", (path.name,)).fetchone():
                continue
            try:
                admin_conn.execute(path.read_text(encoding="utf-8"))  # no parameters: several statements allowed
            except psycopg.Error as exc:
                raise InstallError(f"Migration {path.name} hỏng: {exc}") from exc
            missing = missing_htx_columns(admin_conn, name)
            if missing:
                raise InstallError(f"Migration {path.name}: bảng {', '.join(missing)} thiếu cột htx_code text NOT NULL")
            admin_conn.execute("INSERT INTO schema_migrations (file) VALUES (%s)", (path.name,))
    return password


def drop_app_database(admin_conn: psycopg.Connection, app_id: str, *, schema: bool = True, role: bool = True) -> None:
    """Drop schema app_<x> (CASCADE) and role app_<x>, and nothing else; missing ones are skipped."""
    ident = sql.Identifier(schema_name(app_id))
    if schema:
        admin_conn.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(ident))
    if role:
        admin_conn.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(ident))


def write_env_file(path: Path, app_id: str, password: str) -> None:
    url = f"postgresql://{schema_name(app_id)}:{quote(password, safe='')}@postgres:5432/agrimarket"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        os.fchmod(handle.fileno(), 0o600)  # an older tmp file keeps its mode through O_TRUNC
        handle.write(f"{ENV_KEY}={url}\n")
    tmp.replace(path)


def read_env_password(path: Path) -> str | None:
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        key, _, value = line.partition("=")
        if key == ENV_KEY:
            password = urlsplit(value).password
            return unquote(password) if password else None
    return None
