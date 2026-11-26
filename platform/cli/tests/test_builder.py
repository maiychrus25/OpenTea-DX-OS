# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""builder-start, builder-claim and builder-finish: the host loop's door to the app_build_* tables (M13, C6, C7)."""
import json
import os

import psycopg
import pytest
from psycopg.types.json import Jsonb

from dxos_cli import builder
from dxos_cli.__main__ import main

from conftest import FIXTURES
from test_store import make_generated_dir

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
GATES = ["manifest", "markup", "kit", "tests", "deps", "files", "run", "review"]
SPEC = {"app_id": "gen-tea-log"}


@pytest.fixture
def conn(root):
    with psycopg.connect(os.environ["DXOS_DB_URL"], autocommit=True) as c:
        c.execute("DELETE FROM platform.agent_settings WHERE agent = 'app-builder'")
        yield c
        c.execute("DELETE FROM platform.agent_settings WHERE agent = 'app-builder'")


def add_request(conn, status="spec_approved", htx="TC", app_id="gen-tea-log", spec=SPEC):
    return str(conn.execute(
        "INSERT INTO platform.app_build_requests (htx_code, requested_by, request_text, status, app_id, spec)"
        " VALUES (%s, 'u1', 'cần app theo dõi', %s, %s, %s) RETURNING id",
        (htx, status, app_id, Jsonb(spec) if spec else None)).fetchone()[0])


def claim_line(capsys):
    assert main(["builder-claim"]) == 0
    return capsys.readouterr().out.strip()


def fields(line):
    return dict(part.split("=", 1) for part in line.split())


def output_dir(tmp_path, gates=None, pngs=True, review=True, spec=True):
    out = tmp_path / "out"
    out.mkdir()
    (out / "gates.json").write_text(json.dumps(gates if gates is not None else
                                               [{"name": n, "ok": True, "detail_vi": "đạt"} for n in GATES]))
    if review:
        (out / "review.md").write_text("Không có phát hiện nghiêm trọng.")
    if spec:
        (out / "spec.md").write_text("# Đặc tả")
    if pngs:
        for name in ("desktop-light", "desktop-dark", "mobile-light", "mobile-dark"):
            (out / f"{name}.png").write_bytes(PNG)
    return out


def export(root, app_id="gen-tea-log", version="0.1.0"):
    return make_generated_dir(root, root / "docker" / "runtime" / "generated" / app_id / version, app_id, version)


def test_claim_prints_nothing_when_no_request_waits(root, conn, capsys):
    add_request(conn, status="spec_proposed")
    assert claim_line(capsys) == ""


def test_claim_takes_the_oldest_approved_request_and_opens_a_running_build(root, conn, capsys):
    first, second = add_request(conn), add_request(conn, htx="LB", app_id="gen-other")
    conn.execute("INSERT INTO platform.agent_settings (htx_code, agent, provider) VALUES ('TC', 'app-builder', 'anthropic')")
    got = fields(claim_line(capsys))
    assert {k: got[k] for k in ("request_id", "htx", "app_id", "version", "provider")} == {
        "request_id": first, "htx": "TC", "app_id": "gen-tea-log", "version": "0.1.0", "provider": "claude-code"}
    row = conn.execute("SELECT id::text, status, provider, rounds, finished_at FROM platform.app_builds WHERE request_id = %s", (first,)).fetchone()
    assert got["build_id"] == row[0] and row[1:] == ("running", "claude-code", 0, None)
    assert conn.execute("SELECT status FROM platform.app_build_requests WHERE id = %s", (first,)).fetchone()[0] == "building"
    assert conn.execute("SELECT status FROM platform.app_build_requests WHERE id = %s", (second,)).fetchone()[0] == "spec_approved"


@pytest.mark.parametrize("setting,tool", [("openai", "codex-cli"), ("ollama", "none"), (None, "none")])
def test_claim_names_the_coding_tool_from_the_cooperatives_provider(root, conn, capsys, setting, tool):
    if setting:
        conn.execute("INSERT INTO platform.agent_settings (htx_code, agent, provider) VALUES ('TC', 'app-builder', %s)", (setting,))
    add_request(conn)
    assert fields(claim_line(capsys))["provider"] == tool


