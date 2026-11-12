# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import os
import shutil

import psycopg
import pytest

from dxos_cli import commands, store
from dxos_cli.__main__ import main

from conftest import FIXTURES


@pytest.fixture
def conn(root):
    with psycopg.connect(os.environ["DXOS_DB_URL"], autocommit=True) as c:
        yield c


def add_request(conn, app_id, htx, action="ENABLE", by="u1"):
    return str(conn.execute(
        "INSERT INTO platform.app_requests (app_id, htx_code, action, requested_by) VALUES (%s,%s,%s,%s) RETURNING id",
        (app_id, htx, action, by)).fetchone()[0])


def status_of(conn, job_id):
    return conn.execute("SELECT status, error FROM platform.app_requests WHERE id = %s", (job_id,)).fetchone()


def enabled(conn, app_id):
    return {r[0] for r in conn.execute("SELECT htx_code FROM platform.app_enablements WHERE app_id = %s", (app_id,))}


def seed_catalog(conn, *ids):
    for app_id in ids:
        conn.execute("INSERT INTO platform.app_catalog (id, name, version, license, publisher, menu, roles, has_public)"
                     " VALUES (%s, %s, '1.0.0', 'MIT', 'p', '[]', '{manager}', false)", (app_id, app_id))


def test_sync_catalog_upserts_and_skips_invalid(root, conn, capsys):
    shutil.copytree(FIXTURES / "invalid", root / "miniapps" / "bad")
    assert store.sync_catalog(conn, root / "miniapps", "1.9.0") == ["tea-tour"]
    assert "bad" in capsys.readouterr().err
    row = conn.execute("SELECT name, version, license, publisher, roles, has_public, menu FROM platform.app_catalog"
                       " WHERE id = 'tea-tour'").fetchone()
    assert row[:4] == ("Đặt tour đồi chè", "0.1.0", "MIT", "OpenTea Developers")
    assert row[4] == ["farmer", "manager", "officer"] and row[5] is True and len(row[6]) == 2
    conn.execute("UPDATE platform.app_catalog SET version = '0.0.1'")
    store.sync_catalog(conn, root / "miniapps", "1.9.0")
    assert conn.execute("SELECT version FROM platform.app_catalog").fetchone()[0] == "0.1.0"


def test_sync_keeps_installed_app_whose_dir_is_gone(root, conn):
    seed_catalog(conn, "gone", "kept")
    conn.execute("INSERT INTO platform.installed_apps (id, name, version, manifest) VALUES ('kept','k','1','{}')")
    store.sync_catalog(conn, root / "miniapps", "1.9.0")
    ids = {r[0] for r in conn.execute("SELECT id FROM platform.app_catalog")}
    assert ids == {"kept", "tea-tour"}


def test_claim_takes_oldest_one_at_a_time(root, conn):
    seed_catalog(conn, "hello")
    first, second = add_request(conn, "hello", "TC"), add_request(conn, "hello", "LB")
    with psycopg.connect(os.environ["DXOS_DB_URL"]) as c1, psycopg.connect(os.environ["DXOS_DB_URL"]) as c2:
        job1 = store.claim_next(c1)
        job2 = store.claim_next(c2)
    assert (job1.id, job2.id) == (first, second) and job1.htx_code == "TC"
    assert status_of(conn, first)[0] == "RUNNING"
    assert store.claim_next(conn) is None


def test_finish_enable_adds_enablement(root, conn):
    seed_catalog(conn, "hello")
    job_id = add_request(conn, "hello", "TC", by="mgr-1")
    assert store.finish(conn, job_id, True) == 1
    assert status_of(conn, job_id) == ("DONE", None)
    assert conn.execute("SELECT enabled_by FROM platform.app_enablements").fetchone()[0] == "mgr-1"


def test_finish_disable_returns_remaining(root, conn):
    for htx in ("TC", "LB"):
        conn.execute("INSERT INTO platform.app_enablements (app_id, htx_code, enabled_by) VALUES ('hello',%s,'x')", (htx,))
    assert store.finish(conn, add_request(conn, "hello", "TC", "DISABLE"), True) == 1
    assert store.finish(conn, add_request(conn, "hello", "LB", "DISABLE"), True) == 0
    assert enabled(conn, "hello") == set()


