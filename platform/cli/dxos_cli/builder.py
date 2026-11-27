# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The mini-app builder's door to the database (spec 12, plan M13 C6/C7): claim an approved request, record the result.

`./dxos builder` runs on the host and writes here through the CLI, as the store worker does. It never calls the web.
"""
import json
import os
from dataclasses import dataclass
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

from dxos_cli import store
from dxos_cli.manifest import ManifestError, load_manifest, read_core_version, validate_manifest

STOPPED_MESSAGE = "Máy chủ dừng giữa chừng"
FIRST_VERSION = "0.1.0"
# The coding tool the cooperative's provider stands for; anything else (Ollama, none) cannot write code.
TOOLS = {"anthropic": "claude-code", "openai": "codex-cli"}
IMAGES = ("desktop-light.png", "desktop-dark.png", "mobile-light.png", "mobile-dark.png")
DOCUMENTS = ("review.md", "spec.md")
FILE_LIMIT = 5 * 1024 * 1024
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class BuilderError(Exception):
    pass


@dataclass(frozen=True)
class Claim:
    request_id: str
    htx: str
    app_id: str
    version: str
    provider: str
    build_id: str

    def line(self) -> str:
        # build_id comes last so a reader of the five documented keys is unaffected.
        return (f"request_id={self.request_id} htx={self.htx} app_id={self.app_id} version={self.version}"
                f" provider={self.provider} build_id={self.build_id}")


def container_path(root: Path, path: Path) -> Path:
    """The host's docker/runtime/<project>/x is /repo/docker/runtime/x in dxos-cli (the project folder is the mount)."""
    subdir = os.environ.get("DXOS_RUNTIME_SUBDIR", "")
    prefix = root / "docker" / "runtime" / subdir
    if subdir and not path.exists() and path.is_relative_to(prefix):
        return root / "docker" / "runtime" / path.relative_to(prefix)
    return path


def export_dir(root: Path, app_id: str, version: str) -> Path:
    return root / "docker" / "runtime" / "generated" / app_id / version


def start(conn: psycopg.Connection) -> int:
    """Review Focus 2: a build left running by a stopped host fails, its request is closed, and nothing is tagged."""
    with conn.transaction():
        conn.execute("UPDATE platform.app_builds SET status = 'failed', finished_at = now() WHERE status = 'running'")
        return conn.execute(
            "UPDATE platform.app_build_requests SET status = 'failed', error_vi = %s, updated_at = now()"
            " WHERE status = 'building'", (STOPPED_MESSAGE,)).rowcount


def claim(conn: psycopg.Connection) -> Claim | None:
    with conn.transaction():
        row = conn.execute(
            "UPDATE platform.app_build_requests SET status = 'building', updated_at = now() WHERE id = ("
            " SELECT id FROM platform.app_build_requests WHERE status = 'spec_approved'"
            " ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1)"
            " RETURNING id, htx_code, coalesce(app_id, spec->>'app_id')").fetchone()
        if row is None:
            return None
        request_id, htx, app_id = row
        provider = conn.execute("SELECT provider FROM platform.agent_settings WHERE htx_code = %s AND agent = 'app-builder'",
                                (htx,)).fetchone()
        tool = TOOLS.get(provider[0] if provider else "", "none")
        build_id = conn.execute(
            "INSERT INTO platform.app_builds (request_id, htx_code, app_id, version, provider)"
            " VALUES (%s, %s, %s, %s, %s) RETURNING id", (request_id, htx, app_id, FIRST_VERSION, tool)).fetchone()[0]
    return Claim(str(request_id), htx, app_id, FIRST_VERSION, tool, str(build_id))


