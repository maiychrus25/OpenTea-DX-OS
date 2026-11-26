# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The dxos-builder image's entrypoint (plan M13, C6): `build <tool>`, `gates` or `review <tool>`.

`build` runs the coding tool in /work. It has no DXOS_* variable and no database: only the tool's key, its base URL and model,
and HTTPS_PROXY. `gates` and `review` read /work read-only and write /out. The tool is `claude-code`, `codex-cli` or
`replay:<fixture>`, which copies a recorded app instead of calling a model (CI and the tests use it).
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = Path(os.environ.get("WORK_DIR", "/work"))  # an override for the tests; the build container never sets it
TURNS = 60
TIMEOUT_SECONDS = 1800
SEVERITIES = ("high", "medium", "low")
NO_KEY = "Chưa có khoá của công cụ viết mã"
KEY_ENV = {"claude-code": "ANTHROPIC_API_KEY", "codex-cli": "OPENAI_API_KEY"}
MODEL_ENV = {"claude-code": "ANTHROPIC_MODEL", "codex-cli": "OPENAI_MODEL"}
REPLAY_BASE = ".replay-base"


# ── the workspace ───────────────────────────────────────────────────────────

def set_top_level(text: str, key: str, value: str) -> str:
    """Set `key: value` at the top level of a YAML text, keeping everything else byte for byte."""
    line = f"{key}: {value}"
    pattern = re.compile(rf"^{re.escape(key)}:.*$", re.M)
    if pattern.search(text):
        return pattern.sub(lambda _: line, text, count=1)
    return text.rstrip("\n") + "\n" + line + "\n"


def enforce_manifest(work: Path, request: dict) -> None:
    """The builder, not the AI, decides the id, the version and `generated: true`."""
    path = work / "app.yaml"
    if path.is_file():
        text = path.read_text(encoding="utf-8")
        for key, value in (("id", request["app_id"]), ("version", request["version"]), ("generated", "true")):
            text = set_top_level(text, key, value)
        path.write_text(text, encoding="utf-8")


def scaffold(work: Path, request: dict, hello: Path = Path("/opt/hello"), kit: Path = Path("/opt/hello-kit")) -> None:
    """Round 1: the app starts as a copy of miniapps/hello with the kit beside it; files already in /work are kept."""
    for source in sorted(hello.rglob("*")):
        target = work / source.relative_to(hello)
        if source.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif not target.exists():
            shutil.copy2(source, target)
    for name in ("appkit.py", "kit.html"):
        if (kit / name).is_file() and not (work / "_kit" / name).exists():
            (work / "_kit").mkdir(exist_ok=True)
            shutil.copy2(kit / name, work / "_kit" / name)
    path = work / "app.yaml"
    if path.is_file() and not re.search(r"^generated:", path.read_text(encoding="utf-8"), re.M):
        text = path.read_text(encoding="utf-8")
        for key, value in (("name", request.get("name", request["app_id"])), ("description", request.get("summary", request["app_id"]))):
            text = set_top_level(text, key, json.dumps(value, ensure_ascii=False))
        path.write_text(text, encoding="utf-8")
    enforce_manifest(work, request)


def materialize_fixture(root: Path, name: str, dest: Path) -> None:
    """Copy a recorded app: the fixture it is based on (`.replay-base`) first, then its own files on top."""
    fixture = root / name
    if not fixture.is_dir():
        raise SystemExit(f"Không có bản ghi {name}")
    base = fixture / REPLAY_BASE
    if base.is_file():
        materialize_fixture(root, base.read_text(encoding="utf-8").strip(), dest)
    shutil.copytree(fixture, dest, dirs_exist_ok=True, ignore=shutil.ignore_patterns(REPLAY_BASE, "__pycache__", ".pytest_cache"))


def mount_points() -> list[str]:
    try:
        lines = Path("/proc/self/mountinfo").read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    return sorted({line.split()[4] for line in lines if len(line.split()) > 4})


def write_env_probe(work: Path) -> None:
    """What this container can see, for the tests that prove it sees no secret and no Docker socket (test 30)."""
    (work / ".dxos").mkdir(exist_ok=True)
    probe = {"env": sorted(os.environ), "mounts": mount_points(),
             "docker_socket": any(Path(p).exists() for p in ("/var/run/docker.sock", "/run/docker.sock"))}
    (work / ".dxos" / "env-probe.json").write_text(json.dumps(probe, indent=1), encoding="utf-8")


# ── the coding tool ─────────────────────────────────────────────────────────

def read_prompt(work: Path) -> str:
    text = (HERE / "prompt.md").read_text(encoding="utf-8")
    feedback = work / ".dxos" / "feedback.md"
    if feedback.is_file():
        text += "\n\n# Phản hồi của vòng trước (sửa các điểm này)\n\n" + feedback.read_text(encoding="utf-8")
    return text


def tool_command(tool: str, prompt: str) -> list[str]:
    model = os.environ.get(MODEL_ENV[tool], "")
    if tool == "claude-code":
        cmd = ["claude", "-p", prompt, "--max-turns", str(TURNS), "--output-format", "json", "--dangerously-skip-permissions"]
        return cmd + (["--model", model] if model else [])
    return ["codex", "exec", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "-C", str(WORK)] \
        + (["-m", model] if model else []) + [prompt]


def first_error_line(text: str) -> str:
    for line in text.splitlines():
        if line.strip():
            return line.strip()[:200]
    return "công cụ viết mã dừng không rõ lý do"


