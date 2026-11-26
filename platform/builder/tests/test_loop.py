# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The host loop with a fake Docker: the argument lists of the three containers, start-up recovery, the rounds and the tags."""
import json
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

BUILDER = Path(__file__).resolve().parents[1]
ROOT = BUILDER.parents[1]
sys.path.insert(0, str(BUILDER))
import entrypoint  # noqa: E402
import gates  # noqa: E402
import loop  # noqa: E402

CONFIG = gates.Config(cli_dir=ROOT / "platform" / "cli", repo_root=ROOT, allowed=BUILDER / "allowed-requirements.txt")
SPEC = {"app_id": "gen-fertiliser-stock", "name_vi": "Kho phân bón", "summary_vi": "Ghi nhập xuất.",
        "roles": [{"role": "manager", "can_vi": "Ghi"}], "screens": [{"path": "/", "title_vi": "Tồn", "purpose_vi": "Xem"}],
        "data": [], "agent_reads": []}
SECRETS = {"POSTGRES_PASSWORD": "pg-secret", "KEYCLOAK_ADMIN_PASSWORD": "kc-secret", "AUTH_SECRET": "auth-secret",
           "TELEGRAM_BOT_TOKEN": "tg-secret", "HASURA_GRAPHQL_ADMIN_SECRET": "hasura-secret", "DXOS_AGENT_CLIENT_SECRET": "agent-secret",
           "ANTHROPIC_API_KEY": "sk-anthropic-key", "OPENAI_API_KEY": "sk-openai-key"}
BAD_NAMES = ("DXOS_", "POSTGRES", "KEYCLOAK", "TELEGRAM", "AUTH_SECRET", "HASURA")


def claim_line(app_id="gen-fertiliser-stock") -> str:
    return f"request_id={uuid.uuid4()} htx=TC app_id={app_id} version=0.1.0 provider=claude-code build_id={uuid.uuid4()}\n"


class FakeDocker:
    """Answers docker and compose calls; git, tar and chmod run for real. `build` and `review` are what the containers would do."""

    def __init__(self, tmp_path, fixture="fertiliser-stock", review=None, build_error=None):
        self.calls, self.cli_calls, self.run_names = [], [], []
        self.fixture, self.review, self.build_error = fixture, review or {"findings": []}, build_error
        self.claims = []
        self.finished = []

    def __call__(self, argv, **kw):
        self.calls.append(argv)
        if argv[0] != "docker":
            if argv[0] == "bash":
                return subprocess.CompletedProcess(argv, 0, "", "")
            return subprocess.run(argv, **{k: v for k, v in kw.items() if k in ("capture_output", "text", "stdin", "stdout")})
        if argv[1] == "compose":
            return self.compose(argv)
        if argv[1] == "run":
            return self.container(argv)
        return subprocess.CompletedProcess(argv, 0, "", "")

    def compose(self, argv):
        if "dxos-cli" in argv and "run" in argv:
            sub = argv[argv.index("dxos-cli") + 1:]
            self.cli_calls.append(sub)
            if sub[0] == "builder-claim":
                return subprocess.CompletedProcess(argv, 0, self.claims.pop(0) if self.claims else "", "")
            if sub[0] == "builder-start":
                return subprocess.CompletedProcess(argv, 0, "build aaa failed\n", "")
            if sub[0] == "builder-finish":
                self.finished.append(sub)
        if "psql" in argv:
            return subprocess.CompletedProcess(argv, 0, json.dumps(SPEC), "")
        return subprocess.CompletedProcess(argv, 0, "", "")

    def mount(self, argv, target):
        spec = next(a for a in argv if a.endswith(f":{target}") or a.endswith(f":{target}:ro"))
        return Path(spec.rsplit(":", 2)[0] if spec.endswith(":ro") else spec.rsplit(":", 1)[0])

    def container(self, argv):
        self.run_names.append(argv[argv.index("--name") + 1])
        mode = argv[argv.index(loop.DEFAULT_IMAGE if loop.DEFAULT_IMAGE in argv else "docker-image") + 1] if False else None
        action = next(a for a in argv if a in ("build", "gates", "review"))
        work = self.mount(argv, "/work")
        if action == "build":
            if self.build_error:
                (work / ".dxos" / "tool-error.txt").write_text(self.build_error, encoding="utf-8")
                return subprocess.CompletedProcess(argv, 4, "", "boom")
            entrypoint.build(f"replay:{self.fixture}", work, replay=BUILDER / "replay")
        elif action == "gates":
            out = self.mount(argv, "/out")
            request = json.loads((self.mount(argv, "/input") / "request.json").read_text(encoding="utf-8"))
            results = gates.run_all(work, request, out, CONFIG, only=("manifest", "markup", "kit", "deps", "files"))
            results += [gates.Result("tests", True, "ok"), gates.Result("run", True, "ok")]
            gates.write_results(results, out)
        else:
            out = self.mount(argv, "/out")
            if "findings" in self.review:
                (out / "review.md").write_text("md", encoding="utf-8")
            (out / "review.json").write_text(json.dumps(self.review), encoding="utf-8")
        return subprocess.CompletedProcess(argv, 0, "", "")


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "docker").mkdir()
    return tmp_path


