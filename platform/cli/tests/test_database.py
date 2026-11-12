# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import stat
from pathlib import Path

import psycopg
import pytest
from psycopg.conninfo import make_conninfo

from dxos_cli.__main__ import main
from dxos_cli import database
from dxos_cli.database import ensure_app_database, read_env_password, write_env_file

FIXTURES = Path(__file__).parent / "fixtures"
MIGRATIONS = FIXTURES / "valid" / "migrations"


def admin(pg_url):
    return psycopg.connect(pg_url, autocommit=True)


def exists(pg_url, name="app_tea_tour"):
    with admin(pg_url) as conn:
        schema = conn.execute("SELECT 1 FROM pg_namespace WHERE nspname = %s", (name,)).fetchone() is not None
        role = conn.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (name,)).fetchone() is not None
    return schema, role


def as_app(pg_url, password, role="app_tea_tour"):
    return psycopg.connect(make_conninfo(pg_url, user=role, password=password), autocommit=True)


def env_file(root, app_id="tea-tour"):
    return root / "docker" / "runtime" / "apps" / f"{app_id}.env"


def app_dir(root):
    return str(root / "miniapps" / "tea-tour")


def add_migration(root, name, text):
    (root / "miniapps" / "tea-tour" / "migrations" / name).write_text(text, encoding="utf-8")


def core_tables(pg_url):
    """Tables outside app schemas and pg_catalog/information_schema, with their owners."""
    with admin(pg_url) as conn:
        return conn.execute("""SELECT schemaname, tablename, tableowner FROM pg_tables
                               WHERE schemaname NOT LIKE 'app\\_%' AND schemaname NOT IN ('pg_catalog', 'information_schema')
                               ORDER BY 1, 2""").fetchall()


def test_creates_schema_role_and_applies_migrations_once(root, pg_url):
    with admin(pg_url) as conn:
        password = ensure_app_database(conn, "tea-tour", MIGRATIONS)
        # Second run: the migration (plain CREATE TABLE) would fail if it ran again; the given password is kept.
        assert ensure_app_database(conn, "tea-tour", MIGRATIONS, password) == password
        owner = conn.execute("SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'app_tea_tour'").fetchone()
        assert owner == ("app_tea_tour",)
        applied = conn.execute("SELECT file FROM app_tea_tour.schema_migrations").fetchall()
        assert applied == [("001_tours.sql",)]
        role = conn.execute("""SELECT rolcanlogin, rolconnlimit, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
                                      rolbypassrls FROM pg_roles WHERE rolname = 'app_tea_tour'""").fetchone()
        assert role == (True, 10, False, False, False, False, False)
    assert len(password) >= 43  # token_urlsafe(32): 32 random bytes
    with as_app(pg_url, password) as conn:
        conn.execute("INSERT INTO tours (htx_code, name) VALUES ('TC', 'Đồi chè')")
        assert conn.execute("SELECT count(*) FROM app_tea_tour.tours").fetchone() == (1,)


@pytest.mark.parametrize("table", ["public.households", "platform.installed_apps", "audit.events"])
def test_app_role_cannot_read_core_tables(root, pg_url, table):
    with admin(pg_url) as conn:
        # Prisma owns public.households; the throwaway database has only the platform init scripts.
        conn.execute("CREATE TABLE IF NOT EXISTS public.households (id text PRIMARY KEY, htx_code text NOT NULL)")
        password = ensure_app_database(conn, "tea-tour", MIGRATIONS)
    with as_app(pg_url, password) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(f"SELECT * FROM {table}")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("CREATE TABLE public.app_owned (id int)")