def test_finish_fail_records_error_and_changes_nothing(root, conn):
    job_id = add_request(conn, "hello", "TC")
    assert store.finish(conn, job_id, False, "x" * 400) == 0
    status, error = status_of(conn, job_id)
    assert status == "FAILED" and len(error) == 300
    assert enabled(conn, "hello") == set()
    assert conn.execute("SELECT finished_at IS NOT NULL FROM platform.app_requests").fetchone()[0]


def test_one_open_request_per_app_and_htx(root, conn):
    job_id = add_request(conn, "hello", "TC")
    with pytest.raises(psycopg.errors.UniqueViolation):
        add_request(conn, "hello", "TC", "DISABLE")
    store.finish(conn, job_id, True)
    add_request(conn, "hello", "TC", "DISABLE")  # allowed once the first is closed


def test_fail_stale_marks_running_failed(root, conn):
    seed_catalog(conn, "hello")
    job_id = add_request(conn, "hello", "TC")
    pending = add_request(conn, "hello", "LB")
    store.claim_next(conn)
    jobs = store.fail_stale(conn)
    assert [j.id for j in jobs] == [job_id] and jobs[0].action == "ENABLE"
    assert status_of(conn, job_id) == ("FAILED", "Trình cài đặt khởi động lại giữa chừng.")
    assert status_of(conn, pending)[0] == "PENDING"


def test_claim_fails_unknown_app(root, conn, capsys):
    seed_catalog(conn, "hello")
    bad = add_request(conn, "../x", "TC")
    ghost = add_request(conn, "ghost", "TC")
    good = add_request(conn, "hello", "TC")
    assert main(["worker-claim", "--wait", "0"]) == 0
    assert capsys.readouterr().out.strip() == f"{good}\tENABLE\thello\tTC\t0"
    for job_id in (bad, ghost):
        assert status_of(conn, job_id) == ("FAILED", "Ứng dụng không có trong kho.")


def test_commit_enables_for_all_by_default(root, conn):
    assert main(["prepare", str(root / "miniapps" / "tea-tour")]) == 0
    assert main(["commit", "tea-tour"]) == 0
    assert conn.execute("SELECT app_id, htx_code, enabled_by FROM platform.app_enablements").fetchall() == [
        ("tea-tour", "*", "dxos-cli")]


def test_commit_no_enable_all(root, conn):
    assert main(["prepare", str(root / "miniapps" / "tea-tour")]) == 0
    assert main(["commit", "tea-tour", "--no-enable-all"]) == 0
    assert enabled(conn, "tea-tour") == set()
    assert conn.execute("SELECT count(*) FROM platform.installed_apps").fetchone()[0] == 1


def test_remove_deletes_enablements(root, conn):
    assert main(["prepare", str(root / "miniapps" / "tea-tour")]) == 0
    assert main(["commit", "tea-tour"]) == 0
    conn.execute("INSERT INTO platform.app_enablements (app_id, htx_code, enabled_by) VALUES ('tea-tour','TC','x')")
    commands.remove(root, "tea-tour", False)
    assert enabled(conn, "tea-tour") == set()


def test_requests_and_enablements_are_audited(root, conn):
    before = conn.execute("SELECT count(*) FROM audit.events WHERE table_name IN ('app_requests','app_enablements')"
                          ).fetchone()[0]
    job_id = add_request(conn, "hello", "TC")
    store.finish(conn, job_id, True)
    after = conn.execute("SELECT count(*) FROM audit.events WHERE table_name IN ('app_requests','app_enablements')"
                         ).fetchone()[0]
    assert after - before == 3  # request insert, request update, enablement insert


def test_queued_enable_after_last_disable(root, conn):
    seed_catalog(conn, "hello")
    conn.execute("INSERT INTO platform.app_enablements (app_id, htx_code, enabled_by) VALUES ('hello','TC','x')")
    add_request(conn, "hello", "TC", "DISABLE")
    add_request(conn, "hello", "LB", "ENABLE")
    first = store.claim_next(conn)
    assert (first.action, first.htx_code) == ("DISABLE", "TC")
    assert store.finish(conn, first.id, True) == 0  # the worker would remove the container now
    second = store.claim_next(conn)
    assert (second.action, second.htx_code) == ("ENABLE", "LB")
    store.finish(conn, second.id, True)
    assert enabled(conn, "hello") == {"LB"}


def test_heartbeat_keeps_one_row(root, conn):
    store.heartbeat(conn)
    store.heartbeat(conn)
    assert conn.execute("SELECT count(*) FROM platform.app_worker").fetchone()[0] == 1