def run_tool(tool: str, prompt: str, work: Path, timeout: int = TIMEOUT_SECONDS) -> subprocess.CompletedProcess:
    return subprocess.run(tool_command(tool, prompt), cwd=work, capture_output=True, text=True, timeout=timeout, errors="replace")


def build(tool: str, work: Path = WORK, hello: Path = Path("/opt/hello"), kit: Path = Path("/opt/hello-kit"),
          replay: Path = Path("/opt/replay")) -> int:
    request = json.loads((work / ".dxos" / "request.json").read_text(encoding="utf-8"))
    error_file = work / ".dxos" / "tool-error.txt"
    error_file.unlink(missing_ok=True)
    if tool.startswith("replay:"):  # a recorded app is a whole app: it replaces the starter instead of building on it
        materialize_fixture(replay, tool.split(":", 1)[1], work)
        write_env_probe(work)
    elif tool in KEY_ENV:
        scaffold(work, request, hello, kit)
        if not os.environ.get(KEY_ENV[tool]):
            error_file.write_text(NO_KEY, encoding="utf-8")
            return 4
        try:
            done = run_tool(tool, read_prompt(work), work)
        except subprocess.TimeoutExpired:
            error_file.write_text("Công cụ viết mã chạy quá 30 phút", encoding="utf-8")
            return 4
        except OSError as exc:
            error_file.write_text(f"Không chạy được công cụ viết mã: {exc.strerror}", encoding="utf-8")
            return 4
        (work / ".dxos" / "tool-output.txt").write_text((done.stdout + done.stderr)[-20000:], encoding="utf-8")
        if done.returncode:
            error_file.write_text(first_error_line(done.stderr or done.stdout), encoding="utf-8")
            return 4
    else:
        raise SystemExit(f"Công cụ không hợp lệ: {tool}")
    enforce_manifest(work, request)
    return 0


# ── the second reader ───────────────────────────────────────────────────────

def parse_findings(text: str) -> list[dict] | None:
    """The findings of a reviewer's answer, or None when no `{"findings": [...]}` object can be read from it."""
    try:
        outer = json.loads(text)
        if isinstance(outer, dict) and isinstance(outer.get("result"), str):  # claude --output-format json wraps the answer
            text = outer["result"]
    except ValueError:
        pass
    decoder, start = json.JSONDecoder(), 0
    while (start := text.find("{", start)) != -1:
        try:
            data, end = decoder.raw_decode(text, start)
        except ValueError:
            start += 1
            continue
        if isinstance(data, dict) and isinstance(data.get("findings"), list):
            out = []
            for item in data["findings"]:
                if isinstance(item, dict) and item.get("severity") in SEVERITIES and isinstance(item.get("issue_vi"), str):
                    line = item.get("line")
                    out.append({"severity": item["severity"], "file": str(item.get("file", ""))[:200],
                                "line": line if isinstance(line, int) and not isinstance(line, bool) else 0,
                                "issue_vi": item["issue_vi"][:500]})
                else:
                    return None  # an item the gate cannot judge: fail closed
            return out
        start = end
    return None


def review_markdown(findings: list[dict], tool: str) -> str:
    lines = [f"# Báo cáo rà soát bảo mật ({tool})", ""]
    if not findings:
        return "\n".join(lines + ["Không phát hiện vấn đề nào."]) + "\n"
    lines += ["| Mức | Tệp | Dòng | Vấn đề |", "|---|---|---|---|"]
    lines += [f"| {f['severity']} | {f['file']} | {f['line']} | {f['issue_vi'].replace('|', '/')} |" for f in findings]
    return "\n".join(lines) + "\n"


def review(tool: str, work: Path = WORK, out: Path = Path("/out")) -> int:
    out.mkdir(parents=True, exist_ok=True)
    if tool.startswith("replay:"):
        findings = []
    elif tool in KEY_ENV:
        if not os.environ.get(KEY_ENV[tool]):
            (out / "review.json").write_text(json.dumps({"error": NO_KEY}), encoding="utf-8")
            return 0
        prompt = (HERE / "review-prompt.md").read_text(encoding="utf-8")
        try:
            done = run_tool(tool, prompt, work, timeout=900)
            findings = parse_findings(done.stdout) if not done.returncode else None
            error = first_error_line(done.stderr or done.stdout) if done.returncode else "Không đọc được kết quả rà soát"
        except (subprocess.TimeoutExpired, OSError):
            findings, error = None, "Công cụ rà soát không chạy được"
        if findings is None:
            (out / "review.json").write_text(json.dumps({"error": error}, ensure_ascii=False), encoding="utf-8")
            (out / "review.md").write_text(f"# Báo cáo rà soát bảo mật ({tool})\n\nChưa rà soát được: {error}\n", encoding="utf-8")
            return 0
    else:
        raise SystemExit(f"Công cụ không hợp lệ: {tool}")
    (out / "review.json").write_text(json.dumps({"findings": findings}, ensure_ascii=False), encoding="utf-8")
    (out / "review.md").write_text(review_markdown(findings, tool), encoding="utf-8")
    return 0


# ── the gates ───────────────────────────────────────────────────────────────

def gates(work: Path = WORK, input_dir: Path = Path("/input"), out: Path = Path("/out")) -> int:
    import gates as gate_module
    request = json.loads((input_dir / "request.json").read_text(encoding="utf-8"))
    results = gate_module.run_all(work, request, out)
    gate_module.write_results(results, out)
    return 0


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[1] == "gates":
        return gates()
    if len(argv) == 3 and argv[1] == "build":
        return build(argv[2])
    if len(argv) == 3 and argv[1] == "review":
        return review(argv[2])
    print("usage: entrypoint.py gates | build <tool> | review <tool>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
