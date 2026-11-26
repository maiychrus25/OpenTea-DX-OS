# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""App Store data layer (platform/postgres/init/06-app-store.sql): catalogue sync, request queue, enablement.

The web app inserts requests; `./dxos worker` claims them through the CLI and reports back with finish().
"""
import re
import sys
import uuid
from dataclasses import dataclass, replace
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

from dxos_cli.commands import APP_ID_RE
from dxos_cli.manifest import ManifestError, load_manifest, validate_manifest
from dxos_cli.store_assets import read_screenshot

STALE_MESSAGE = "Trình cài đặt khởi động lại giữa chừng."
UNKNOWN_MESSAGE = "Ứng dụng không có trong kho."
ERROR_LIMIT = 300
PHASES = ("prepare", "build", "register")
# A generated app installs only for the cooperative that asked, from a build that passed (spec 12.5, test 28).
REFUSED_MESSAGE = "Bản này chưa qua kiểm tra hoặc không thuộc HTX này"
VERSION_RE = re.compile(r"\d+\.\d+\.\d+")


@dataclass(frozen=True)
class Job:
    id: str
    action: str
    app_id: str
    htx_code: str
    installed: bool
    version: str | None = None  # set for a generated app: the export folder to install from


def sync_catalog(conn: psycopg.Connection, miniapps_dir: Path, core_version: str) -> list[str]:
    synced = []
    for app_dir in sorted(p for p in miniapps_dir.iterdir() if (p / "app.yaml").is_file()):
        try:
            manifest = load_manifest(app_dir)
            errors = validate_manifest(manifest, core_version, set())
            # The worker installs miniapps/<id>, so the directory must carry the manifest id.
            if not errors and manifest["id"] != app_dir.name:
                errors = [f"thư mục phải trùng id '{manifest['id']}' của manifest"]
        except ManifestError as exc:
            errors = [str(exc)]
        if not errors and manifest.get("generated") is True:
            errors = ["app do AI xây chỉ vào kho qua builder, không qua thư mục miniapps"]
        if errors:
            print(f"catalog-sync: bỏ qua {app_dir.name}: {'; '.join(errors)}", file=sys.stderr)
            continue
        if upsert_app(conn, manifest, app_dir):
            synced.append(manifest["id"])
    # An installed app keeps its card even when its directory is gone, so the store can still offer Gỡ.
    # A generated app (owner_htx) has no folder in miniapps/ at all: its card lives as long as its row does.
    conn.execute("DELETE FROM platform.app_catalog WHERE NOT (id = ANY(%s)) AND owner_htx IS NULL"
                 " AND id NOT IN (SELECT id FROM platform.installed_apps)", (synced,))
    return synced


def upsert_app(conn: psycopg.Connection, manifest: dict, app_dir: Path, owner_htx: str | None = None,
               build_id: str | None = None) -> bool:
    """One catalogue card from a manifest. False when a card of another owner already has that id: it is left as it is."""
    protected = manifest["routes"].get("protected", {})
    store_block = {k: v for k, v in manifest.get("store", {}).items() if k != "screenshots"}
    images = []
    for shot in manifest.get("store", {}).get("screenshots", []):
        try:
            images.append((read_screenshot(app_dir, shot["file"]), shot["caption"]))
        except ManifestError as exc:
            print(f"catalog-sync: bỏ qua ảnh {shot['file']} của {manifest['id']}: {exc}", file=sys.stderr)
    # One transaction per app: the card never shows the new text with the old screenshots.
    with conn.transaction():
        written = conn.execute(
            "INSERT INTO platform.app_catalog (id, name, version, description, license, publisher, menu, roles,"
            " has_public, store, requires_core, has_database, owner_htx, build_id, synced_at)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())"
            " ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, version = EXCLUDED.version,"
            " description = EXCLUDED.description, license = EXCLUDED.license, publisher = EXCLUDED.publisher,"
            " menu = EXCLUDED.menu, roles = EXCLUDED.roles, has_public = EXCLUDED.has_public,"
            " store = EXCLUDED.store, requires_core = EXCLUDED.requires_core,"
            " has_database = EXCLUDED.has_database, build_id = EXCLUDED.build_id, synced_at = now()"
            " WHERE platform.app_catalog.owner_htx IS NOT DISTINCT FROM EXCLUDED.owner_htx",
            (manifest["id"], manifest["name"], manifest["version"], manifest.get("description", ""),
             manifest["license"], manifest["publisher"], Jsonb(manifest.get("menu", [])),
             sorted({role for roles in protected.values() for role in roles}),
             bool(manifest["routes"].get("public")), Jsonb(store_block), manifest["requires"]["core"],
             "database" in manifest, owner_htx, build_id)).rowcount
        if not written:
            return False
        conn.execute("DELETE FROM platform.app_catalog_screenshots WHERE app_id = %s", (manifest["id"],))
        for position, (file, caption) in enumerate(images):
            conn.execute("INSERT INTO platform.app_catalog_screenshots (app_id, position, caption, content_type, bytes)"
                         " VALUES (%s, %s, %s, %s, %s)", (manifest["id"], position, caption, *file))
    return True


def claim_next(conn: psycopg.Connection) -> Job | None:
    with conn.transaction():
        row = conn.execute(
            "UPDATE platform.app_requests SET status = 'RUNNING', started_at = now() WHERE id = ("
            " SELECT id FROM platform.app_requests WHERE status = 'PENDING' ORDER BY created_at, id"
            " FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id, action, app_id, htx_code,"
            " EXISTS (SELECT 1 FROM platform.installed_apps a WHERE a.id = app_requests.app_id)").fetchone()
    return Job(str(row[0]), *row[1:]) if row else None


def claim_known(conn: psycopg.Connection) -> Job | None:
    """The next job whose app is in the catalogue; others are failed on the spot (an id is never trusted)."""
    while job := claim_next(conn):
        row = APP_ID_RE.fullmatch(job.app_id) and conn.execute(
            "SELECT owner_htx, build_id, version FROM platform.app_catalog WHERE id = %s", (job.app_id,)).fetchone()
        if row and row[0] is None:
            return job
        if row and generated_is_ready(conn, job, *row):
            return replace(job, version=row[2]) if job.action == "ENABLE" else job
        # A gen- id with no card is a build that never passed: the same refusal, not "not in the store".
        refused = row or (APP_ID_RE.fullmatch(job.app_id) and job.app_id.startswith("gen-"))
        finish(conn, job.id, False, REFUSED_MESSAGE if refused else UNKNOWN_MESSAGE)
    return None


def generated_is_ready(conn: psycopg.Connection, job: Job, owner_htx: str, build_id, version: str) -> bool:
    """Test 28, enforced again at claim time: the asking cooperative owns the app, its build passed, its spec was approved."""
    if job.action != "ENABLE":
        return True  # taking an app away needs no proof; the enablement row is the cooperative's own
    if owner_htx != job.htx_code or not VERSION_RE.fullmatch(version):
        return False
    return conn.execute(
        "SELECT 1 FROM platform.app_builds b JOIN platform.app_build_requests r ON r.id = b.request_id"
        " WHERE b.id = %s AND b.app_id = %s AND b.version = %s AND b.status = 'passed' AND r.htx_code = %s"
        " AND r.spec IS NOT NULL AND r.status IN ('passed', 'installed')",
        (build_id, job.app_id, version, job.htx_code)).fetchone() is not None


def finish(conn: psycopg.Connection, job_id: str, ok: bool, error: str | None = None) -> int:
    """Close a request and apply it; returns how many enablement rows the app has left."""
    with conn.transaction():
        row = conn.execute(
            "UPDATE platform.app_requests SET status = %s, error = %s, finished_at = now() WHERE id = %s"
            " RETURNING app_id, htx_code, action, requested_by",
            ("DONE" if ok else "FAILED", None if ok else (error or "")[:ERROR_LIMIT], job_id)).fetchone()
        if row is None:
            raise LookupError(f"không có yêu cầu {job_id}")
        app_id, htx_code, action, requested_by = row
        if ok and action == "ENABLE":
            conn.execute("INSERT INTO platform.app_enablements (app_id, htx_code, enabled_by) VALUES (%s, %s, %s)"
                         " ON CONFLICT (app_id, htx_code) DO NOTHING", (app_id, htx_code, requested_by))
        elif ok:
            conn.execute("DELETE FROM platform.app_enablements WHERE app_id = %s AND htx_code = %s",
                         (app_id, htx_code))
        return conn.execute("SELECT count(*) FROM platform.app_enablements WHERE app_id = %s", (app_id,)).fetchone()[0]


def set_phase(conn: psycopg.Connection, job_id: str, phase: str) -> bool:
    """Record which step of the install a RUNNING request is in; False when no RUNNING row matched."""
    if phase not in PHASES:
        raise ValueError(f"giai đoạn '{phase}' không hợp lệ")
    uuid.UUID(job_id)  # ValueError for anything else, before it reaches SQL
    return conn.execute("UPDATE platform.app_requests SET phase = %s WHERE id = %s AND status = 'RUNNING'",
                        (phase, job_id)).rowcount > 0


def fail_stale(conn: psycopg.Connection) -> list[Job]:
    with conn.transaction():
        rows = conn.execute(
            "UPDATE platform.app_requests SET status = 'FAILED', error = %s, finished_at = now()"
            " WHERE status = 'RUNNING' RETURNING id, action, app_id, htx_code,"
            " EXISTS (SELECT 1 FROM platform.installed_apps a WHERE a.id = app_requests.app_id)",
            (STALE_MESSAGE,)).fetchall()
    return [Job(str(r[0]), *r[1:]) for r in rows]


def heartbeat(conn: psycopg.Connection) -> None:
    conn.execute("INSERT INTO platform.app_worker (id, seen_at) VALUES (true, now())"
                 " ON CONFLICT (id) DO UPDATE SET seen_at = now()")
