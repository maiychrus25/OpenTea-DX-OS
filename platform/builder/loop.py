# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The host loop of the mini-app factory (plan M13, C6): `./dxos builder [--once]`. Standard library only.

For each approved request it runs, per round, three throwaway containers of the dxos-builder image: `build` (the coding tool,
only /work and the tool's own key, on an internal network behind the allowlist proxy), `gates` (no network, /work read-only,
the gate code from the image) and `review` (a second AI reads the code). The database is reached only through the `dxos-cli`
commands builder-start, builder-claim and builder-finish, plus one read of the approved spec.
"""
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

ROUNDS = 3
BUILD_TIMEOUT = 1800
DEFAULT_IMAGE = "opentea-dx-os/builder:local"
PROXY_URL = "http://dxos-builder-proxy:3128"
NO_KEY = "Chưa có khoá của công cụ viết mã"
HALTED = "Máy chủ dừng giữa chừng"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
APP_ID = re.compile(r"^gen-[a-z0-9-]{3,27}$")
HTX = re.compile(r"^[A-Z0-9_-]{1,20}$")
VERSION = re.compile(r"^\d+\.\d+\.\d+$")
TOOLS = {  # tool -> (key variable, other variables it may be given, default API host)
    "claude-code": ("ANTHROPIC_API_KEY", ("ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"), "api.anthropic.com"),
    "codex-cli": ("OPENAI_API_KEY", ("OPENAI_BASE_URL", "OPENAI_MODEL"), "api.openai.com"),
}
PROVIDER_ENV = {name for key, extra, _ in TOOLS.values() for name in (key, *extra)} | {"DXOS_BUILDER_TOOL", "DXOS_BUILDER_ALLOW_HOSTS"}


def log(message: str) -> None:
    print(f"{time.strftime('%F %T')} {message}", flush=True)


def load_provider_env(root: Path, environ: dict) -> dict:
    """The process environment plus the coding tools' own variables from docker/.env.local. Nothing else is taken from it."""
    merged = dict(environ)
    path = root / "docker" / ".env.local"
    if path.is_file():
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            name, sep, value = line.partition("=")
            name = name.strip()
            if sep and name in PROVIDER_ENV and not merged.get(name):
                merged[name] = value.strip().strip("'\"")
    return merged


def tool_of(environ: dict, provider: str) -> str:
    return environ.get("DXOS_BUILDER_TOOL") or provider


def review_tool_of(writer: str, environ: dict) -> str:
    """The provider other than the writer's when it has a key, else the same one (spec 12.5)."""
    if writer.startswith("replay:"):
        return writer
    other = next(t for t in TOOLS if t != writer)
    return other if environ.get(TOOLS[other][0]) else writer


def allow_hosts(environ: dict, tools: list[str]) -> str:
    """DXOS_BUILDER_ALLOW_HOSTS, or the API hosts of the configured tools (their base URL's host when one is set)."""
    if "DXOS_BUILDER_ALLOW_HOSTS" in environ:
        return environ["DXOS_BUILDER_ALLOW_HOSTS"]
    hosts = []
    for tool in tools:
        if tool in TOOLS:
            _, (base_var, _), default = TOOLS[tool]
            hosts.append(urlsplit(environ.get(base_var, "")).hostname or default)
    return ",".join(dict.fromkeys(hosts))


def container_env(tool: str, environ: dict) -> list[str]:
    """`-e NAME` pairs for a container that runs the tool. A bare name takes its value from the docker client's own
    environment, so no secret appears in an argument list."""
    names = ["HOME=/tmp/home", f"HTTPS_PROXY={PROXY_URL}", f"https_proxy={PROXY_URL}"]
    args = [a for n in names for a in ("-e", n)]
    if tool in TOOLS:
        key, extra, _ = TOOLS[tool]
        args += [a for n in (key, *extra) if environ.get(n) for a in ("-e", n)]
    return args


