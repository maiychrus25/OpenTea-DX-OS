# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Schema và role riêng của mỗi mini-app, migration và tệp env chứa mật khẩu (spec §5 bước 2, §6.4).

Every identifier goes through sql.Identifier and every value through sql.Literal or a parameter; no SQL is built by
formatting. admin_conn is an autocommit superuser connection; migrations never run on it (ruling R16).
"""
import os
import secrets
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo

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
        """SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = %s AND c.relkind IN ('r', 'p') AND c.relname <> 'schema_migrations'
             AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
                             WHERE a.attrelid = c.oid AND a.attname = 'htx_code' AND NOT a.attisdropped
                               AND a.attnotnull AND a.atttypid = 'pg_catalog.text'::pg_catalog.regtype)
           ORDER BY c.relname""", (schema,))]


def outside_dependents(conn: psycopg.Connection, schema: str) -> list[str]:
    """Objects outside the schema that depend on objects inside it, which DROP SCHEMA ... CASCADE would also drop.

    A view's rule, a trigger, a column default or a policy has no schema of its own; it counts where its table is.
    """
    return [row[0] for row in conn.execute(
        """SELECT DISTINCT o.type || ' ' || o.identity
           FROM pg_depend d
           CROSS JOIN LATERAL pg_identify_object(d.classid, d.objid, d.objsubid) o
           LEFT JOIN LATERAL (
             SELECT ev_class AS rel FROM pg_rewrite WHERE d.classid = 'pg_rewrite'::regclass AND oid = d.objid
             UNION ALL SELECT tgrelid FROM pg_trigger WHERE d.classid = 'pg_trigger'::regclass AND oid = d.objid
             UNION ALL SELECT adrelid FROM pg_attrdef WHERE d.classid = 'pg_attrdef'::regclass AND oid = d.objid
             UNION ALL SELECT polrelid FROM pg_policy WHERE d.classid = 'pg_policy'::regclass AND oid = d.objid
           ) owner ON true
           LEFT JOIN pg_class oc ON oc.oid = owner.rel
           WHERE d.deptype IN ('n', 'a')
             AND CASE d.refclassid
                   WHEN 'pg_class'::regclass THEN (SELECT relnamespace FROM pg_class WHERE oid = d.refobjid)
                   WHEN 'pg_type'::regclass THEN (SELECT typnamespace FROM pg_type WHERE oid = d.refobjid)
                   WHEN 'pg_proc'::regclass THEN (SELECT pronamespace FROM pg_proc WHERE oid = d.refobjid)
                 END = (SELECT oid FROM pg_namespace WHERE nspname = %(s)s)
             AND COALESCE((SELECT nspname FROM pg_namespace WHERE oid = oc.relnamespace), o.schema) <> %(s)s
           ORDER BY 1""", {"s": schema})]


def role_password_statement(conn: psycopg.Connection, name: str, password: str, *, create: bool) -> sql.Composed:
    # A SCRAM verifier, never the cleartext: a failing statement is written to the server log with its text.
    verifier = sql.Literal(conn.pgconn.encrypt_password(password.encode(), name.encode(), b"scram-sha-256").decode())
    if create:
        return sql.SQL("CREATE ROLE {} WITH {} PASSWORD {}").format(sql.Identifier(name), ROLE_OPTIONS, verifier)
    return sql.SQL("ALTER ROLE {} PASSWORD {}").format(sql.Identifier(name), verifier)


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
            admin_conn.execute(role_password_statement(admin_conn, name, password, create=False))
    else:
        password = password or secrets.token_urlsafe(32)
        admin_conn.execute(role_password_statement(admin_conn, name, password, create=True))
    admin_conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {} AUTHORIZATION {}").format(ident, ident))
    # Migrations run on the app role's own login, never on admin_conn with SET ROLE: a migration's RESET ROLE or
    # COMMIT then only ever leads back to the app role (R16). Same server and database as admin_conn.
    with psycopg.connect(make_conninfo(admin_conn.info.dsn, user=name, password=password), autocommit=True) as conn:
        conn.execute(sql.SQL("SET search_path TO {}").format(ident))
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations "
                     "(file text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
        for path in sorted(migrations_dir.glob("*.sql")):
            # One transaction per file; a COMMIT inside the file can only commit the app's own work.
            with conn.transaction():
                if conn.execute("SELECT 1 FROM schema_migrations WHERE file = %s", (path.name,)).fetchone():
                    continue
                try:
                    conn.execute(path.read_text(encoding="utf-8"))  # no parameters: several statements allowed
                except psycopg.Error as exc:
                    raise InstallError(f"Migration {path.name} hỏng: {exc}") from exc
                # Here so an ordinary bad file rolls back; the check below is the one a migration cannot influence.
                missing = missing_htx_columns(conn, name)
                if missing:
                    raise InstallError(f"Migration {path.name}: bảng {', '.join(missing)} thiếu cột htx_code text NOT NULL")
                conn.execute("INSERT INTO schema_migrations (file) VALUES (%s)", (path.name,))
    missing = missing_htx_columns(admin_conn, name)  # a fresh session the migrations could not change
    if missing:
        raise InstallError(f"Bảng {', '.join(missing)} của {name} thiếu cột htx_code text NOT NULL")
    return password


def drop_app_database(admin_conn: psycopg.Connection, app_id: str, *, schema: bool = True, role: bool = True) -> None:
    """Drop schema app_<x> (CASCADE) and role app_<x>, and nothing else; parts already gone are skipped.

    Refuses, dropping nothing, when an object outside the schema depends on it: CASCADE would drop that too.
    """
    name = schema_name(app_id)
    ident = sql.Identifier(name)
    if schema:
        outside = outside_dependents(admin_conn, name)
        if outside:
            raise InstallError(f"Không xoá schema {name}: {'; '.join(outside)} nằm ngoài schema nhưng phụ thuộc vào nó "
                               "(xoá hoặc sửa các đối tượng đó trước)")
        admin_conn.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(ident))
    if role and database_state(admin_conn, app_id)["role_existed"]:
        # Also its grants and default privileges in this database, which would make DROP ROLE fail.
        admin_conn.execute(sql.SQL("DROP OWNED BY {}").format(ident))
        admin_conn.execute(sql.SQL("DROP ROLE {}").format(ident))


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
