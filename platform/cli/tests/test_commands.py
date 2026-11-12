# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import json
import os
from pathlib import Path

import psycopg
import yaml

from dxos_cli import commands
from dxos_cli.__main__ import main
from dxos_cli.compose import render_app_compose


def runtime_files(root):
    runtime = root / "docker" / "runtime"
    return {str(p.relative_to(runtime)): p.read_text(encoding="utf-8") for p in sorted(runtime.rglob("*")) if p.is_file()}


def gateway_text(root):
    return (root / "docker" / "runtime" / "gateway" / "apisix.yaml").read_text(encoding="utf-8")


def base_text(root):
    return (root / "platform" / "gateway" / "apisix.yaml").read_text(encoding="utf-8")


def app_dir(root):
    return str(root / "miniapps" / "tea-tour")


def root_db_url():
    return os.environ["DXOS_DB_URL"]


def test_prepare_twice_is_idempotent(root):
    assert main(["prepare", app_dir(root)]) == 0
    first = runtime_files(root)
    assert main(["prepare", app_dir(root)]) == 0
    assert runtime_files(root) == first
    assert set(first) == {"apps/tea-tour.pending.json", "apps/tea-tour.env", "apps/tea-tour.compose.yml",
                          "gateway/apps/tea-tour.yaml", "gateway/apisix.yaml"}
    journal = json.loads(first["apps/tea-tour.pending.json"])
    assert journal["completed"] == ["validate", "database", "gateway", "compose"]
    # Recorded before the first run created anything, and kept by the re-run that sees the new schema.
    assert journal["database"] == {"schema_existed": False, "role_existed": False}
    assert journal["manifest"]["id"] == "tea-tour"
    assert "app-tea-tour-public-1" in first["gateway/apisix.yaml"]
    manifest = journal["manifest"]
    assert yaml.safe_load(first["apps/tea-tour.compose.yml"]) == render_app_compose(manifest, Path("miniapps/tea-tour"))


def test_list_shows_installed_apps(root, capsys):
    assert main(["list"]) == 0
    assert "tea-tour" not in capsys.readouterr().out
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["commit", "tea-tour"]) == 0
    assert not (root / "docker" / "runtime" / "apps" / "tea-tour.pending.json").exists()
    capsys.readouterr()
    assert main(["list"]) == 0
    app_id, version, installed_at = capsys.readouterr().out.strip().split("\t")
    assert (app_id, version) == ("tea-tour", "0.1.0")
    assert installed_at.startswith("20")


def test_prepare_refuses_installed_app(root, capsys):
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["commit", "tea-tour"]) == 0
    capsys.readouterr()
    assert main(["prepare", app_dir(root)]) == 1
    assert "đã được cài" in capsys.readouterr().err


def test_failed_gateway_step_leaves_no_trace(root, capsys):
    # A foreign fragment makes sync_gateway refuse, so the gateway step fails after writing its own fragment.
    other = root / "docker" / "runtime" / "gateway" / "apps" / "other.yaml"
    other.parent.mkdir(parents=True)
    other.write_text("- {id: app-other-public-1, uri: /api/data/graphql}\n", encoding="utf-8")
    assert main(["prepare", app_dir(root)]) == 1
    assert "gateway" in capsys.readouterr().err
    assert set(runtime_files(root)) == {"gateway/apps/other.yaml"}


def test_abort_restores_the_gateway_file(root):
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["abort", "tea-tour"]) == 0
    assert runtime_files(root) == {"gateway/apisix.yaml": base_text(root)}
    assert main(["commit", "tea-tour"]) == 1


class FakeDatabaseStep:
    purged = []

    def __init__(self, root, app_id, manifest=None, app_dir=None):
        self.app_id = app_id
        self.name = "database"

    def apply(self):
        pass

    def undo(self):
        pass

    def purge(self):
        FakeDatabaseStep.purged.append(self.app_id)


def test_remove_keeps_schema_without_purge(root, monkeypatch, capsys):
    monkeypatch.setattr(commands, "DatabaseStep", FakeDatabaseStep)
    monkeypatch.setattr(FakeDatabaseStep, "purged", [])
    assert main(["prepare", app_dir(root)]) == 0
    assert main(["commit", "tea-tour"]) == 0
    assert main(["remove", "tea-tour"]) == 0
    assert FakeDatabaseStep.purged == []
    assert gateway_text(root) == base_text(root)
    assert runtime_files(root) == {"gateway/apisix.yaml": base_text(root)}
    capsys.readouterr()
    assert main(["list"]) == 0
    assert capsys.readouterr().out.strip() == "Chưa cài app nào"
    # Everything is already gone; --purge still succeeds and drops the data.
    assert main(["remove", "tea-tour", "--purge"]) == 0
    assert FakeDatabaseStep.purged == ["tea-tour"]