def finish(conn: psycopg.Connection, root: Path, build_ref: str, result: str, directory: Path,
           error_vi: str | None = None) -> None:
    """Record a round-trip's end. `passed` lists the app for the requesting cooperative only; `failed` lists nothing."""
    directory = container_path(root, directory)
    gates = _read_gates(directory, required=result == "passed")  # a build that died early has no gate report
    with conn.transaction():
        build = conn.execute(
            "SELECT id, request_id, htx_code, app_id, version FROM platform.app_builds"
            " WHERE (id::text = %s OR (request_id::text = %s AND status = 'running')) AND status = 'running'"
            " ORDER BY started_at DESC LIMIT 1 FOR UPDATE", (build_ref, build_ref)).fetchone()
        if build is None:
            raise BuilderError(f"không có bản xây đang chạy '{build_ref}'")
        build_id, request_id, htx, app_id, version = build
        rounds = _read_rounds(directory)
        if result == "passed":
            _check_passed(root, gates, directory, app_id, version)
            files = [(name, "image/png" if name.endswith(".png") else "text/markdown", _read_file(directory, name))
                     for name in IMAGES + DOCUMENTS]
            manifest = load_manifest(export_dir(root, app_id, version))
            if not store.upsert_app(conn, manifest, export_dir(root, app_id, version), htx, str(build_id)):
                raise BuilderError(f"id '{app_id}' đã có trong kho của người khác")
            status, tag, error = "passed", f"v{version}", None
        else:
            files = [(name, "image/png" if name.endswith(".png") else "text/markdown", _read_file(directory, name))
                     for name in IMAGES + DOCUMENTS if (directory / name).is_file()]
            status, tag = "failed", None
            error = (error_vi or _first_failure(gates) or "Không xây được app.")[:store.ERROR_LIMIT]
        for name, content_type, data in files:
            conn.execute("INSERT INTO platform.app_build_files (build_id, name, content_type, bytes) VALUES (%s, %s, %s, %s)"
                         " ON CONFLICT (build_id, name) DO UPDATE SET content_type = EXCLUDED.content_type, bytes = EXCLUDED.bytes",
                         (build_id, name, content_type, data))
        conn.execute("UPDATE platform.app_builds SET status = %s, gates = %s, git_tag = %s, rounds = %s, finished_at = now()"
                     " WHERE id = %s", (status, Jsonb(gates), tag, rounds, build_id))
        conn.execute("UPDATE platform.app_build_requests SET status = %s, error_vi = %s, updated_at = now() WHERE id = %s",
                     (status, error, request_id))


def _read_gates(directory: Path, required: bool) -> list[dict]:
    if not required and not (directory / "gates.json").is_file():
        return []
    try:
        gates = json.loads((directory / "gates.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise BuilderError(f"không đọc được gates.json trong {directory}") from exc
    if not isinstance(gates, list) or not all(
            isinstance(g, dict) and isinstance(g.get("name"), str) and isinstance(g.get("ok"), bool) for g in gates):
        raise BuilderError("gates.json phải là danh sách {name, ok, detail_vi}")
    return [{"name": g["name"], "ok": g["ok"], "detail_vi": str(g.get("detail_vi", ""))} for g in gates]


def _read_rounds(directory: Path) -> int:
    try:
        return min(max(int((directory / "rounds").read_text().strip()), 0), 3)
    except (OSError, ValueError):
        return 0


def _first_failure(gates: list[dict]) -> str | None:
    return next((g["detail_vi"] for g in gates if not g["ok"] and g["detail_vi"]), None)


def _read_file(directory: Path, name: str) -> bytes:
    path = directory / name
    if path.is_symlink() or not path.is_file():
        raise BuilderError(f"thiếu tệp {name} trong {directory}")
    data = path.read_bytes()
    if len(data) > FILE_LIMIT:
        raise BuilderError(f"tệp {name} lớn hơn {FILE_LIMIT // 1024 // 1024} MB")
    if name.endswith(".png") and not data.startswith(PNG_MAGIC):
        raise BuilderError(f"tệp {name} không phải ảnh PNG")
    return data


def _check_passed(root: Path, gates: list[dict], directory: Path, app_id: str, version: str) -> None:
    failing = [g["name"] for g in gates if not g["ok"]]
    if not gates or failing:
        raise BuilderError("không thể ghi 'passed': cổng chưa qua: " + (", ".join(failing) or "không có cổng nào"))
    folder = export_dir(root, app_id, version)
    try:
        manifest = load_manifest(folder)
        errors = validate_manifest(manifest, read_core_version(root), set())
    except ManifestError as exc:
        raise BuilderError(f"bản xuất {folder} không đọc được: {exc}") from exc
    if errors:
        raise BuilderError("manifest của bản xuất không hợp lệ: " + "; ".join(errors))
    if manifest.get("id") != app_id or manifest.get("version") != version or manifest.get("generated") is not True:
        raise BuilderError(f"manifest của bản xuất phải có id '{app_id}', version '{version}' và generated: true")