def test_a_second_claim_does_not_take_a_request_being_built(root, conn, capsys):
    add_request(conn)
    assert claim_line(capsys) != ""
    assert claim_line(capsys) == ""


def test_start_fails_running_builds_and_their_requests(root, conn, capsys):
    """Review Focus 2: the host stopped mid-build; nothing is tagged and the request is closed."""
    add_request(conn)
    claim_line(capsys)
    waiting = add_request(conn, htx="LB", app_id="gen-other")
    assert main(["builder-start"]) == 0
    assert conn.execute("SELECT status, finished_at IS NOT NULL, git_tag FROM platform.app_builds").fetchone() == ("failed", True, None)
    status, error = conn.execute("SELECT status, error_vi FROM platform.app_build_requests WHERE htx_code = 'TC'").fetchone()
    assert (status, error) == ("failed", "Máy chủ dừng giữa chừng")
    assert conn.execute("SELECT status FROM platform.app_build_requests WHERE id = %s", (waiting,)).fetchone()[0] == "spec_approved"


def test_finish_passed_stores_the_files_lists_the_app_for_its_owner_and_closes_the_request(root, conn, capsys, tmp_path):
    request = add_request(conn)
    got = fields(claim_line(capsys))
    export(root)
    assert main(["builder-finish", got["build_id"], "passed", str(output_dir(tmp_path))]) == 0
    status, tag, gates, rounds = conn.execute("SELECT status, git_tag, gates, rounds FROM platform.app_builds").fetchone()
    assert (status, tag, len(gates)) == ("passed", "v0.1.0", len(GATES)) and rounds == 0
    assert conn.execute("SELECT status FROM platform.app_build_requests WHERE id = %s", (request,)).fetchone()[0] == "passed"
    names = {r[0]: r[1] for r in conn.execute("SELECT name, content_type FROM platform.app_build_files")}
    assert names == {"desktop-light.png": "image/png", "desktop-dark.png": "image/png", "mobile-light.png": "image/png",
                     "mobile-dark.png": "image/png", "review.md": "text/markdown", "spec.md": "text/markdown"}
    assert conn.execute("SELECT owner_htx, build_id::text, version FROM platform.app_catalog WHERE id = 'gen-tea-log'").fetchone() \
        == ("TC", got["build_id"], "0.1.0")


def test_finish_accepts_the_request_id_in_place_of_the_build_id(root, conn, capsys, tmp_path):
    got = fields((add_request(conn), claim_line(capsys))[1])
    export(root)
    assert main(["builder-finish", got["request_id"], "passed", str(output_dir(tmp_path))]) == 0
    assert conn.execute("SELECT status FROM platform.app_builds").fetchone()[0] == "passed"


def test_finish_passed_refuses_a_failing_gate_and_writes_nothing(root, conn, capsys, tmp_path):
    add_request(conn)
    got = fields(claim_line(capsys))
    export(root)
    gates = [{"name": "tests", "ok": False, "detail_vi": "một test đỏ"}]
    assert main(["builder-finish", got["build_id"], "passed", str(output_dir(tmp_path, gates=gates))]) == 1
    assert "tests" in capsys.readouterr().err
    assert conn.execute("SELECT status FROM platform.app_builds").fetchone()[0] == "running"  # test 26: no row, nothing listed
    assert conn.execute("SELECT count(*) FROM platform.app_catalog").fetchone()[0] == 0