def test_rejects_table_without_htx_code(root, pg_url, capsys):
    migrations = root / "miniapps" / "tea-tour" / "migrations"
    (migrations / "002_bad.sql").write_text(
        "CREATE TABLE no_htx (id int);\nCREATE TABLE nullable_htx (id int, htx_code text);\n", encoding="utf-8")
    assert main(["prepare", app_dir(root)]) == 1
    err = capsys.readouterr().err
    assert "002_bad.sql" in err and "no_htx" in err and "nullable_htx" in err and "htx_code" in err
    assert exists(pg_url) == (False, False)
    assert not env_file(root).exists()
    assert not (root / "docker" / "runtime" / "apps" / "tea-tour.pending.json").exists()


def test_undo_keeps_preexisting_schema(root, pg_url):
    # Replay: prepare, a re-run (which now sees this install's own schema), then abort from the journal alone.
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["abort", "tea-tour"]) == 0
    assert exists(pg_url) == (False, False)
    assert not env_file(root).exists()

    # Data kept by a remove without --purge belongs to no install, so a later aborted install must keep it.
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["commit", "tea-tour"]) == 0
    with admin(pg_url) as conn:
        conn.execute("INSERT INTO app_tea_tour.tours (htx_code, name) VALUES ('TC', 'giữ lại')")
    assert main(["remove", "tea-tour"]) == 0
    kept_env = env_file(root).read_text(encoding="utf-8")
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["abort", "tea-tour"]) == 0
    assert exists(pg_url) == (True, True)
    assert env_file(root).read_text(encoding="utf-8") == kept_env
    with as_app(pg_url, read_env_password(env_file(root))) as conn:
        assert conn.execute("SELECT name FROM tours").fetchall() == [("giữ lại",)]


def test_purge_drops_schema_role_and_env_file(root, pg_url):
    with admin(pg_url) as conn:
        ensure_app_database(conn, "other-app", MIGRATIONS)
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["commit", "tea-tour"]) == 0
    assert main(["remove", "tea-tour"]) == 0
    assert exists(pg_url) == (True, True) and env_file(root).exists()
    assert main(["remove", "tea-tour", "--purge"]) == 0
    assert exists(pg_url) == (False, False)
    assert not env_file(root).exists()
    assert exists(pg_url, "app_other_app") == (True, True)
    with admin(pg_url) as conn:
        assert conn.execute("SELECT count(*) FROM platform.installed_apps").fetchone() == (0,)
    assert main(["remove", "tea-tour", "--purge"]) == 0  # nothing left: still succeeds


def test_env_file_mode_600(root, pg_url):
    assert main(["prepare", app_dir(root)]) == 0
    path = env_file(root)
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    password = read_env_password(path)
    assert path.read_text(encoding="utf-8") == (
        f"DXOS_APP_DB_URL=postgresql://app_tea_tour:{password}@postgres:5432/agrimarket\n")
    with as_app(pg_url, password) as conn:
        assert conn.execute("SELECT current_user").fetchone() == ("app_tea_tour",)
    # A re-run keeps the password, so a running container's env file stays valid.
    assert main(["prepare", app_dir(root)]) == 0
    assert read_env_password(path) == password


def test_env_file_url_encodes_the_password(tmp_path):
    path = tmp_path / "x.env"
    write_env_file(path, "x-app", "a/b@c:d%")
    assert path.read_text(encoding="utf-8") == (
        "DXOS_APP_DB_URL=postgresql://app_x_app:a%2Fb%40c%3Ad%25@postgres:5432/agrimarket\n")
    assert read_env_password(path) == "a/b@c:d%"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_migration_cannot_escape_to_admin(root, pg_url):
    before = core_tables(pg_url)
    add_migration(root, "002_escape.sql", "RESET ROLE;\nCREATE TABLE public.x (htx_code text NOT NULL);\n")
    assert main(["prepare", app_dir(root)]) == 1
    assert core_tables(pg_url) == before
    assert exists(pg_url) == (False, False)