def make(repo, environ=None, **kw):
    fake = FakeDocker(repo, **kw)
    return loop.Builder(repo, "docker", environ if environ is not None else {"DXOS_BUILDER_TOOL": "replay:fertiliser-stock"}, run=fake), fake


# ── test 30: what each container is given ───────────────────────────────────

def test_the_build_run_has_one_mount_the_tools_key_and_no_core_secret():
    argv = loop.build_argv("img", "n", "docker_dxos-builder-net", Path("/repo/generated-apps/TC/gen-x"), "claude-code", SECRETS, "1000:1000")
    assert [a for a in argv if a == "-v"] == ["-v"] and f"{Path('/repo/generated-apps/TC/gen-x')}:/work" in argv
    names = [argv[i + 1].split("=")[0] for i, a in enumerate(argv) if a == "-e"]
    assert "ANTHROPIC_API_KEY" in names and "OPENAI_API_KEY" not in names
    assert {"HTTPS_PROXY", "https_proxy"} <= set(names)
    assert not [n for n in names if n.startswith(BAD_NAMES) or any(b in n for b in BAD_NAMES)]
    text = " ".join(argv)
    assert "docker.sock" not in text and not any(v in text for v in SECRETS.values())  # a bare -e NAME never carries the value
    assert argv[argv.index("--network") + 1] == "docker_dxos-builder-net" and "--privileged" not in argv
    assert argv[argv.index("--cap-drop") + 1] == "ALL" and "--read-only" in argv and argv[-2:] == ["build", "claude-code"]


def test_a_replay_build_run_gets_no_key_at_all():
    argv = loop.build_argv("img", "n", "net", Path("/w"), "replay:fertiliser-stock", SECRETS, "1000:1000")
    assert [argv[i + 1].split("=")[0] for i, a in enumerate(argv) if a == "-e"] == ["HOME", "HTTPS_PROXY", "https_proxy"]


def test_the_codex_run_gets_only_the_openai_variables():
    environ = {**SECRETS, "OPENAI_BASE_URL": "https://gw.example/v1", "OPENAI_MODEL": "m", "ANTHROPIC_MODEL": "x"}
    argv = loop.build_argv("img", "n", "net", Path("/w"), "codex-cli", environ, "1:1")
    assert {argv[i + 1] for i, a in enumerate(argv) if a == "-e"} >= {"OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL"}
    assert "ANTHROPIC_API_KEY" not in argv and "ANTHROPIC_MODEL" not in argv


def test_the_gates_run_has_no_network_a_read_only_workspace_and_no_key():
    argv = loop.gates_argv("img", "n", Path("/w"), Path("/in"), Path("/out"))
    assert argv[argv.index("--network") + 1] == "none" and "/w:/work:ro" in argv and "/in:/input:ro" in argv
    assert not [a for a in argv if "KEY" in a or "PROXY" in a] and argv[-1] == "gates"


def test_the_review_run_reads_the_workspace_read_only():
    argv = loop.review_argv("img", "n", "net", Path("/w"), Path("/out"), "codex-cli", SECRETS)
    assert "/w:/work:ro" in argv and "OPENAI_API_KEY" in argv and "ANTHROPIC_API_KEY" not in argv and argv[-2:] == ["review", "codex-cli"]


