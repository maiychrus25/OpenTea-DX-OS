<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Tier 1b — Zero-Trust Edge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quarantine malicious user uploads automatically and keep a tamper-evident audit log of business-table changes, without changing `apps/web`.

**Architecture:** An `audit` schema in Postgres holds an append-only, SHA-256 hash-chained `audit.events` table fed by row triggers on 9 business tables, plus `audit.file_scans`. A new team-written service `dxos-scanner` (Python) polls the S3 buckets every 5 s, streams new objects to ClamAV `clamd`, and moves infected/unscannable objects to `dxos-quarantine`, recording each decision in the audit schema.

**Tech Stack:** PostgreSQL 16 (plpgsql, built-in `sha256()`), ClamAV `clamav/clamav-debian:1.4.6`, Python 3.12 (`python:3.12.15-slim-bookworm`), `minio==7.2.20`, `psycopg[binary]==3.3.6`, `pytest==9.1.1`, SeaweedFS S3, Bash smoke tests.

**Spec:** `docs/specs/2026-11-08-tier1b-zero-trust-edge-design.md`

## Global Constraints

- Do not modify tracked files under `apps/web/`.
- New files: `SPDX-License-Identifier: MIT` + `SPDX-FileCopyrightText: 2026 OpenTea Developers` in the file's comment syntax.
- English identifiers and commit messages; Conventional Commits; author `maiychrus25 <ninhkhuongpl7@gmail.com>`; no `Co-Authored-By`; never push without owner approval.
- Pinned versions exactly: `clamav/clamav-debian:1.4.6`, `python:3.12.15-slim-bookworm`, `minio==7.2.20`, `psycopg[binary]==3.3.6`, `pytest==9.1.1` (dev only).
- Audited tables exactly: `htx_profiles`, `households`, `parcels`, `parcel_crop_cycles`, `journal_entries`, `journal_activities`, `lots`, `lot_parcels`, `disease_reports`.
- Scanner defaults: `DXOS_SCAN_BUCKETS=agrimarket-docs,agrimarket-private`, `DXOS_QUARANTINE_BUCKET=dxos-quarantine`, `DXOS_SCAN_INTERVAL_SECONDS=5`, clamd `StreamMaxLength 50M`.
- Python tests run from `platform/scanner/` (`cd platform/scanner && python -m pytest tests`): running from the repo root lets the `platform/` directory shadow the stdlib `platform` module.
- The EICAR test string is never stored verbatim in the repo; scripts assemble it at runtime from two parts.
- Existing smoke sections and the 9 existing CI jobs stay unchanged and green.

## Review Focus

- **Object changes between list and scan** (deleted, or replaced with a new etag): the loop must skip a vanished object without crashing and rescan a replaced one — unit tests in Task 4.
- **Vietnamese and space-containing keys** (the app writes keys like `para/Archives/Lô hàng đã xuất/…`): quarantine copy/delete must handle them — smoke case in Task 4.
- **ClamAV down or still loading signatures**: nothing may be quarantined or marked scanned — unit test in Task 4.
- **Concurrent writes to audited tables**: the hash chain must not fork — smoke case in Task 2 (two parallel `psql` sessions, then `verify_chain()` is clean).
- **Re-running `platform-init`** on a database that already has the audit schema and triggers: no errors, no duplicate triggers — smoke case in Task 2.

---

### Task 1: Audit schema, hash chain and append-only guard