def test_migrations_run_as_the_app_role(root, pg_url):
    add_migration(root, "002_who.sql", "CREATE TABLE who (htx_code text NOT NULL, u text, s text);\n"
                                       "INSERT INTO who SELECT 'TC', current_user, session_user;\n")
    assert main(["prepare", app_dir(root)]) == 0
    with admin(pg_url) as conn:
        assert conn.execute("SELECT u, s FROM app_tea_tour.who").fetchall() == [("app_tea_tour", "app_tea_tour")]
        owners = conn.execute("SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'app_tea_tour'").fetchall()
        assert owners == [("app_tea_tour",)]


def test_commit_inside_a_migration_keeps_the_app_role(root, pg_url):
    before = core_tables(pg_url)
    add_migration(root, "002_commit.sql", "CREATE TABLE who (htx_code text NOT NULL, u text);\nCOMMIT;\n"
                                          "INSERT INTO who SELECT 'TC', current_user;\n"
                                          "CREATE TABLE later (htx_code text NOT NULL);\n")
    assert main(["prepare", app_dir(root)]) == 0
    with admin(pg_url) as conn:
        assert conn.execute("SELECT u FROM app_tea_tour.who").fetchall() == [("app_tea_tour",)]
        assert conn.execute("SELECT tableowner FROM pg_tables WHERE tablename = 'later'").fetchall() == [("app_tea_tour",)]
        applied = conn.execute("SELECT file FROM app_tea_tour.schema_migrations ORDER BY 1").fetchall()
        assert applied == [("001_tours.sql",), ("002_commit.sql",)]
    assert core_tables(pg_url) == before


def test_role_statements_never_carry_the_plain_password(root, pg_url):
    with admin(pg_url) as conn:
        for create in (True, False):
            text = database.role_password_statement(conn, "app_x", "plain-secret-42", create=create).as_string(conn)
            assert "plain-secret-42" not in text and "SCRAM-SHA-256$" in text
        password = ensure_app_database(conn, "tea-tour", MIGRATIONS)
        stored = conn.execute("SELECT rolpassword FROM pg_authid WHERE rolname = 'app_tea_tour'").fetchone()[0]
        assert stored.startswith("SCRAM-SHA-256$")
    with as_app(pg_url, password) as conn:  # the plain password still logs in
        assert conn.execute("SELECT current_user").fetchone() == ("app_tea_tour",)


def test_purge_after_default_privileges_drops_everything(root, pg_url):
    add_migration(root, "002_defacl.sql", "ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO PUBLIC;\n"
                                          "CREATE TABLE t (htx_code text NOT NULL);\n")
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["commit", "tea-tour"]) == 0
    assert main(["remove", "tea-tour", "--purge"]) == 0
    assert exists(pg_url) == (False, False)
    assert not env_file(root).exists()


@pytest.mark.parametrize("core_sql, name", [
    ("CREATE VIEW public.core_view AS SELECT * FROM app_tea_tour.tours", "public.core_view"),
    ("CREATE TABLE public.core_fk (tour int REFERENCES app_tea_tour.tours (id))", "public.core_fk"),
])
def test_purge_refuses_when_a_core_object_depends_on_the_app(root, pg_url, capsys, core_sql, name):
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["commit", "tea-tour"]) == 0
    with admin(pg_url) as conn:
        conn.execute(core_sql)
    try:
        capsys.readouterr()
        assert main(["remove", "tea-tour", "--purge"]) == 1
        assert name in capsys.readouterr().err
        assert exists(pg_url) == (True, True)  # nothing dropped
        assert env_file(root).exists()  # kept: the role still exists
        with admin(pg_url) as conn:
            assert conn.execute("SELECT count(*) FROM app_tea_tour.tours").fetchone() == (0,)
    finally:
        with admin(pg_url) as conn:
            conn.execute(f"DROP {'VIEW' if 'VIEW' in core_sql else 'TABLE'} IF EXISTS {name}")
    assert main(["remove", "tea-tour", "--purge"]) == 0
    assert exists(pg_url) == (False, False)