def test_env_file_gives_only_the_tools_variables(tmp_path):
    (tmp_path / "docker").mkdir()
    (tmp_path / "docker" / ".env.local").write_text("POSTGRES_PASSWORD=x\nANTHROPIC_API_KEY='sk-a'\nAUTH_SECRET=y\nOPENAI_MODEL=m\n", encoding="utf-8")
    merged = loop.load_provider_env(tmp_path, {"OPENAI_MODEL": "kept"})
    assert merged == {"OPENAI_MODEL": "kept", "ANTHROPIC_API_KEY": "sk-a"}


def test_allow_hosts_follow_the_configured_providers():
    assert loop.allow_hosts({}, ["claude-code", "codex-cli"]) == "api.anthropic.com,api.openai.com"
    assert loop.allow_hosts({"ANTHROPIC_BASE_URL": "https://gw.example:8443/x"}, ["claude-code", "claude-code"]) == "gw.example"
    assert loop.allow_hosts({}, ["replay:fertiliser-stock"]) == ""
    assert loop.allow_hosts({"DXOS_BUILDER_ALLOW_HOSTS": "a.test"}, ["claude-code"]) == "a.test"


def test_the_reviewer_is_the_other_provider_when_it_has_a_key():
    assert loop.review_tool_of("claude-code", {"OPENAI_API_KEY": "k"}) == "codex-cli"
    assert loop.review_tool_of("claude-code", {}) == "claude-code"
    assert loop.review_tool_of("replay:x", {"OPENAI_API_KEY": "k"}) == "replay:x"


def test_parse_claim_reads_by_key_and_refuses_odd_values():
    line = claim_line()
    got = loop.parse_claim(line)
    assert got["htx"] == "TC" and got["app_id"] == "gen-fertiliser-stock" and got["provider"] == "claude-code"
    assert loop.parse_claim("") is None
    assert loop.parse_claim(" ".join(reversed(line.split())))["version"] == "0.1.0"
    with pytest.raises(ValueError):
        loop.parse_claim(line.replace("gen-fertiliser-stock", "../../etc"))


# ── Review Focus 2: start-up recovery ───────────────────────────────────────

def test_start_recovers_running_builds_before_it_claims_anything(repo):
    builder, fake = make(repo)
    fake.claims = [""]
    assert builder.forever(once=True) == 0
    kinds = [c[0] for c in fake.cli_calls]
    assert kinds[:2] == ["builder-start", "builder-claim"] and kinds.count("builder-start") == 1
    assert not fake.run_names  # nothing was built


# ── the rounds ──────────────────────────────────────────────────────────────

def test_a_passing_build_commits_tags_exports_and_finishes(repo):
    builder, fake = make(repo)
    claim = loop.parse_claim(claim_line())
    assert builder.process(claim) == "passed"
    work = repo / "generated-apps" / "TC" / "gen-fertiliser-stock"
    tags = subprocess.run(["git", "-C", str(work), "tag"], capture_output=True, text=True).stdout.split()
    assert tags == ["v0.1.0"]
    export = repo / "docker" / "runtime" / "docker" / "generated" / "gen-fertiliser-stock" / "0.1.0"
    assert (export / "app.yaml").is_file() and (export / "fertiliser_stock" / "main.py").is_file() and not (export / ".dxos").exists()
    assert fake.finished[0][0] == "builder-finish" and fake.finished[0][2] == "passed"
    assert fake.finished[0][3] == f"/repo/docker/runtime/builds/{claim['build_id']}/out"
    out = repo / "docker" / "runtime" / "docker" / "builds" / claim["build_id"] / "out"
    assert all(g["ok"] for g in json.loads((out / "gates.json").read_text(encoding="utf-8")))
    assert (out / "spec.md").is_file() and (out / "review.md").is_file()
    assert len(fake.run_names) == 3  # one round: build, gates, review


