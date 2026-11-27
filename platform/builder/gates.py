# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The seven gates that check an AI-written mini-app (plan M13, C6). Runs in the `gates` container, from the image.

Nothing here is read from the workspace: the gate code, the allowed requirements, the kit and the manifest schema come from
/opt/dxos-gates, the request (app id, spec) comes from the read-only /input mount, and the workspace is only data. The tests
gate copies it to /tmp first, so a file the app writes never lands in /work (read-only anyway).
"""
import ast
import base64
import fnmatch
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from urllib.request import urlopen

GATE_NAMES = ("manifest", "markup", "kit", "tests", "deps", "files", "run")
HERE = Path(__file__).resolve().parent
GEN_ID = re.compile(r"^gen-[a-z0-9-]{3,27}$")
SKIP_DIRS = {".git", ".dxos", "__pycache__", ".pytest_cache", "node_modules"}
MAX_FILE_BYTES = 1_000_000
BASE_IMAGE = "python:3.12.15-slim-bookworm"  # the one image an app's Dockerfile may start from (the one hello uses)
VIEWPORTS = (("desktop", 1280, 800), ("mobile", 390, 844))
SCHEMES = ("light", "dark")
SCREENSHOT_NAMES = tuple(f"{v}-{s}.png" for v, _, _ in VIEWPORTS for s in SCHEMES)
SPDX_SUFFIXES = {".py", ".html", ".sql", ".yaml", ".yml", ".sh", ".css", ".j2", ".jinja"}
SPDX_NAMES = ("Dockerfile",)
KEY_SHAPES = (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"), re.compile(r"\bAKIA[0-9A-Z]{16}"),
              re.compile(r"-----BEGIN"), re.compile(r"\bxox[a-z]-[A-Za-z0-9-]{8,}"))
# Words that rewrite a pytest result or leave the harness; a test file has no use for them.
HARNESS_WORDS = ("dxos_report", "pytest_runtest_", "pytest_sessionfinish", "pytest_collection_modifyitems",
                 "pytest_terminal_summary", "_exit(", "TestClient.request", "DXOS_REPORT")


@dataclass
class Config:
    """Where the trusted material lives. In the image everything is under /opt/dxos-gates; tests point elsewhere."""
    cli_dir: Path = HERE / "cli"            # holds the dxos_cli package
    repo_root: Path = HERE / "repo"         # holds platform/apps/manifest.schema.json, platform/appkit, apps/web/package.json
    allowed: Path = HERE / "allowed-requirements.txt"
    wheels: Path = Path("/wheels")
    python: str = sys.executable


@dataclass
class Result:
    name: str
    ok: bool
    detail_vi: str
    log: str = ""

    def public(self) -> dict:
        return {"name": self.name, "ok": self.ok, "detail_vi": self.detail_vi}


@dataclass
class Context:
    work: Path
    request: dict
    config: Config
    out: Path
    scratch: Path = field(default_factory=lambda: Path(tempfile.mkdtemp(prefix="dxos-gates-")))
    _venv_error: Exception | None = None

    @property
    def app_id(self) -> str:
        return self.request["app_id"]

    @property
    def copy(self) -> Path:
        """A copy of the workspace to run code in: pytest and the app write files, /work stays untouched."""
        target = self.scratch / "work"
        if not target.exists():
            shutil.copytree(self.work, target, ignore=shutil.ignore_patterns(*SKIP_DIRS), symlinks=True)
        return target


def walk(root: Path):
    """Every file under root except the dirs that are not part of the app. Yields (path, relative path)."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            path = Path(dirpath) / name
            yield path, path.relative_to(root)


def requirement_key(line: str) -> str | None:
    """The comparable form of a requirements line (no comment, no spaces, lower case), or None for a blank line."""
    text = line.split("#", 1)[0].strip()
    return re.sub(r"\s+", "", text).lower() or None


def allowed_set(config: Config) -> frozenset[str]:
    return frozenset(k for k in map(requirement_key, config.allowed.read_text(encoding="utf-8").splitlines()) if k)