**Files:**
- Create: `platform/postgres/init/02-audit.sql`
- Modify: `docker/docker-compose.yml` (`platform-init` runs every `/init/*.sql` in name order; mount `../platform/postgres/init` at `/init:ro`; mount `02-audit.sql` into the `postgres` service's `/docker-entrypoint-initdb.d/` like `01-extensions.sql`)
- Modify: `platform/tests/smoke-platform.sh` (new section `[audit]` after `[data]`)

**Interfaces:**
- Produces (SQL, all in schema `audit`):
  - tables `audit.events` and `audit.file_scans` exactly as spec §5.1;
  - `audit.append_event(p_source text, p_table text, p_op text, p_row_id text, p_actor text, p_old jsonb, p_new jsonb) returns bigint` — takes `pg_advisory_xact_lock(hashtext('audit.events'))`, reads the last `hash` (or 32 zero bytes), assigns `id` from the sequence, computes `hash` per spec §5.2, inserts, returns `id`;
  - `audit.record_event(p_source text, p_op text, p_subject text, p_details jsonb) returns bigint` — `append_event(p_source, NULL, p_op, p_subject, <actor>, NULL, p_details)`;
  - `audit.current_actor() returns text` = `coalesce(nullif(current_setting('dxos.actor', true), ''), session_user)`;
  - `audit.verify_chain() returns table(checked bigint, first_bad_id bigint)`;
  - triggers `dxos_audit_append_only` (BEFORE UPDATE OR DELETE, row) and `dxos_audit_no_truncate` (BEFORE TRUNCATE, statement) on `audit.events`, raising `audit.events is append-only`.
- Canonical string (exact): `concat_ws(chr(31), id::text, to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), source, coalesce(table_name,''), op, coalesce(row_id,''), actor, coalesce(old_data::text,''), coalesce(new_data::text,''))`; `hash = sha256(prev_hash || convert_to(<canonical>, 'UTF8'))`.

- [ ] **Step 1: Write the failing smoke checks** in `[audit]`:
  - `select audit.record_event('smoke','PING','smoke/ping','{"n":1}'::jsonb)` returns an id; `select first_bad_id is null from audit.verify_chain()` → `t`.
  - `update audit.events set actor='x' where id=<that id>` fails with output containing `append-only`; same for `delete from audit.events where id=<id>` and `truncate audit.events`.
  - Tamper detection inside one transaction: `BEGIN; ALTER TABLE audit.events DISABLE TRIGGER dxos_audit_append_only; UPDATE audit.events SET actor='tampered' WHERE id=<id>; SELECT first_bad_id FROM audit.verify_chain(); ROLLBACK;` → the selected value equals `<id>`; after the rollback `verify_chain()` is clean again.
  - Run `platform-init` twice; both exit 0.
- [ ] **Step 2: Run to verify it fails** — `make platform-up && make platform-smoke` → FAIL in `[audit]` (`schema "audit" does not exist`).
- [ ] **Step 3: Implement `02-audit.sql`** (idempotent: `CREATE SCHEMA IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `CREATE OR REPLACE TRIGGER`) and the compose changes.
- [ ] **Step 4: Verify** — `make platform-smoke` → all sections PASS; `docker compose -f docker/docker-compose.yml config -q` exits 0.
- [ ] **Step 5: Commit** — `feat(platform): add hash-chained append-only audit schema`

---

### Task 2: Row triggers on business tables and deploy order

**Files:**
- Create: `platform/postgres/init/03-audit-triggers.sql`
- Modify: `docker/docker-compose.yml` (mount `03-audit-triggers.sql` into `postgres` init like the others)
- Modify: `platform/tests/smoke-platform.sh` (`[data]` runs `platform-init` again right after `prisma migrate deploy` and before loading the fixture; `[audit]` gains the checks below)

**Interfaces:**
- Consumes: `audit.append_event`, `audit.current_actor`, `audit.verify_chain` (Task 1).
- Produces: trigger function `audit.capture_row() returns trigger` (AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW: `op = TG_OP`, `row_id = coalesce(NEW.id, OLD.id)::text`, `old_data = to_jsonb(OLD)` for UPDATE/DELETE, `new_data = to_jsonb(NEW)` for INSERT/UPDATE, `actor = audit.current_actor()`, `source = 'db'`); trigger named `dxos_audit_row` on each audited table that exists (`to_regclass('public.<t>') IS NOT NULL`), created with `CREATE OR REPLACE TRIGGER`.

- [ ] **Step 1: Write the failing smoke checks** in `[audit]`:
  - After the fixture load: `select count(*) from audit.events where table_name='households' and op='INSERT' and row_id='hh_tc_1'` ≥ 1.
  - `update households set address='Smoke street' where id='hh_tc_2'` → exactly one new `UPDATE` event for `hh_tc_2` whose `new_data->>'address'` is `Smoke street`.
  - Per audited table: `select count(*) from pg_trigger where tgname='dxos_audit_row' and tgrelid='public.<t>'::regclass` = `1` (after `platform-init` has run twice).
  - Concurrency: two background `psql` sessions each run 20 single-row `update households set address=... where id='hh_tc_1'` statements, `wait`, then `verify_chain()` has `first_bad_id IS NULL` and the `id` order equals the `prev_hash` linkage.
  - Non-audited table: an insert into `market_data` (fixture-safe row) creates no event.
- [ ] **Step 2: Run to verify it fails** — `make platform-smoke` → FAIL in `[audit]` (no `INSERT` events).
- [ ] **Step 3: Implement `03-audit-triggers.sql`** (a `DO` block over the 9 table names) and the smoke ordering change.
- [ ] **Step 4: Verify** — `make platform-smoke` twice in a row → all PASS both times.
- [ ] **Step 5: Commit** — `feat(platform): audit row changes on business tables`

---

### Task 3: clamd client and scan decision (pure Python, unit-tested)

**Files:**
- Create: `platform/scanner/dxos_scanner/__init__.py`, `platform/scanner/dxos_scanner/clamd.py`, `platform/scanner/dxos_scanner/decision.py`
- Create: `platform/scanner/requirements.txt` (`minio==7.2.20`, `psycopg[binary]==3.3.6`), `platform/scanner/requirements-dev.txt` (`-r requirements.txt`, `pytest==9.1.1`)
- Test: `platform/scanner/tests/test_clamd.py`, `platform/scanner/tests/test_decision.py`

**Interfaces:**
- Produces:
  - `ScanResult` (frozen dataclass): `status: Literal["clean", "infected", "unscannable"]`, `signature: str | None`.
  - `class ClamdUnavailable(Exception)` — raised on connect/send/recv failure or timeout (infrastructure error, never a file verdict).
  - `parse_response(raw: bytes) -> ScanResult` — `b"stream: OK"` → clean; `b"stream: <sig> FOUND"` → infected with `<sig>`; `b"INSTREAM size limit exceeded. ERROR"` or any other `… ERROR` → unscannable (signature = the message); trailing `\0`/`\n` stripped; anything else → raises `ValueError`.
  - `scan_stream(host: str, port: int, chunks: Iterable[bytes], timeout: float = 30.0) -> ScanResult` — sends `b"zINSTREAM\0"`, then each chunk as 4-byte big-endian length + data (chunks re-split to ≤ 64 KiB), then `b"\0\0\0\0"`; reads until `\0`; returns `parse_response(...)`.
  - `class Action(Enum)`: `KEEP`, `QUARANTINE`; `decide(result: ScanResult) -> Action` — clean → KEEP; infected/unscannable → QUARANTINE.

- [ ] **Step 1: Write failing tests**:
  - `test_parse_ok`, `test_parse_found` (`b"stream: Win.Test.EICAR_HDB-1 FOUND\0"` → infected, signature `Win.Test.EICAR_HDB-1`), `test_parse_size_limit` (→ unscannable), `test_parse_error` (`b"stream: lstat() failed ERROR"` → unscannable), `test_parse_garbage_raises`.
  - `test_scan_stream_protocol`: a fake clamd (`socketserver.TCPServer` on `127.0.0.1:0` in a thread) records the bytes it receives and replies `b"stream: OK\0"`; assert the received framing equals `zINSTREAM\0` + `len(chunk)` big-endian + chunk … + `\0\0\0\0`, and a 100 KiB chunk is split into two frames (65536 + 36864).
  - `test_scan_stream_unavailable`: connecting to a closed port raises `ClamdUnavailable`.
  - `test_decide`: clean → KEEP; infected → QUARANTINE; unscannable → QUARANTINE.
- [ ] **Step 2: Run to verify it fails** — `cd platform/scanner && python -m pip install -r requirements-dev.txt && python -m pytest tests -q` → ImportError.
- [ ] **Step 3: Implement** `clamd.py` and `decision.py` (stdlib `socket`, `struct`, `dataclasses`, `enum` only).
- [ ] **Step 4: Verify** — `cd platform/scanner && python -m pytest tests -q` → all passed, no warnings.
- [ ] **Step 5: Commit** — `feat(scanner): add clamd INSTREAM client and quarantine decision`

---

### Task 4: Scanner service, ClamAV service and quarantine smoke

**Files:**
- Create: `platform/scanner/dxos_scanner/config.py`, `platform/scanner/dxos_scanner/scanner.py`, `platform/scanner/dxos_scanner/__main__.py`, `platform/scanner/Dockerfile`
- Create: `platform/tests/s3-tool.cjs` (CommonJS, `minio` client from `apps/web/node_modules` via `NODE_PATH`; commands `put <bucket> <key> <file>` (creates bucket if missing) and `exists <bucket> <key>` (exit 0 if present, 1 if not))
- Test: `platform/scanner/tests/test_scanner.py`
- Modify: `docker/docker-compose.yml` (services `clamav` and `dxos-scanner`), `Makefile` (`platform-up` service list adds `clamav dxos-scanner`), `platform/tests/smoke-platform.sh` (section `[quarantine]` after `[audit]`)

**Interfaces:**
- Consumes: `scan_stream`, `ScanResult`, `ClamdUnavailable`, `decide`, `Action` (Task 3); `audit.file_scans`, `audit.record_event` (Task 1).
- Produces:
  - `Config.from_env() -> Config` (fields: `buckets: list[str]`, `quarantine_bucket: str`, `interval_seconds: float`, `s3_endpoint: str` (default `minio:9000`), `s3_access_key`, `s3_secret_key`, `clamd_host` (default `clamav`), `clamd_port` (default `3310`), `db_url` (env `DXOS_DB_URL`), `heartbeat_path` (default `/tmp/dxos-scanner.heartbeat`)).
  - `run_once(s3, db, cfg: Config, scan=scan_stream) -> int` — processes every not-yet-scanned `(bucket, key, etag)` once and returns how many objects got a recorded verdict; `s3` is a `minio.Minio`-compatible object (`bucket_exists`, `list_objects(bucket, recursive=True)`, `get_object`, `copy_object`, `remove_object`, `make_bucket`), `db` a `psycopg` connection. Quarantine order: `copy_object` to `<quarantine>/<bucket>/<key>` → insert `audit.file_scans` + `audit.record_event('scanner','QUARANTINE','<bucket>/<key>', {"status","signature","etag","size_bytes"})` → `remove_object` original; clean: insert `file_scans` only. Every `file_scans` row carries `size_bytes` and `uploaded_at` (the object's `LastModified`). `ClamdUnavailable` or S3/DB errors abort the current object without recording anything. The quarantine bucket is never scanned, even if it appears in `buckets`.
  - `main()` — loop `run_once` every `interval_seconds`, touch the heartbeat after each round, exit cleanly on `SIGTERM` after the current object.
- Compose: `clamav` (image `clamav/clamav-debian:1.4.6`, volume `clamav_db:/var/lib/clamav`, `StreamMaxLength 50M` via the image's supported config env/mount, healthcheck `clamdcheck`, no host ports); `dxos-scanner` (`build: ../platform/scanner`, `image: opentea-dx-os/scanner:local`, env per `Config`, `DXOS_DB_URL=postgresql://${POSTGRES_USER:-agrimarket}:${POSTGRES_PASSWORD:-your_password_here}@postgres:5432/agrimarket`, healthcheck = heartbeat younger than `3 × interval`, `depends_on` postgres/seaweedfs/clamav healthy, no host ports).
- Dockerfile: `FROM python:3.12.15-slim-bookworm`, non-root user, `pip install --no-cache-dir -r requirements.txt`, `CMD ["python", "-m", "dxos_scanner"]`.

- [ ] **Step 1: Write failing unit tests** (`test_scanner.py`, fakes only — in-memory fake S3 and a fake db recording executed statements):
  - `test_clean_object_recorded_and_kept`; `test_infected_object_copied_then_removed` (assert call order copy → record → remove and the quarantine key `agrimarket-docs/a/b.txt`);
  - `test_already_scanned_etag_skipped`; `test_new_etag_rescanned`;
  - `test_object_vanished_between_list_and_get_is_skipped` (fake `get_object` raises the minio `NoSuchKey` S3Error) → no record, no exception;
  - `test_clamd_unavailable_records_nothing` (scan raises `ClamdUnavailable`) → no copy, no remove, no record;
  - `test_copy_failure_keeps_original` → no remove, no record;
  - `test_missing_bucket_is_ignored`; `test_quarantine_bucket_never_scanned` (config lists `dxos-quarantine` among `buckets`; its objects are not scanned);
  - `test_file_scan_row_has_size_and_uploaded_at`.
- [ ] **Step 2: Write the failing smoke** `[quarantine]`: build EICAR at runtime from two parts (`part1='X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR'`, `part2='-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'`) into a temp file; `put agrimarket-docs "smoke/Lô thử nghiệm/eicar test.txt"`; put a clean file `smoke/clean.txt`; poll ≤ 30 s until the EICAR key no longer `exists` in `agrimarket-docs` **and** `exists` in `dxos-quarantine` under `agrimarket-docs/smoke/Lô thử nghiệm/eicar test.txt`; then assert `file_scans` has `status='infected'` with a non-empty signature for that key, `status='clean'` for `smoke/clean.txt` (still present in the bucket), and `audit.events` has a `QUARANTINE` event with that subject; `verify_chain()` clean. Remove the smoke objects from the quarantine bucket at the end so reruns start clean.
- [ ] **Step 3: Run to verify failure** — `cd platform/scanner && python -m pytest tests -q` (ImportError for `scanner`), and `make platform-up && make platform-smoke` (FAIL in `[quarantine]`).
- [ ] **Step 4: Implement** config, loop, Dockerfile, compose services, `s3-tool.cjs`, Makefile list.
- [ ] **Step 5: Verify** — unit tests pass; `make platform-smoke` twice → all PASS; `docker compose -f docker/docker-compose.yml config -q` exits 0; `docker compose -f docker/docker-compose.yml ps` shows `clamav` and `dxos-scanner` healthy.
- [ ] **Step 6: Commit** — `feat(scanner): quarantine infected uploads with ClamAV`

---

### Task 5: CI, release wiring and docs

**Files:**
- Modify: `.github/workflows/ci.yml` (`platform-smoke` job only: add steps `Setup Python 3.12` (`actions/setup-python@v5`) and `Scanner Unit Tests` = `cd platform/scanner && python -m pip install -r requirements-dev.txt && python -m pytest tests -q`, before `Start Platform`)
- Modify: `.github/workflows/release.yml`, `.github/workflows/docker-publish.yml` (matrix entry `service: scanner`, `context: ./platform/scanner`)
- Modify: `docker/docker-compose.release.yml` (`dxos-scanner` image `${OPENTEA_IMAGE_PREFIX:-ghcr.io/maiychrus25/opentea-dx-os}-scanner:${OPENTEA_VERSION:?…}` with `build: !reset null`)
- Modify: `README.md` (Tier 1 section: quarantine + audit; deploy order `postgres` → `platform-init` → `migrate` → `platform-init` → rest), `DEPENDENCIES.md` (clamav-debian 1.4.6 GPL-2.0; python 3.12.15-slim-bookworm PSF; minio 7.2.20 Apache-2.0; psycopg 3.3.6 LGPL-3.0; pytest 9.1.1 MIT dev-only), `CHANGELOG.md` (`[Unreleased]`: Added quarantine + audit log; Changed deploy order)

- [ ] **Step 1: Edit** the files above.
- [ ] **Step 2: Verify** — `actionlint` clean; locally simulate the CI steps (`python -m pytest` from `platform/scanner`, `make platform-up`, `python3 platform/tests/test_realm_policy.py`, `make platform-smoke`) all pass; package a test bundle (`bash scripts/package-release.sh 0.0.0-test "$(mktemp -d)"`) contains `platform/scanner/` and `platform/postgres/init/03-audit-triggers.sql`; in an extracted bundle `OPENTEA_VERSION=x docker compose -f docker/docker-compose.yml -f docker/docker-compose.release.yml config --format json` shows `dxos-scanner` on the GHCR image with no build.
- [ ] **Step 3: Commit** — `ci(platform): test scanner, publish scanner image, document Tier 1b`