@pytest.mark.parametrize("fixture, gate", [("with-script", "markup"), ("extra-dependency", "deps"), ("with-agent-actions", "manifest")])
def test_a_failing_fixture_gets_three_rounds_then_fails_with_the_first_failing_gate(repo, fixture, gate):
    builder, fake = make(repo, fixture=fixture)
    claim = loop.parse_claim(claim_line())
    assert builder.process(claim) == "failed"
    assert len(fake.run_names) == 9
    finish = fake.finished[0]
    out = repo / "docker" / "runtime" / "docker" / "builds" / claim["build_id"] / "out"
    first_failing = next(g for g in json.loads((out / "gates.json").read_text(encoding="utf-8")) if not g["ok"])
    assert finish[2] == "failed" and first_failing["name"] == gate and finish[4] == first_failing["detail_vi"][:300]
    work = repo / "generated-apps" / "TC" / "gen-fertiliser-stock"
    assert subprocess.run(["git", "-C", str(work), "tag"], capture_output=True, text=True).stdout == ""
    assert not (repo / "docker" / "runtime" / "docker" / "generated").exists()
    assert gate in (work / ".dxos" / "feedback.md").read_text(encoding="utf-8")


def test_a_workspace_that_plants_gates_cannot_pass(repo):
    builder, fake = make(repo, fixture="with-script")
    work = repo / "generated-apps" / "TC" / "gen-fertiliser-stock"
    original = fake.container

    def plant(argv):
        result = original(argv)
        if "build" in argv[-2:]:
            (work / "gates.py").write_text("RESULT = 'ok'\n", encoding="utf-8")
            (work / ".dxos" / "gates.json").write_text('[{"name":"markup","ok":true,"detail_vi":"ok"}]', encoding="utf-8")
        return result

    fake.container = plant
    assert builder.process(loop.parse_claim(claim_line())) == "failed"


def test_no_key_fails_at_once_without_starting_a_container(repo):
    builder, fake = make(repo, environ={})
    assert builder.process(loop.parse_claim(claim_line())) == "failed"
    assert not fake.run_names and fake.finished[0][2:3] == ["failed"] and fake.finished[0][-1] == loop.NO_KEY


def test_a_tool_that_refuses_fails_with_its_first_error_line_and_is_not_retried(repo):
    builder, fake = make(repo, build_error="Your credit balance is too low")
    assert builder.process(loop.parse_claim(claim_line())) == "failed"
    assert len(fake.run_names) == 1 and fake.finished[0][-1] == "Your credit balance is too low"


def test_a_high_review_finding_fails_the_review_gate(repo):
    review = {"findings": [{"severity": "high", "file": "fertiliser_stock/main.py", "line": 3, "issue_vi": "SQL ghép chuỗi"}]}
    builder, fake = make(repo, review=review)
    assert builder.process(loop.parse_claim(claim_line())) == "failed"
    assert len(fake.run_names) == 9 and "SQL ghép chuỗi" in fake.finished[0][-1]


def test_medium_findings_do_not_fail_and_an_unreadable_review_fails_closed(repo):
    medium = {"findings": [{"severity": "medium", "file": "a", "line": 1, "issue_vi": "x"}]}
    builder, _ = make(repo, review=medium)
    assert builder.process(loop.parse_claim(claim_line())) == "passed"
    builder2, fake2 = make(repo / "second", review={"error": "Không đọc được kết quả rà soát"})
    (repo / "second" / "docker").mkdir(parents=True)
    assert builder2.process(loop.parse_claim(claim_line())) == "failed" and "rà soát" in fake2.finished[0][-1]


def test_sanitize_removes_nested_repositories_and_attribute_files(tmp_path):
    (tmp_path / "sub" / ".git").mkdir(parents=True)
    (tmp_path / "sub" / ".git" / "config").write_text("x")
    (tmp_path / ".gitattributes").write_text("* export-ignore")
    (tmp_path / "keep.py").write_text("x")
    loop.sanitize_workspace(tmp_path)
    assert not (tmp_path / "sub" / ".git").exists() and not (tmp_path / ".gitattributes").exists() and (tmp_path / "keep.py").exists()


def test_the_spec_becomes_the_markdown_the_coding_step_reads():
    text = loop.spec_markdown(SPEC)
    assert text.startswith("# Kho phân bón") and "`/` Tồn: Xem" in text and "manager: Ghi" in text