def test_commands_refuse_an_id_that_is_a_path(root, capsys):
    assert main(["abort", "../../etc"]) == 1
    assert "không hợp lệ" in capsys.readouterr().err


def test_abort_refuses_a_registered_app(root, capsys):
    assert main(["prepare", app_dir(root)]) == 0
    journal = root / "docker" / "runtime" / "apps" / "tea-tour.pending.json"
    saved = journal.read_text(encoding="utf-8")
    assert main(["commit", "tea-tour"]) == 0
    journal.write_text(saved, encoding="utf-8")  # as if commit wrote the row, then failed to delete the journal
    capsys.readouterr()
    assert main(["abort", "tea-tour"]) == 1
    assert "đã được đăng ký" in capsys.readouterr().err
    assert journal.exists()
    with psycopg.connect(root_db_url()) as conn:
        assert conn.execute("SELECT count(*) FROM pg_namespace WHERE nspname = 'app_tea_tour'").fetchone() == (1,)
    assert main(["remove", "tea-tour"]) == 0
    assert not journal.exists()


def test_remove_undoes_an_uncommitted_install(root):
    assert main(["prepare", app_dir(root)]) == 0
    with psycopg.connect(root_db_url()) as conn:
        assert conn.execute("SELECT count(*) FROM pg_roles WHERE rolname = 'app_tea_tour'").fetchone() == (1,)
    assert main(["remove", "tea-tour"]) == 0
    with psycopg.connect(root_db_url()) as conn:
        assert conn.execute("SELECT count(*) FROM pg_namespace WHERE nspname = 'app_tea_tour'").fetchone() == (0,)
        assert conn.execute("SELECT count(*) FROM pg_roles WHERE rolname = 'app_tea_tour'").fetchone() == (0,)
    assert runtime_files(root) == {"gateway/apisix.yaml": base_text(root)}


def test_remove_with_a_corrupt_journal(root, capsys):
    assert main(["prepare", app_dir(root)]) == 0
    (root / "docker" / "runtime" / "apps" / "tea-tour.pending.json").write_text("{torn", encoding="utf-8")
    capsys.readouterr()
    # Without the journal the CLI cannot tell what this install created, so the data stays and the error says why.
    assert main(["remove", "tea-tour"]) == 1
    assert "Nhật ký" in capsys.readouterr().err
    assert gateway_text(root) == base_text(root)
    with psycopg.connect(root_db_url()) as conn:
        assert conn.execute("SELECT count(*) FROM pg_roles WHERE rolname = 'app_tea_tour'").fetchone() == (1,)
    assert main(["remove", "tea-tour", "--purge"]) == 0  # --purge needs no journal
    assert runtime_files(root) == {"gateway/apisix.yaml": base_text(root)}
    with psycopg.connect(root_db_url()) as conn:
        assert conn.execute("SELECT count(*) FROM pg_roles WHERE rolname = 'app_tea_tour'").fetchone() == (0,)


def test_abort_undoes_a_crash_inside_the_database_step(root, monkeypatch):
    def crash(*args):
        raise KeyboardInterrupt  # not an Exception: no in-process undo runs, as with a killed process

    # The schema and role exist, the journal has the "database" entry, but the step is not recorded as completed.
    real = commands.database.write_env_file
    monkeypatch.setattr(commands.database, "write_env_file", crash)
    try:
        main(["prepare", app_dir(root)])
    except KeyboardInterrupt:
        pass
    monkeypatch.setattr(commands.database, "write_env_file", real)
    journal = json.loads((root / "docker" / "runtime" / "apps" / "tea-tour.pending.json").read_text(encoding="utf-8"))
    assert journal["completed"] == ["validate"] and "database" in journal
    assert main(["abort", "tea-tour"]) == 0
    with psycopg.connect(root_db_url()) as conn:
        assert conn.execute("SELECT count(*) FROM pg_namespace WHERE nspname = 'app_tea_tour'").fetchone() == (0,)
        assert conn.execute("SELECT count(*) FROM pg_roles WHERE rolname = 'app_tea_tour'").fetchone() == (0,)
    assert runtime_files(root) == {}  # the crash came before the gateway step, and abort removed the journal