def hardening(memory: str, pids: int, tmp: str) -> list[str]:
    return ["--read-only", "--tmpfs", f"/tmp:exec,size={tmp}", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--memory", memory, "--pids-limit", str(pids)]


def build_argv(image: str, name: str, network: str, work: Path, tool: str, environ: dict, user: str) -> list[str]:
    """The `build` run (test 30): one bind mount, /work; the tool's key, base URL and model; HTTPS_PROXY; no Docker socket,
    no core env, no core network. /work/.git is an empty tmpfs: the host's repository is not reachable from there."""
    return ["docker", "run", "--rm", "--name", name, "--user", user, "--network", network, *hardening("4g", 512, "512m"),
            *container_env(tool, environ), "-v", f"{work}:/work", "--tmpfs", "/work/.git:size=1m", image, "build", tool]


def gates_argv(image: str, name: str, work: Path, input_dir: Path, out: Path) -> list[str]:
    return ["docker", "run", "--rm", "--name", name, "--user", "10001:10001", "--network", "none", *hardening("4g", 1024, "1g"),
            "--shm-size", "512m", "-e", "HOME=/tmp/home", "-v", f"{work}:/work:ro", "--tmpfs", "/work/.git:size=1m",
            "-v", f"{input_dir}:/input:ro", "-v", f"{out}:/out", image, "gates"]


def review_argv(image: str, name: str, network: str, work: Path, out: Path, tool: str, environ: dict) -> list[str]:
    return ["docker", "run", "--rm", "--name", name, "--user", "10001:10001", "--network", network, *hardening("2g", 512, "256m"),
            *container_env(tool, environ), "-v", f"{work}:/work:ro", "--tmpfs", "/work/.git:size=1m", "-v", f"{out}:/out",
            image, "review", tool]


def parse_claim(text: str) -> dict | None:
    """`request_id=… htx=… app_id=… version=… provider=… build_id=…` by key, or None for no claim or a line we do not trust."""
    fields = dict(part.split("=", 1) for part in text.split() if "=" in part)
    if not text.strip():
        return None
    ok = (UUID.match(fields.get("request_id", "")) and UUID.match(fields.get("build_id", "")) and HTX.match(fields.get("htx", ""))
          and APP_ID.match(fields.get("app_id", "")) and VERSION.match(fields.get("version", "")))
    if not ok:
        raise ValueError(f"builder-claim answered an unexpected line: {text.strip()[:200]}")
    return fields


def feedback_text(results: list[dict], logs: dict[str, str]) -> str:
    lines = ["# Cổng kiểm tra chưa qua", ""]
    for gate in results:
        if not gate["ok"]:
            lines += [f"## {gate['name']}", gate["detail_vi"], ""]
            if logs.get(gate["name"]):
                lines += ["```", logs[gate["name"]][-3000:], "```", ""]
    return "\n".join(lines)


def sanitize_workspace(work: Path) -> None:
    """Make the tree safe for the host's git and readable by the gates: no nested repository, no attributes that hide files."""
    for dirpath, dirnames, filenames in os.walk(work):
        for name in list(dirnames):
            if name == ".git" and Path(dirpath) != work:
                shutil.rmtree(Path(dirpath) / name, ignore_errors=True)
                dirnames.remove(name)
        for name in filenames:
            if name in (".gitattributes", ".gitmodules") or (name == ".git" and Path(dirpath) != work):
                (Path(dirpath) / name).unlink()
    subprocess.run(["chmod", "-R", "a+rX", str(work)], check=False)


class Builder:
    def __init__(self, root: Path, project: str = "docker", environ: dict | None = None, run=subprocess.run, sleep=time.sleep):
        self.root, self.project, self.run, self.sleep = root, project, run, sleep
        self.environ = load_provider_env(root, environ if environ is not None else dict(os.environ))
        self.image = self.environ.get("DXOS_BUILDER_IMAGE", DEFAULT_IMAGE)
        self.network = f"{project}_dxos-builder-net"
        self.runtime = root / "docker" / "runtime" / project
        self.user = f"{os.getuid()}:{os.getgid()}" if hasattr(os, "getuid") else "10001:10001"
        self.stop = False
        self.containers: list[str] = []

    # ── docker and the CLI ──
    def compose(self, *args: str, **kw) -> subprocess.CompletedProcess:
        return self.run(["docker", "compose", "-f", "docker/docker-compose.yml", *args], cwd=self.root, capture_output=True, text=True, **kw)

    def cli(self, *args: str) -> subprocess.CompletedProcess:
        return self.compose("--profile", "tools", "run", "--rm", "-T", "--user", self.user, "dxos-cli", *args)

    def docker(self, argv: list[str], timeout: int) -> subprocess.CompletedProcess:
        name = argv[argv.index("--name") + 1]
        self.containers.append(name)
        try:
            return self.run(argv, cwd=self.root, capture_output=True, text=True, timeout=timeout, env={**os.environ, **self.environ})
        except subprocess.TimeoutExpired:
            self.run(["docker", "rm", "-f", name], capture_output=True)
            return subprocess.CompletedProcess(argv, 124, "", "quá thời gian")
        finally:
            self.containers.remove(name)

    # ── the loop ──
    def start(self) -> None:
        """Recover from a host that stopped mid-build (Review Focus 2), then make the image and the proxy ready."""
        (self.runtime / "gateway" / "apps").mkdir(parents=True, exist_ok=True)
        (self.runtime / "apps").mkdir(parents=True, exist_ok=True)
        self.compose("--profile", "tools", "build", "--quiet", "dxos-cli")
        recovered = self.cli("builder-start")
        if recovered.returncode:
            raise RuntimeError("builder-start failed: " + recovered.stderr.strip()[:300])
        for line in recovered.stdout.splitlines():
            log(f"recovered: {line}")
        if self.run(["docker", "image", "inspect", self.image], capture_output=True).returncode:
            log(f"building the image {self.image}")
            built = self.run(["bash", "platform/builder/build-image.sh"], cwd=self.root, capture_output=True, text=True,
                             env={**os.environ, "DXOS_BUILDER_IMAGE": self.image})
            if built.returncode:
                raise RuntimeError("image build failed: " + built.stderr.strip()[-300:])

    def start_proxy(self, tools: list[str]) -> None:
        env = {**os.environ, "DXOS_BUILDER_IMAGE": self.image, "DXOS_BUILDER_ALLOW_HOSTS": allow_hosts(self.environ, tools)}
        up = self.run(["docker", "compose", "-f", "docker/docker-compose.yml", "--profile", "builder", "up", "-d", "dxos-builder-proxy"],
                      cwd=self.root, capture_output=True, text=True, env=env)
        if up.returncode:
            raise RuntimeError("proxy did not start: " + up.stderr.strip()[-300:])

    def stop_proxy(self) -> None:
        self.compose("--profile", "builder", "stop", "dxos-builder-proxy")

    def claim(self) -> dict | None:
        done = self.cli("builder-claim")
        if done.returncode:
            raise RuntimeError("builder-claim failed: " + done.stderr.strip()[:300])
        return parse_claim(done.stdout)

    def read_spec(self, request_id: str) -> dict:
        assert UUID.match(request_id)
        done = self.compose("exec", "-T", "postgres", "psql", "-U", "agrimarket", "-d", "agrimarket", "-tA", "-v", "ON_ERROR_STOP=1", "-c",
                            f"SELECT spec::text FROM platform.app_build_requests WHERE id = '{request_id}'")
        return json.loads(done.stdout.strip() or "{}") if done.returncode == 0 else {}

    def finish(self, build_id: str, status: str, out: Path, error_vi: str = "") -> None:
        container_dir = f"/repo/docker/runtime/{out.relative_to(self.runtime)}"  # dxos-cli mounts this project's runtime there
        done = self.cli("builder-finish", build_id, status, container_dir, *([error_vi] if error_vi else []))
        if done.returncode:
            raise RuntimeError("builder-finish failed: " + done.stderr.strip()[:300])
        log(f"build {build_id} {status}" + (f": {error_vi}" if error_vi else ""))

    # ── one request ──
    def git(self, work: Path, *args: str) -> subprocess.CompletedProcess:
        cmd = ["git", "-c", "user.name=dxos-builder", "-c", "user.email=builder@localhost", "-c", "commit.gpgsign=false",
               "-c", "core.hooksPath=/dev/null", "-C", str(work), *args]
        return self.run(cmd, capture_output=True, text=True)

    def process(self, claim: dict) -> str:
        """Run the rounds for one claimed request; returns `passed` or `failed`. The result is already recorded."""
        app_id, htx, version, build_id = claim["app_id"], claim["htx"], claim["version"], claim["build_id"]
        work = self.root / "generated-apps" / htx / app_id
        out = self.runtime / "builds" / build_id / "out"
        input_dir = self.runtime / "builds" / build_id / "input"
        for path in (work / ".dxos", input_dir):
            path.mkdir(parents=True, exist_ok=True)
        writer = tool_of(self.environ, claim.get("provider", ""))
        spec = self.read_spec(claim["request_id"])
        request = {"app_id": app_id, "htx": htx, "version": version, "spec": spec, "name": spec.get("name_vi", app_id),
                   "summary": spec.get("summary_vi", "")}
        (input_dir / "request.json").write_text(json.dumps(request, ensure_ascii=False), encoding="utf-8")
        (work / ".dxos" / "request.json").write_text(json.dumps(request, ensure_ascii=False), encoding="utf-8")
        (work / "SPEC.md").write_text(spec_markdown(spec), encoding="utf-8")
        if not (work / ".git").exists():
            self.git(work, "init", "-q")
            (work / ".git" / "info").mkdir(exist_ok=True)
            (work / ".git" / "info" / "exclude").write_text(".dxos/\n", encoding="utf-8")
        if writer in TOOLS and not self.environ.get(TOOLS[writer][0]):
            return self.fail(build_id, out, NO_KEY)
        reviewer = review_tool_of(writer, self.environ)
        feedback = work / ".dxos" / "feedback.md"
        feedback.unlink(missing_ok=True)
        results: list[dict] = []
        for number in range(1, ROUNDS + 1):
            tag = f"{build_id[:8]}-r{number}"
            built = self.docker(build_argv(self.image, f"dxos-builder-build-{tag}", self.network, work, writer, self.environ, self.user),
                                BUILD_TIMEOUT + 60)
            error_file = work / ".dxos" / "tool-error.txt"
            if built.returncode:
                reason = error_file.read_text(encoding="utf-8").strip() if error_file.is_file() else (built.stderr.strip().splitlines() or ["công cụ viết mã dừng"])[0]
                return self.fail(build_id, out, reason[:300])
            sanitize_workspace(work)
            shutil.rmtree(out, ignore_errors=True)
            out.mkdir(parents=True)
            os.chmod(out, 0o777)
            self.docker(gates_argv(self.image, f"dxos-builder-gates-{tag}", work, input_dir, out), 900)
            self.docker(review_argv(self.image, f"dxos-builder-review-{tag}", self.network, work, out, reviewer, self.environ), 960)
            results, logs = self.collect(out)
            (out / "spec.md").write_text((work / "SPEC.md").read_text(encoding="utf-8"), encoding="utf-8")
            (out / "gates.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
            if all(g["ok"] for g in results):
                self.commit_and_export(work, htx, app_id, version)
                self.finish(build_id, "passed", out)
                return "passed"
            log(f"{app_id} round {number}: failed gates: {', '.join(g['name'] for g in results if not g['ok'])}")
            feedback.write_text(feedback_text(results, logs), encoding="utf-8")
        first = next(g for g in results if not g["ok"])
        return self.fail(build_id, out, first["detail_vi"][:300], keep=True)

    def fail(self, build_id: str, out: Path, reason: str, keep: bool = False) -> str:
        if not keep:
            shutil.rmtree(out, ignore_errors=True)
            out.mkdir(parents=True)
            os.chmod(out, 0o777)
            (out / "gates.json").write_text("[]", encoding="utf-8")
        self.finish(build_id, "failed", out, reason)
        return "failed"

    def collect(self, out: Path) -> tuple[list[dict], dict[str, str]]:
        """The gates of the round: gates.json (a missing or broken one fails every gate), plus `review` when it found a high issue."""
        try:
            results = json.loads((out / "gates.json").read_text(encoding="utf-8"))
            ok = isinstance(results, list) and {g["name"] for g in results} >= {"manifest", "tests", "run"}
        except (OSError, ValueError, TypeError, KeyError):
            ok = False
        if not ok:
            results = [{"name": "gates", "ok": False, "detail_vi": "Không chạy được các cổng kiểm tra"}]
        logs = {p.stem: p.read_text(encoding="utf-8", errors="replace") for p in out.glob("*.log")}
        try:
            review = json.loads((out / "review.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            review = {"error": "Không rà soát được"}
        findings = review.get("findings")
        if not isinstance(findings, list):
            results.append({"name": "review", "ok": False, "detail_vi": f"Chưa rà soát được: {review.get('error', 'không rõ')}"[:300]})
        else:
            high = [f for f in findings if f.get("severity") == "high"]
            if high:
                logs["review"] = (out / "review.md").read_text(encoding="utf-8") if (out / "review.md").is_file() else ""
                results.append({"name": "review", "ok": False,
                                "detail_vi": f"Rà soát bảo mật thấy {len(high)} lỗi nặng: {high[0]['file']}: {high[0]['issue_vi']}"[:300]})
        return results, logs

    def commit_and_export(self, work: Path, htx: str, app_id: str, version: str) -> None:
        self.git(work, "add", "-A", "-f", "--", ".", ":(exclude).dxos")
        committed = self.git(work, "commit", "-q", "--allow-empty", "-m", f"{app_id} {version}")
        tagged = self.git(work, "tag", f"v{version}")
        if committed.returncode or tagged.returncode:
            raise RuntimeError("git: " + (committed.stderr + tagged.stderr).strip()[:300])
        target = self.runtime / "generated" / app_id / version
        shutil.rmtree(target, ignore_errors=True)
        target.mkdir(parents=True)
        archive = subprocess.Popen(["git", "-C", str(work), "archive", "--format=tar", f"v{version}"], stdout=subprocess.PIPE)
        untar = subprocess.run(["tar", "-x", "-C", str(target)], stdin=archive.stdout)
        archive.stdout.close()
        if archive.wait() or untar.returncode:
            raise RuntimeError("git archive failed")

    def forever(self, once: bool) -> int:
        signal.signal(signal.SIGTERM, lambda *_: setattr(self, "stop", True))
        signal.signal(signal.SIGINT, lambda *_: setattr(self, "stop", True))
        self.start()
        log(f"builder started (project {self.project}, image {self.image})")
        try:
            while not self.stop:
                claim = self.claim()
                if claim is None:
                    if once:
                        break
                    self.sleep(5)
                    continue
                writer = tool_of(self.environ, claim.get("provider", ""))
                self.start_proxy([writer, review_tool_of(writer, self.environ)])
                log(f"building {claim['app_id']} {claim['version']} for {claim['htx']} with {writer}")
                self.process(claim)
                if once:
                    break
        finally:
            for name in list(self.containers):
                self.run(["docker", "rm", "-f", name], capture_output=True)
            self.stop_proxy()
        log("builder stopped")
        return 0


def spec_markdown(spec: dict) -> str:
    """The approved spec as the one input of the coding step (spec 12.3)."""
    lines = [f"# {spec.get('name_vi', '')}", "", spec.get("summary_vi", ""), "", "## Vai trò"]
    lines += [f"- {r['role']}: {r['can_vi']}" for r in spec.get("roles", [])]
    lines += ["", "## Màn hình"] + [f"- `{s['path']}` {s['title_vi']}: {s['purpose_vi']}" for s in spec.get("screens", [])]
    lines += ["", "## Dữ liệu"]
    for table in spec.get("data", []):
        lines.append(f"- bảng `{table['table']}`")
        for field in table.get("fields", []):
            choices = f" ({', '.join(field['choices'])})" if field.get("choices") else ""
            lines.append(f"  - `{field['name']}` {field['type']}{choices}: {field['label_vi']}")
    lines += ["", "## Số liệu chỉ đọc cho trợ lý"] + [f"- `{r['name']}`: {r['description_vi']}" for r in spec.get("agent_reads", [])]
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    once = "--once" in argv[1:]
    if [a for a in argv[1:] if a != "--once"]:
        print("usage: loop.py [--once]", file=sys.stderr)
        return 2
    root = Path(__file__).resolve().parents[2]
    return Builder(root, os.environ.get("COMPOSE_PROJECT_NAME", "docker")).forever(once)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