def run(cmd: list[str], *, cwd: Path | None = None, env: dict | None = None, timeout: int = 300) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, errors="replace")
    except subprocess.TimeoutExpired as exc:
        out = exc.stdout.decode(errors="replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        return subprocess.CompletedProcess(cmd, 124, out, f"quá {timeout} giây")


def tail(text: str, lines: int = 25) -> str:
    return "\n".join(text.strip().splitlines()[-lines:])


# ── manifest ────────────────────────────────────────────────────────────────

def gate_manifest(ctx: Context) -> Result:
    import yaml  # the image has it; a host without it fails this gate loudly, which is right
    problems = []
    manifest_path = ctx.work / "app.yaml"
    if not manifest_path.is_file():
        return Result("manifest", False, "Thiếu tệp app.yaml.")
    try:
        data = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    except yaml.YAMLError:
        return Result("manifest", False, "app.yaml không phải YAML hợp lệ.")
    data = data if isinstance(data, dict) else {}
    if data.get("id") != ctx.app_id:
        problems.append(f"id trong app.yaml phải là {ctx.app_id}")
    if not isinstance(data.get("id"), str) or not GEN_ID.match(data["id"]):
        problems.append("id của app do AI xây phải dạng gen-<tên> (chữ thường, số, gạch ngang)")
    if data.get("generated") is not True:
        problems.append("app.yaml phải có generated: true")
    if data.get("version") != ctx.request.get("version", data.get("version")):
        problems.append(f"version phải là {ctx.request['version']}")
    env = {"PATH": os.environ.get("PATH", ""), "PYTHONPATH": str(ctx.config.cli_dir), "DXOS_REPO_ROOT": str(ctx.config.repo_root),
           "PYTHONDONTWRITEBYTECODE": "1"}
    done = run([ctx.config.python, "-m", "dxos_cli", "validate", str(ctx.work)], env=env, timeout=60)
    log = (done.stdout + done.stderr).strip()
    if done.returncode:
        problems += [line.split(": ", 1)[-1] for line in done.stderr.strip().splitlines()[:3]]
    if problems:
        return Result("manifest", False, "; ".join(problems)[:300], log)
    return Result("manifest", True, "app.yaml hợp lệ.", log)


# ── markup ──────────────────────────────────────────────────────────────────

MARKUP_RULES = (
    (re.compile(r"<\s*script", re.I), "thẻ <script>"),
    (re.compile(r"<\s*style", re.I), "thẻ <style>"),
    (re.compile(r"""[\s"'/]style\s*=""", re.I), "thuộc tính style"),
    (re.compile(r"""[\s"'/]on[a-z]{3,}\s*=""", re.I), "thuộc tính sự kiện onXxx="),
    (re.compile(r"javascript\s*:", re.I), "liên kết javascript:"),
)
TEMPLATE_SUFFIXES = {".html", ".htm", ".j2", ".jinja", ".svg"}
SCRIPT_SUFFIXES = {".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx"}


def markup_problems(text: str) -> list[str]:
    return [label for rule, label in MARKUP_RULES if rule.search(text)]


def python_strings(source: str) -> list[str]:
    out = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            out.append(node.value)
    return out


def gate_markup(ctx: Context) -> Result:
    found = []
    for path, rel in walk(ctx.work):
        text = None
        if path.suffix.lower() in SCRIPT_SUFFIXES:
            found.append(f"{rel}: tệp JavaScript")
        elif path.suffix.lower() in TEMPLATE_SUFFIXES:
            text = path.read_text(encoding="utf-8", errors="replace")
            found += [f"{rel}: {label}" for label in markup_problems(text)]
        elif path.suffix == ".py":
            try:
                strings = python_strings(path.read_text(encoding="utf-8", errors="replace"))
            except SyntaxError:
                found.append(f"{rel}: Python không đọc được")
                continue
            for value in strings:
                # Prose may say "style = x"; only a string that holds a tag can set an attribute.
                labels = markup_problems(value) if "<" in value else ["liên kết javascript:"] * bool(MARKUP_RULES[4][0].search(value))
                found += [f"{rel}: {label}" for label in labels]
    found = sorted(set(found))
    if found:
        return Result("markup", False, "Không được có JavaScript hay style nội tuyến: " + "; ".join(found[:4])[:260], "\n".join(found))
    return Result("markup", True, "Không có JavaScript, <style> hay style nội tuyến.")


# ── kit ─────────────────────────────────────────────────────────────────────

def gate_kit(ctx: Context) -> Result:
    kit = ctx.config.repo_root / "platform" / "appkit"
    stale = []
    for path, rel in walk(ctx.work):
        if path.name in ("appkit.py", "kit.html"):
            if not path.is_file() or path.is_symlink() or path.read_bytes() != (kit / path.name).read_bytes():
                stale.append(str(rel))
    if stale:
        return Result("kit", False, "Bản kit khác bản gốc của nền tảng (không được sửa): " + ", ".join(stale))
    return Result("kit", True, "Các tệp kit giống hệt bản gốc.")


# ── deps ────────────────────────────────────────────────────────────────────

DOCKER_OK = {"ENV", "COPY", "WORKDIR", "USER", "EXPOSE", "CMD", "LABEL"}
PIP_LINE = re.compile(r"^RUN\s+pip\s+install\s+--no-cache-dir\s+-r\s+(\S+)\s*$")


def dockerfile_problems(text: str, root: Path) -> list[str]:
    problems = []
    for raw in text.replace("\\\n", " ").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        word = line.split(None, 1)[0].upper()
        if word == "FROM":
            if line.split()[1:] != [BASE_IMAGE]:
                problems.append(f"FROM phải là {BASE_IMAGE}")
        elif word == "RUN":
            match = PIP_LINE.match(line)
            if not match or not (root / match.group(1).lstrip("/").removeprefix("app/")).is_file():
                problems.append("RUN chỉ được là: pip install --no-cache-dir -r <tệp requirements của app>")
        elif word == "COPY":
            sources = [a for a in line.split()[1:-1] if not a.startswith("--chown")]
            if "--from" in line or any(a.startswith("/") or ".." in a or "://" in a for a in sources):
                problems.append("COPY không được lấy từ nơi khác hoặc ngoài thư mục app")
        elif word not in DOCKER_OK:
            problems.append(f"Dockerfile không được dùng {word}")
    return problems


def gate_deps(ctx: Context) -> Result:
    allowed = allowed_set(ctx.config)
    bad = []
    seen = 0
    for path, rel in walk(ctx.work):
        if not fnmatch.fnmatch(path.name, "requirements*.txt"):
            continue
        seen += 1
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            key = requirement_key(line)
            if key is None or key in allowed:
                continue
            if key.startswith("-r") and (path.parent / key[2:]).is_file() and ".." not in key:
                continue
            bad.append(f"{rel}: {line.split('#', 1)[0].strip()}")
    if not seen:
        bad.append("thiếu tệp requirements.txt")
    dockerfile = ctx.work / "Dockerfile"
    if not dockerfile.is_file():
        bad.append("thiếu Dockerfile")
    else:
        bad += [f"Dockerfile: {p}" for p in dockerfile_problems(dockerfile.read_text(encoding="utf-8", errors="replace"), ctx.work)]
    for name in ("pyproject.toml", "setup.py", "setup.cfg", "Pipfile", "package.json"):
        if (ctx.work / name).exists():
            bad.append(f"không dùng {name}")
    if bad:
        return Result("deps", False, "Chỉ dùng thư viện trong danh sách cho phép: " + "; ".join(bad[:3])[:260], "\n".join(bad))
    return Result("deps", True, "Mọi thư viện nằm trong danh sách cho phép.")


# ── files ───────────────────────────────────────────────────────────────────

def needs_spdx(path: Path) -> bool:
    return path.suffix in SPDX_SUFFIXES or path.name in SPDX_NAMES or fnmatch.fnmatch(path.name, "requirements*.txt")


def gate_files(ctx: Context) -> Result:
    bad = []
    for path, rel in walk(ctx.work):
        if path.is_symlink():
            bad.append(f"{rel}: liên kết tượng trưng")
            continue
        if fnmatch.fnmatch(path.name, ".env*"):
            bad.append(f"{rel}: tệp .env")
        size = path.stat().st_size
        if size > MAX_FILE_BYTES:
            bad.append(f"{rel}: lớn hơn 1 MB")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if needs_spdx(path) and "SPDX-License-Identifier" not in "\n".join(text.splitlines()[:6]):
            bad.append(f"{rel}: thiếu dòng SPDX")
        if any(shape.search(text) for shape in KEY_SHAPES):
            bad.append(f"{rel}: có chuỗi giống khoá bí mật")
    if bad:
        return Result("files", False, "Tệp không đạt: " + "; ".join(bad[:4])[:260], "\n".join(bad))
    return Result("files", True, "Có dòng SPDX, không có khoá, không có tệp .env hay tệp quá lớn.")


# ── a throwaway local PostgreSQL, the venv for the app's own requirements ────

def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def pg_bin(name: str) -> str:
    found = sorted(Path("/usr/lib/postgresql").glob(f"*/bin/{name}"))
    return str(found[-1]) if found else (shutil.which(name) or name)


@contextmanager
def local_postgres(scratch: Path):
    """Yield a superuser URL of a server in scratch, listening on loopback only, trust auth (nothing else can reach it)."""
    data, sock_dir, port = Path(tempfile.mkdtemp(prefix="pg-", dir=scratch)) / "data", scratch / "pgsock", free_port()
    sock_dir.mkdir(exist_ok=True)
    env = {"PATH": os.environ.get("PATH", ""), "LANG": "C.UTF-8", "HOME": str(scratch)}
    init = run([pg_bin("initdb"), "-D", str(data), "-U", "postgres", "--auth=trust", "-E", "UTF8"], env=env, timeout=120)
    if init.returncode:
        raise RuntimeError("initdb: " + tail(init.stderr, 5))
    options = f"-c listen_addresses=127.0.0.1 -p {port} -c unix_socket_directories={sock_dir} -c fsync=off -c max_connections=60"
    start = run([pg_bin("pg_ctl"), "-D", str(data), "-o", options, "-w", "-t", "60", "start", "-l", str(data / "log.txt")], env=env, timeout=90)
    if start.returncode:
        raise RuntimeError("pg_ctl start: " + tail(start.stderr + start.stdout, 5))
    try:
        yield f"postgresql://postgres@127.0.0.1:{port}/postgres"
    finally:
        run([pg_bin("pg_ctl"), "-D", str(data), "-m", "immediate", "stop"], env=env, timeout=60)


def make_venv(ctx: Context) -> Path:
    """A venv with the app's requirements, installed from the wheelhouse alone (no network in this container)."""
    venv = ctx.scratch / "venv"
    if ctx._venv_error:
        raise ctx._venv_error
    if (venv / "bin" / "python").exists():
        return venv
    try:
        made = run([ctx.config.python, "-m", "venv", str(venv)], timeout=120)
        if made.returncode:
            raise RuntimeError("venv: " + tail(made.stderr, 5))
        app = ctx.copy
        files = [f for f in ("requirements.txt", "requirements-dev.txt") if (app / f).is_file()]
        args = [arg for f in files for arg in ("-r", f)]
        if "requirements-dev.txt" not in files:
            args += ["pytest==9.1.1", "httpx2==2.16.0"]  # the gate's own needs; both are in the allowed list
        pip = run([str(venv / "bin" / "pip"), "install", "--no-index", "--find-links", str(ctx.config.wheels),
                   "--disable-pip-version-check", *args], cwd=app, timeout=300)
        if pip.returncode:
            raise RuntimeError("Không cài được thư viện từ kho cục bộ: " + tail(pip.stderr, 6))
    except Exception as exc:
        ctx._venv_error = exc
        raise
    return venv


# ── tests ───────────────────────────────────────────────────────────────────

def uncovered_routes(routes: list[dict], requests: list[dict], outcomes: dict[str, str]) -> list[str]:
    """Routes (method + path) that no passing test requested. A request counts only when its test's outcome is 'passed'."""
    seen = [(r["method"].upper(), r["path"]) for r in requests if outcomes.get(r["test"]) == "passed"]
    missing = []
    for route in routes:
        regex = re.compile(route["regex"])
        for method in route["methods"]:
            if not any(m == method.upper() and regex.fullmatch(p) for m, p in seen):
                missing.append(f"{method} {route['path']}")
    return sorted(set(missing))


def gate_tests(ctx: Context) -> Result:
    app = ctx.copy
    harness = []
    for path, rel in walk(app):
        if path.suffix == ".py" and (path.name == "conftest.py" or "test" in path.name or "tests" in rel.parts):
            text = path.read_text(encoding="utf-8", errors="replace")
            harness += [f"{rel}: {word}" for word in HARNESS_WORDS if word in text]
    if harness:
        return Result("tests", False, "Tệp test không được đụng tới cơ chế chấm kết quả: " + "; ".join(harness[:3]), "\n".join(harness))
    try:
        venv = make_venv(ctx)
    except RuntimeError as exc:
        return Result("tests", False, str(exc)[:300], str(exc))
    report = ctx.scratch / "report.json"
    with local_postgres(ctx.scratch) as admin_url:
        env = {"PATH": f"{venv / 'bin'}:{os.environ.get('PATH', '')}", "HOME": str(ctx.scratch), "PYTHONPATH": str(HERE),
               "PYTHONDONTWRITEBYTECODE": "1", "DXOS_TEST_DB_URL": admin_url, "DXOS_REPORT": str(report), "LANG": "C.UTF-8"}
        # -P: the workspace must not shadow pytest or the report plugin by sitting in the current directory.
        done = run([str(venv / "bin" / "python"), "-P", "-m", "pytest", "-p", "dxos_report", "-p", "no:cacheprovider", "-q"],
                   cwd=app, env=env, timeout=600)
    log = done.stdout + done.stderr
    try:
        data = json.loads(report.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return Result("tests", False, "Không chạy được test: " + tail(log, 3).replace("\n", " ")[:240], log)
    outcomes = {t["nodeid"]: t["outcome"] for t in data["tests"]}
    counts = {o: sum(1 for v in outcomes.values() if v == o) for o in set(outcomes.values())}
    if done.returncode or any(o != "passed" for o in outcomes.values()):
        bad = [f"{n} ({o})" for n, o in outcomes.items() if o != "passed"]
        return Result("tests", False, ("Test chưa xanh: " + "; ".join(bad[:3]) if bad else "pytest báo lỗi: " + tail(log, 2).replace("\n", " "))[:300], log)
    if not outcomes:
        return Result("tests", False, "App chưa có test nào.", log)
    missing = uncovered_routes(data["routes"], data["requests"], outcomes)
    if missing:
        return Result("tests", False, "Mỗi route cần ít nhất một test đã qua. Chưa có test cho: " + ", ".join(missing[:5]), log)
    return Result("tests", True, f"{counts.get('passed', 0)} test xanh, mọi route đều có test.", log)


# ── run ─────────────────────────────────────────────────────────────────────

def manager_token(htx: str = "TC") -> str:
    claims = {"sub": "gate-manager", "name": f"Quản trị {htx}", "htx_code": htx, "realm_access": {"roles": ["manager"]}}
    return "Bearer h." + base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=") + ".s"


def uvicorn_target(dockerfile: str) -> str | None:
    match = re.search(r"uvicorn\W+([A-Za-z_][\w.]*:[A-Za-z_]\w*)", dockerfile)
    return match.group(1) if match else None


def wait_for(url: str, seconds: int = 40) -> bool:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        try:
            with urlopen(url, timeout=2):
                return True
        except Exception:
            time.sleep(0.5)
    return False


def open_screens(port: int, app_id: str, screens: list[str], out: Path) -> list[str]:
    """Open every screen at both viewports and both schemes; return the problems, save the first screen's four shots."""
    from playwright.sync_api import sync_playwright  # in the image's system site-packages
    problems = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            for vname, width, height in VIEWPORTS:
                for scheme in SCHEMES:
                    context = browser.new_context(viewport={"width": width, "height": height}, color_scheme=scheme,
                                                  extra_http_headers={"Authorization": manager_token()})
                    page = context.new_page()
                    server_errors = []
                    page.on("response", lambda r, bag=server_errors: bag.append(f"{r.status} {r.url}") if r.status >= 500 else None)
                    for index, path in enumerate(screens):
                        label = f"{path} ({vname}, {scheme})"
                        response = page.goto(f"http://127.0.0.1:{port}{path}{'&' if '?' in path else '?'}theme={scheme}", wait_until="load")
                        if response is None or response.status >= 400:
                            problems.append(f"{label}: trả về {response.status if response else 'không có phản hồi'}")
                        if page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"):
                            problems.append(f"{label}: tràn ngang")
                        if index == 0:
                            page.screenshot(path=str(out / f"{vname}-{scheme}.png"))
                    problems += [f"{p.split(' ', 1)[1].replace(f'http://127.0.0.1:{port}', '')}: lỗi {p.split()[0]}" for p in server_errors]
                    context.close()
        finally:
            browser.close()
    return problems


def gate_run(ctx: Context) -> Result:
    screens = [s["path"] for s in ctx.request.get("spec", {}).get("screens", [])] or ["/"]
    app = ctx.copy
    sample = app / "sample_data.sql"
    if not sample.is_file():
        return Result("run", False, "Thiếu sample_data.sql (dữ liệu mẫu để chạy thử và chụp màn hình).")
    target = uvicorn_target((app / "Dockerfile").read_text(encoding="utf-8", errors="replace")) if (app / "Dockerfile").is_file() else None
    if not target:
        return Result("run", False, "Dockerfile phải chạy app bằng uvicorn <module>:<app>.")
    try:
        venv = make_venv(ctx)
    except RuntimeError as exc:
        return Result("run", False, str(exc)[:300], str(exc))
    sys.path.insert(0, str(ctx.config.cli_dir))
    import psycopg
    from psycopg.conninfo import make_conninfo
    from dxos_cli.database import ensure_app_database
    from dxos_cli.steps import InstallError
    import yaml
    manifest = yaml.safe_load((app / "app.yaml").read_text(encoding="utf-8")) or {}
    health = (manifest.get("runtime") or {}).get("health", "/healthz")
    migrations = app / ((manifest.get("database") or {}).get("migrations") or "migrations")
    with local_postgres(ctx.scratch) as admin_url:
        try:
            with psycopg.connect(admin_url, autocommit=True) as admin:
                password = ensure_app_database(admin, ctx.app_id, migrations)
        except InstallError as exc:
            return Result("run", False, f"Migration không chạy được: {exc}"[:300], str(exc))
        role = "app_" + ctx.app_id.replace("-", "_")
        app_url = make_conninfo(admin_url, user=role, password=password)
        try:
            with psycopg.connect(app_url, autocommit=True, options=f"-c search_path={role}") as conn:
                conn.execute(sample.read_text(encoding="utf-8"))
        except psycopg.Error as exc:
            return Result("run", False, f"sample_data.sql không nạp được: {str(exc).splitlines()[0]}"[:300], str(exc))
        port = free_port()
        env = {"PATH": f"{venv / 'bin'}:{os.environ.get('PATH', '')}", "HOME": str(ctx.scratch), "PYTHONPATH": str(app),
               "PYTHONDONTWRITEBYTECODE": "1", "DXOS_APP_DB_URL": app_url, "LANG": "C.UTF-8"}
        log_path = ctx.scratch / "uvicorn.log"
        with log_path.open("w") as log_file:
            server = subprocess.Popen([str(venv / "bin" / "python"), "-P", "-m", "uvicorn", target, "--host", "127.0.0.1", "--port", str(port),
                                       "--root-path", f"/apps/{ctx.app_id}", "--no-server-header"], cwd=app, env=env,
                                      stdout=log_file, stderr=subprocess.STDOUT)
            try:
                if not wait_for(f"http://127.0.0.1:{port}{health}"):
                    return Result("run", False, "App không khởi động hoặc /healthz không trả lời: " + tail(log_path.read_text(errors="replace"), 3).replace("\n", " ")[:200],
                                  log_path.read_text(errors="replace"))
                problems = open_screens(port, ctx.app_id, screens, ctx.out)
            finally:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
    log = log_path.read_text(errors="replace")
    if problems:
        return Result("run", False, "Chạy thử có lỗi: " + "; ".join(problems[:3])[:260], "\n".join(problems) + "\n" + log)
    return Result("run", True, f"Mở {len(screens)} màn hình ở 2 cỡ, sáng và tối: không lỗi 5xx, không tràn ngang.", log)


GATES = {"manifest": gate_manifest, "markup": gate_markup, "kit": gate_kit, "tests": gate_tests, "deps": gate_deps,
         "files": gate_files, "run": gate_run}


def run_all(work: Path, request: dict, out: Path, config: Config | None = None, only: tuple[str, ...] = GATE_NAMES) -> list[Result]:
    """Run the gates, all of them even after a failure (the next round needs every reason). A gate that crashes fails."""
    ctx = Context(work=work, request=request, config=config or Config(), out=out)
    out.mkdir(parents=True, exist_ok=True)
    results = []
    try:
        for name in only:
            try:
                results.append(GATES[name](ctx))
            except Exception as exc:  # noqa: BLE001 - a gate that crashes is a failed gate, never a skipped one
                results.append(Result(name, False, f"Cổng {name} gặp lỗi: {type(exc).__name__}: {str(exc)[:200]}", repr(exc)))
    finally:
        shutil.rmtree(ctx.scratch, ignore_errors=True)
    return results


def write_results(results: list[Result], out: Path) -> None:
    (out / "gates.json").write_text(json.dumps([r.public() for r in results], ensure_ascii=False, indent=1), encoding="utf-8")
    for r in results:
        if r.log:
            (out / f"{r.name}.log").write_text(r.log[-6000:], encoding="utf-8")