@pytest.mark.parametrize("what", ["missing_png", "missing_review", "bad_png", "no_export", "wrong_id", "not_generated"])
def test_finish_passed_refuses_an_incomplete_or_wrong_export(root, conn, capsys, tmp_path, what):
    add_request(conn)
    got = fields(claim_line(capsys))
    out = output_dir(tmp_path, pngs=what != "missing_png", review=what != "missing_review")
    if what == "bad_png":
        (out / "desktop-light.png").write_bytes(b"not a png")
    if what == "wrong_id":
        export(root, "gen-other")
        os_rename = root / "docker" / "runtime" / "generated"
        (os_rename / "gen-other").rename(os_rename / "gen-tea-log")
    elif what == "not_generated":
        import yaml
        d = export(root)
        data = yaml.safe_load((d / "app.yaml").read_text())
        data["generated"] = False
        (d / "app.yaml").write_text(yaml.safe_dump(data))
    elif what != "no_export":
        export(root)
    assert main(["builder-finish", got["build_id"], "passed", str(out)]) == 1
    assert conn.execute("SELECT status FROM platform.app_builds").fetchone()[0] == "running"
    assert conn.execute("SELECT count(*) FROM platform.app_catalog").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM platform.app_build_files").fetchone()[0] == 0


def test_finish_passed_will_not_take_an_id_a_store_app_holds(root, conn, capsys, tmp_path):
    conn.execute("INSERT INTO platform.app_catalog (id, name, version, license, publisher, menu, roles, has_public)"
                 " VALUES ('gen-tea-log', 'x', '1.0.0', 'MIT', 'p', '[]', '{manager}', false)")
    add_request(conn)
    got = fields(claim_line(capsys))
    export(root)
    assert main(["builder-finish", got["build_id"], "passed", str(output_dir(tmp_path))]) == 1
    assert conn.execute("SELECT status FROM platform.app_builds").fetchone()[0] == "running"
    assert conn.execute("SELECT owner_htx FROM platform.app_catalog").fetchone()[0] is None


def test_finish_failed_keeps_what_exists_and_lists_nothing(root, conn, capsys, tmp_path):
    request = add_request(conn)
    got = fields(claim_line(capsys))
    gates = [{"name": "manifest", "ok": True, "detail_vi": "đạt"}, {"name": "markup", "ok": False, "detail_vi": "có thẻ script"}]
    out = output_dir(tmp_path, gates=gates, pngs=False)
    assert main(["builder-finish", got["build_id"], "failed", str(out)]) == 0
    assert conn.execute("SELECT status, git_tag, finished_at IS NOT NULL FROM platform.app_builds").fetchone() == ("failed", None, True)
    assert conn.execute("SELECT status, error_vi FROM platform.app_build_requests WHERE id = %s", (request,)).fetchone() == ("failed", "có thẻ script")
    assert {r[0] for r in conn.execute("SELECT name FROM platform.app_build_files")} == {"review.md", "spec.md"}
    assert conn.execute("SELECT count(*) FROM platform.app_catalog").fetchone()[0] == 0


def test_finish_failed_takes_the_error_text_from_the_caller(root, conn, capsys, tmp_path):
    request = add_request(conn)
    got = fields(claim_line(capsys))
    empty = tmp_path / "empty"
    empty.mkdir()
    assert main(["builder-finish", got["build_id"], "failed", str(empty), "Chưa có khoá của công cụ viết mã" + "!" * 400]) == 0
    status, error = conn.execute("SELECT status, error_vi FROM platform.app_build_requests WHERE id = %s", (request,)).fetchone()
    assert status == "failed" and error.startswith("Chưa có khoá") and len(error) == 300


def test_finish_twice_is_refused(root, conn, capsys, tmp_path):
    add_request(conn)
    got = fields(claim_line(capsys))
    empty = tmp_path / "empty"
    empty.mkdir()
    assert main(["builder-finish", got["build_id"], "failed", str(empty)]) == 0
    assert main(["builder-finish", got["build_id"], "failed", str(empty)]) == 1


def test_finish_reads_the_directory_through_the_runtime_mount(root, conn, capsys, tmp_path, monkeypatch):
    """The host path docker/runtime/<project>/x is /repo/docker/runtime/x inside dxos-cli."""
    add_request(conn)
    got = fields(claim_line(capsys))
    monkeypatch.setenv("DXOS_RUNTIME_SUBDIR", "dxos-clean")
    inside = root / "docker" / "runtime" / "builder" / "out"
    inside.mkdir(parents=True)
    (inside / "gates.json").write_text("[]")
    host_view = root / "docker" / "runtime" / "dxos-clean" / "builder" / "out"
    assert builder.container_path(root, host_view) == inside
