<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Tier 1c — Data & Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest sensor data over authenticated MQTT, age it from PostgreSQL to verified Parquet with lineage and quality records, expose an in-house LLM through the gateway, and fix deploy issues #15 and #17, without changing application code in `apps/web`.

**Architecture:** One new Python image `dxos-dataops` runs as two containers (`ingest`, `lifecycle`) plus a demo-only simulator, following the `dxos-scanner` pattern. Mosquitto enforces per-HTX topic isolation; a `telemetry` schema holds hot data and lineage; Parquet files live in the `dxos-lake` bucket. Ollama sits behind a single allow-listed APISIX route.

**Tech Stack:** `eclipse-mosquitto:2.1.2-alpine`, `ollama/ollama:0.40.15`, model `qwen2.5:0.5b`, `python:3.12.15-slim-bookworm`, `paho-mqtt==2.2.0`, `duckdb==2.0.0`, `minio==7.2.20`, `psycopg[binary]==3.3.6`, `pytest==9.1.1`, `prisma@5.22.0`, APISIX 3.19, Hasura v2.51.4.

**Spec:** `docs/specs/2026-11-09-tier1c-data-events-design.md`

## Global Constraints

- Do not modify tracked files under `apps/web/`. The only new files there are `apps/web/prisma/Dockerfile`, `database-url.js`, `.dockerignore` (Task 1).
- New files carry `SPDX-License-Identifier: MIT` and `SPDX-FileCopyrightText: 2026 OpenTea Developers` in the file's comment syntax.
- English identifiers and commit messages; Conventional Commits; author `maiychrus25 <ninhkhuongpl7@gmail.com>`; no `Co-Authored-By`; never push without owner approval.
- Use the exact versions from **Tech Stack**. No `latest` tags.
- Python tests run from `platform/dataops/` (`cd platform/dataops && python -m pytest tests -q -W error`), inside `python:3.12.15-slim-bookworm` on a host without Python 3.12. Never run pytest from the repo root: `platform/` shadows the stdlib module.
- `DXOS_MQTT_DEVICES` and `DXOS_MQTT_INGEST_PASSWORD` reach containers through `env_file: .env.local`, not compose interpolation (issue #8). Same exposure as Hasura today, tracked by #16.
- New smoke assertions live in `platform/tests/smoke-dataops.sh`, sourced from `smoke-platform.sh` immediately before `echo "[pins]"`. Existing smoke sections stay, except the one Hasura restart removed in Task 1.
- Reject reasons, sensor names and ranges, paths and defaults are exactly those in spec §4 and §5.
- The clean-volume commands below delete local Docker volumes (`docker_pgdata`, `docker_seaweedfs_data`, `docker_mosquitto_data`). Run them only after the owner has confirmed the local dev data may be discarded; otherwise rely on the clean-database run in CI.

## Review Focus

- **Timestamps near a UTC day boundary or with an offset** (`2026-11-09T06:30:00+07:00`): the row belongs to UTC date `2026-11-08`; naive timestamps are `bad_ts` — tests in Task 2 and Task 4.
- **`NaN`, `Infinity`, booleans or strings as `value`**: never stored; `NaN`/`Infinity` are `out_of_range`, other non-numbers `bad_json` — test in Task 2.
- **Database outage while messages arrive**: no ack, reconnect, every message delivered exactly once in the table — unit test in Task 3.
- **A row inserted between export and delete**: it survives and is exported later — unit test in Task 4.
- **`query` before any Parquet exists, and re-running `platform-init` on existing telemetry tables**: empty result rather than a crash; no error and no data loss — tests in Task 4 and Task 3.

---

### Task 1: Deploy order and prebuilt migrate image (#17, #15)

**Files:**
- Create: `apps/web/prisma/Dockerfile`, `apps/web/prisma/database-url.js`, `apps/web/prisma/.dockerignore`
- Modify: `docker/docker-compose.yml`, `docker/docker-compose.release.yml`, `Makefile:7-9`, `platform/tests/smoke-platform.sh:56-57`, `.github/workflows/release.yml`, `.github/workflows/docker-publish.yml`, `README.md`

**Interfaces:**
- Produces: compose service `migrate` (profile `tools`) in the base file; image `opentea-dx-os/migrate:local`; GHCR suffix `-migrate`.

- [ ] **Step 1: Add the failing smoke checks**

In `smoke-platform.sh`, delete the `$COMPOSE restart hasura` line and its comment. Before the fixture is loaded, assert that Hasura already serves `htx_profiles` (a `{htx_profiles(limit:1){id}}` query with the admin secret returns no `errors`). Add:

```bash
got=$($COMPOSE --profile tools run --rm -e POSTGRES_USER=agrimarket -e 'POSTGRES_PASSWORD=p@ss/w:rd' -e POSTGRES_DB=agrimarket --entrypoint node migrate /app/database-url.js)
assert_eq "$got" "postgresql://agrimarket:p%40ss%2Fw%3Ard@postgres:5432/agrimarket" "migrate URL-encodes the password"
```

- [ ] **Step 2: Run to verify failure**

Run: `make platform-down && docker volume rm docker_pgdata; make platform-up && make platform-smoke`
Expected: FAIL at the Hasura assertion or the missing `migrate` service.

- [ ] **Step 3: Build the migrate image**

`database-url.js` prints the URL from `POSTGRES_USER`, `POSTGRES_PASSWORD` (`encodeURIComponent`), `POSTGRES_DB` (default `agrimarket`), host `postgres:5432`. The Dockerfile uses `node:20.19.5-bookworm` (Prisma engines need OpenSSL), runs `npm install -g prisma@5.22.0`, copies `schema.prisma`, `migrations/`, `database-url.js` to `/app`, and runs `sh -c 'DATABASE_URL="$(node /app/database-url.js)" exec prisma migrate deploy --schema /app/schema.prisma'`. `.dockerignore` excludes `seed.ts`.

- [ ] **Step 4: Rewire compose and Makefile**

Base compose gets `migrate` with `build: ../apps/web/prisma`, profile `tools`, `POSTGRES_USER`/`POSTGRES_PASSWORD` environment and a healthy `postgres` dependency. The release override replaces its `migrate` block with the GHCR image and `build: !reset null`. `platform-up` becomes, in order: `up -d --build --wait postgres`; `run --rm platform-init`; `--profile tools run --rm --build migrate`; `run --rm platform-init`; `up -d --build --wait` for the current service list. Add `migrate` (context `./apps/web/prisma`) to both workflow matrices and the image list in release notes. README "Bản phát hành": add `migrate` to the `pull` list.

- [ ] **Step 5: Verify and commit**

Run: `make platform-down && docker volume rm docker_pgdata; make platform-up && make platform-smoke`
Expected: all assertions PASS, Hasura without restart.

```bash
git add apps/web/prisma/Dockerfile apps/web/prisma/database-url.js apps/web/prisma/.dockerignore docker Makefile platform/tests/smoke-platform.sh .github/workflows README.md
git commit -m "fix(platform): migrate before Hasura and ship a prebuilt migrate image"
```

---

### Task 2: `dxos_dataops` package and message validation

**Files:**
- Create: `platform/dataops/{Dockerfile,.dockerignore,requirements.txt,requirements-dev.txt}`, `platform/dataops/dxos_dataops/{__init__,config,payload}.py`, `platform/dataops/tests/{__init__,test_payload}.py`

**Interfaces:**
- Produces in `payload.py`:
  - `SENSORS: dict[str, tuple[float, float]]` (inclusive ranges, spec §4.2)
  - `class Rejected(Exception)` with `reason: str`, `htx_code: str | None`
  - `@dataclass(frozen=True) class Reading` with `htx_code, parcel_code, sensor: str; ts: datetime; value: float`
  - `parse_message(topic: str, payload: bytes, now: datetime) -> Reading`, raises `Rejected`
- Produces in `config.py`: frozen `Config` with `from_env()` and fields `db_url, s3_endpoint, s3_access_key, s3_secret_key, mqtt_host, mqtt_port, mqtt_ingest_password, devices: dict[str, str], lake_bucket, hot_retention_days, interval_seconds, heartbeat_path`. Defaults: `minio:9000`, `mosquitto`, `1883`, `dxos-lake`, `30`, `3600.0`, `/tmp/dxos-dataops.heartbeat`.

- [ ] **Step 1: Write the failing tests** in `tests/test_payload.py`

```python
NOW = datetime(2026, 11, 9, 8, 0, tzinfo=timezone.utc)
T = "htx/TC/plot/P-TC-001/soil_moisture"

def reason(topic, body): ...  # returns Rejected.reason from parse_message

def test_valid_reading():
    r = parse_message(T, b'{"ts":"2026-11-09T06:30:00+07:00","value":23.4}', NOW)
    assert (r.htx_code, r.parcel_code, r.sensor, r.value) == ("TC", "P-TC-001", "soil_moisture", 23.4)
    assert r.ts == datetime(2026, 11, 8, 23, 30, tzinfo=timezone.utc)

@pytest.mark.parametrize("topic", ["htx/TC/plot/P1", "x/TC/plot/P1/soil_moisture", "htx//plot/P1/soil_moisture", "htx/TC/plot/P1/a/b"])
def test_bad_topic(topic): assert reason(topic, b"{}") == "bad_topic"

# parametrized, expected reason in the third column:
# b"not json" -> bad_json;  b'[]' -> bad_json;  value "1", true or missing -> bad_json
# ts missing, not a string, naive "2026-11-09T08:00:00" -> bad_ts
# ts NOW + 5 min exactly -> accepted;  NOW + 5 min + 1 s -> future_ts
# sensor "ph" -> unknown_sensor (Rejected.htx_code == "TC")
# soil_moisture 100.1 or -0.1 -> out_of_range;  NaN, Infinity -> out_of_range
# air_temperature -10 and 55 -> accepted (inclusive bounds)
```

`bad_topic` carries `htx_code=None`; every later reason carries the topic's HTX. Checks run in the spec §4.3 order.

- [ ] **Step 2: Run to verify failure**

Run: `docker run --rm -v "$PWD/platform/dataops:/w" -w /w python:3.12.15-slim-bookworm sh -c 'pip -q install -r requirements-dev.txt && python -m pytest tests -q -W error'`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `config.py`, `payload.py`, and the image**

`DXOS_MQTT_DEVICES` parses `TC:pw,LB:pw` splitting each entry on the first `:`. Only `DXOS_DB_URL` is required at `from_env()`; other credentials default to `""` and each command checks those it uses. The Dockerfile mirrors `platform/scanner/Dockerfile` with uid 10001 and user `dataops`, plus `HOME=/home/dataops` and, as that user, `python -c "import duckdb; duckdb.sql('INSTALL httpfs')"` so no extension download happens at runtime. `requirements.txt`: `paho-mqtt==2.2.0`, `duckdb==2.0.0`, `minio==7.2.20`, `psycopg[binary]==3.3.6`.

- [ ] **Step 4: Run tests**, same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add platform/dataops
git commit -m "feat(dataops): add sensor message validation"
```

---

### Task 3: Broker, telemetry schema, ingest worker, simulator

**Files:**
- Create: `platform/mosquitto/{mosquitto.conf,acl,entrypoint.sh}`, `platform/postgres/init/04-telemetry.sql`, `platform/dataops/dxos_dataops/{ingest,simulate,__main__}.py`, `platform/dataops/tests/test_ingest.py`, `platform/hasura/metadata/databases/default/tables/telemetry_{sensor_readings,lifecycle_runs}.yaml`, `platform/tests/smoke-dataops.sh`
- Modify: `docker/docker-compose.yml`, `docker/docker-compose.release.yml`, `docker/.env.local.example`, `Makefile:8`, `platform/hasura/metadata/databases/default/tables/tables.yaml`, `platform/tests/smoke-platform.sh`

**Interfaces:**
- Consumes: `parse_message`, `Rejected`, `Reading`, `Config`.
- Produces:
  - `ingest.handle_message(db, topic: str, payload: bytes, now: datetime) -> str`, returning `"stored"`, `"duplicate"` or the reject reason; raises on database errors
  - `ingest.Worker(cfg, client_factory, connect_db)` with `on_message(client, userdata, msg)`
  - `python -m dxos_dataops {ingest | lifecycle [--once] | simulate [--backfill-days N] [--step-minutes M] | query SQL}`
  - Tables `telemetry.sensor_readings`, `telemetry.ingest_rejects`, `telemetry.lifecycle_runs` (`id uuid` primary key, columns per spec §5.3)

- [ ] **Step 1: Write the failing unit tests** in `tests/test_ingest.py`, using the fake connection style of `platform/scanner/tests/test_scanner.py`

```python
def test_valid_message_stored(): ...          # insert sent; returns "stored"
def test_conflict_is_duplicate(): ...         # rowcount 0 -> "duplicate"
def test_parcel_of_other_htx_rejected(): ...  # no insert; ingest_rejects row with reason unknown_parcel
def test_payload_truncated_to_256_bytes(): ...
def test_ack_after_store():                   # ack(mid, 1) called once, after the insert
def test_rejected_message_is_acked():
def test_db_error_does_not_ack():             # no ack; client.disconnect() called; connection dropped
def test_redelivery_after_db_error_stores_once():
```

- [ ] **Step 2: Run to verify failure.** Same docker command. Expected: FAIL, module not found.

- [ ] **Step 3: Implement schema and broker**

`04-telemetry.sql` is idempotent (`IF NOT EXISTS` throughout), with `sensor_readings` key `(htx_code, parcel_code, sensor, ts)` and an index on `ts`. `mosquitto.conf`: `allow_anonymous false`, `acl_file`, `password_file` under `/tmp`, `persistence true` on a new `mosquitto_data` volume, `message_size_limit 1024`, `max_queued_messages 100000`, listener 1883. `entrypoint.sh` builds the password file with `mosquitto_passwd -b` from `DXOS_MQTT_DEVICES` and `DXOS_MQTT_INGEST_PASSWORD`, exits non-zero if any is empty, and when `DXOS_MQTT_REQUIRE_STRONG=1` (set by the release override) exits non-zero if a password starts with `change_me` in any case. `.env.local.example` ships `change_me_*` values.

- [ ] **Step 4: Implement `handle_message`, `Worker`, `simulate`, CLI**

paho client: `CallbackAPIVersion.VERSION2`, `client_id="dxos-ingest"`, `clean_session=False`, `MQTTv311`, `manual_ack=True`, subscribe `htx/+/plot/+/+` QoS 1. Heartbeat is touched per message and on a 30 s timer. `simulate` loads parcels of the `DXOS_MQTT_DEVICES` HTXs from the database, one client per HTX. Live mode publishes every 60 s; `--backfill-days N` publishes `now - N days` to `now - 1 day` at `--step-minutes` (default 60) with `wait_for_publish`, then exits.

- [ ] **Step 5: Wire compose and Hasura**

Add `mosquitto` (no `ports`), `dxos-ingest`, `dxos-simulator` (profile `demo`), all from `platform/dataops` where applicable, with a heartbeat healthcheck like `dxos-scanner`. Release override: GHCR `-dataops` image, `build: !reset null`, `DXOS_MQTT_REQUIRE_STRONG: "1"` on `mosquitto`. Append `mosquitto dxos-ingest` to `platform-up`. Hasura select permissions for `manager` and `officer`: `columns: '*'`, `filter: {_and: [{htx_code: {_eq: X-Hasura-Htx-Code}}, {htx_code: {_neq: ''}}]}`.

- [ ] **Step 6: Add smoke `[mqtt]` and `[telemetry permissions]`**

With `mosquitto_pub` via `$COMPOSE exec -T mosquitto` and a `wait_count <sql> <expected>` poll (30 s): anonymous publish exits non-zero; `TC` publishing to `htx/LB/plot/P-LB-001/soil_moisture`, followed by a valid `TC` message, leaves `LB` absent once the valid row has arrived; `htx/TC/plot/P-LB-001/...` lands in `ingest_rejects` as `unknown_parcel`; repeating a message adds no row; `stop dxos-ingest`, publish, `start dxos-ingest` delivers. Re-running `platform-init` leaves the row count unchanged. Manager `TC` sees only `TC` rows; manager `LB` sees none of them; role `farmer` gets a GraphQL error on `telemetry_sensor_readings`. The section deletes its own rows first, so it is re-runnable.

- [ ] **Step 7: Verify and commit**

Run: unit tests, then `make platform-up && make platform-smoke`. Expected: all PASS, including the existing sections.

```bash
git add platform docker Makefile
git commit -m "feat(platform): ingest sensor data over authenticated MQTT"
```

---

### Task 4: Lifecycle, lineage, quality, cold query

**Files:**
- Create: `platform/dataops/dxos_dataops/{lifecycle,quality,query}.py`, `platform/dataops/tests/{test_lifecycle,test_quality,test_query}.py`
- Modify: `platform/dataops/dxos_dataops/__main__.py`, `docker/docker-compose.yml`, `docker/docker-compose.release.yml`, `Makefile:8`, `platform/tests/smoke-dataops.sh`

**Interfaces:**
- Consumes: `Config`, tables from Task 3, `audit.record_event(text, text, text, jsonb)`.
- Produces:
  - `lifecycle.run_once(s3, db, cfg, now: datetime, should_stop) -> int` (number of failed partitions)
  - `lifecycle.recover_interrupted(s3, db) -> int`
  - `lifecycle.object_key(htx_code: str, day: date, run_id: UUID) -> str`
  - `quality.build_quality(rows: list[tuple[str, float]], rejects: dict[str, int]) -> dict`
  - `query.run_query(s3, cfg, sql: str) -> list[tuple]`

- [ ] **Step 1: Write the failing tests**

```python
# test_lifecycle.py (fakes in the style of the scanner tests)
def test_object_key():  # telemetry/sensor_readings/htx=TC/date=2026-10-01/<uuid>.parquet
def test_offset_timestamp_partitions_by_utc_date():
def test_happy_path_order(): ...       # running row, upload, download check, then one transaction: delete, done, record_event
@pytest.mark.parametrize("step", ["upload", "download", "sha_mismatch", "row_count_mismatch"])
def test_failure_keeps_hot_rows(step): ...  # no delete; status failed; uploaded object removed
def test_delete_count_mismatch_rolls_back(): ...
def test_row_added_after_export_is_not_deleted(): ...  # delete uses exported keys only
def test_recover_removes_object_and_marks_failed():
def test_one_failed_partition_does_not_stop_others():  # run_once returns 1, the others are done
def test_at_most_100_partitions_per_run():
def test_skips_when_advisory_lock_held():
def test_partition_rejects_deleted_in_final_transaction():
# test_quality.py
def test_quality_per_sensor():  # {"rows":3,"sensors":{"soil_moisture":{"count":2,"min":10.0,"max":20.0,"avg":15.0},...},"rejects":{"out_of_range":1}}
# test_query.py
def test_empty_lake_returns_no_rows():  # query over sensor_readings_cold -> []
```

- [ ] **Step 2: Run to verify failure.** Expected: FAIL, module not found.

- [ ] **Step 3: Implement** per spec §5.2 and §5.5

Use autocommit outside the final `with db.transaction()`. Keep a dedicated session for `pg_try_advisory_lock`, and call `recover_interrupted` only while holding it. Partitions come from `select distinct htx_code, (ts at time zone 'UTC')::date ... where ts < cutoff order by 2 limit 100`. Write Parquet through an in-memory DuckDB table: `COPY ... TO ... (FORMAT PARQUET, COMPRESSION ZSTD)`, with the comment `# shortcut: rows held in memory per partition, fine for one HTX-day; stream when partitions exceed memory`. Rejects with no partition are deleted when older than twice the retention. `query` first tries `httpfs` with `s3_url_style='path'`, `s3_use_ssl=false`; on an IO error it downloads objects to a temp directory. When the lake is empty, `sensor_readings_cold` is a typed empty view.

- [ ] **Step 4: Run tests.** Expected: PASS.

- [ ] **Step 5: Wire `dxos-lifecycle`** in compose and release (heartbeat healthcheck), append it to `platform-up`, CLI `lifecycle --once` exits 1 if `run_once` returned non-zero.

- [ ] **Step 6: Add smoke `[lifecycle]`**

Delete hot rows; `simulate --backfill-days 45 --step-minutes 720`; wait for rows; note the number with `ts` inside retention; run `lifecycle --once`. Assert: no row older than 30 days remains; in-retention rows are unchanged; `query "select count(*) from sensor_readings_cold"` equals `select sum(row_count) from telemetry.lifecycle_runs where status='done'`; every `done` row's `sha256` and `row_count` equal the matching `audit.events` `lake_export` event; `audit.verify_chain()` reports `first_bad_id` empty; a row inserted late for an exported date and a second `--once` produce a second `done` file for that `(htx_code, partition_date)`.

- [ ] **Step 7: Verify and commit**

Run: unit tests, then `make platform-up && make platform-smoke`. Expected: all PASS.

```bash
git add platform docker Makefile
git commit -m "feat(dataops): move aged sensor data to Parquet with lineage"
```

---

### Task 5: In-house LLM behind the gateway

**Files:**
- Modify: `docker/docker-compose.yml` (replace the commented `ollama` block), `docker/docker-compose.release.yml`, `platform/gateway/apisix.yaml`, `Makefile`, `platform/tests/smoke-dataops.sh`

**Interfaces:**
- Produces: route `POST /api/ai/llm/v1/chat/completions`; service `ollama`; one-shot `ollama-init` (profile `tools`).

- [ ] **Step 1: Add failing smoke `[llm]`**

No token on the route is 401; a `dxos-noaud` token is 401; a valid token on `/api/ai/llm/api/pull` is 404; a valid token with `GET` on the route is 404; a chat with `{"model":"qwen2.5:0.5b","max_tokens":8,"messages":[...]}` and `--max-time 120` has non-empty `.choices[0].message.content`; then 31 quick calls with a non-existent model include at least one 429. Run the rate-limit check last.

Run: `make platform-smoke`. Expected: FAIL at the first `[llm]` assertion.

- [ ] **Step 2: Add services**

`ollama`: image per Tech Stack, no `ports`, volume `ollama_data`, `mem_limit: 2g`, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_QUEUE=8`, healthcheck `ollama list`. `ollama-init` (profile `tools`): same image, `OLLAMA_HOST=ollama:11434`, shell entrypoint running `ollama pull "$DXOS_LLM_MODEL"`, then `ollama list | grep -q "$DXOS_LLM_MODEL_ID"`, exiting non-zero on mismatch. Defaults `qwen2.5:0.5b`, `a8b0c5157701`. Confirm the digest from the first pull; if it differs, update the default and the spec. Append `ollama` to `platform-up` and finish with `--profile tools run --rm ollama-init`.

- [ ] **Step 3: Add the gateway route**

Upstream `ollama` (`ollama:11434`). Route id `llm-chat`, `uri: /api/ai/llm/v1/chat/completions`, `methods: [POST]`, `timeout: {connect: 5, send: 120, read: 120}`, plugins `openid-connect: *oidc_aud`, `limit-count` (30 per 60 s, `key: remote_addr`, `rejected_code: 429`), `proxy-rewrite` `uri: /v1/chat/completions`. Keep the trailing `#END`.

- [ ] **Step 4: Verify and commit**

Run: `make platform-up && make platform-smoke`. Expected: all PASS.

```bash
git add docker platform Makefile
git commit -m "feat(platform): serve an in-house LLM through the gateway"
```

---

### Task 6: CI, release wiring and docs

**Files:**
- Modify: `.github/workflows/ci.yml:249-250`, `.github/workflows/release.yml`, `.github/workflows/docker-publish.yml`, `scripts/package-release.sh`, `docker/docker-compose.release.yml:4-8`, `README.md`, `DEPENDENCIES.md`, `CHANGELOG.md`, `docs/specs/2026-11-09-tier1c-data-events-design.md`

- [ ] **Step 1: CI.** After "Scanner Unit Tests", add "Dataops Unit Tests": `cd platform/dataops && python -m pip install -r requirements-dev.txt && python -m pytest tests -q -W error`. Run `actionlint`; expected no output.

- [ ] **Step 2: Release.** Add `dataops` (context `./platform/dataops`) to both matrices and to the release-notes image list (6 images). Confirm `scripts/package-release.sh` carries `platform/mosquitto` (it packs `platform`) by listing a bundle with `tar -tzf`. Update the override header comment and the release-notes deploy text.

- [ ] **Step 3: Docs.** README: Tier 1 section (MQTT, lake, LLM route, demo with `--profile demo`), `pull` list, final `--profile tools run --rm ollama-init` step, required `DXOS_MQTT_*` secrets. `DEPENDENCIES.md`: Mosquitto EPL-2.0, Ollama MIT, `qwen2.5:0.5b` Apache-2.0, `paho-mqtt` `EPL-2.0 OR BSD-3-Clause`, `duckdb` MIT. `CHANGELOG.md` `[Unreleased]`: Added, Fixed and Upgrade notes, including the new `.env.local` keys. Spec: set the status line and add "Ghi chú sau triển khai 1c" listing differences from the design, with the measured Platform Smoke duration.

- [ ] **Step 4: Full verification, two rounds**

Run twice, from a clean volume: `make platform-down && docker volume rm docker_pgdata docker_seaweedfs_data docker_mosquitto_data; make platform-up && make platform-smoke`. Then `make test`, `make lint`, the dataops and scanner unit tests, `python3 platform/tests/test_realm_policy.py`. Expected: all PASS, with all 79 pre-existing smoke assertions still present and green.

- [ ] **Step 5: Commit**

```bash
git add .github scripts docker README.md DEPENDENCIES.md CHANGELOG.md docs/specs/2026-11-09-tier1c-data-events-design.md
git commit -m "ci(platform): test dataops, publish its image and document Tier 1c"
```

- [ ] **Step 6: Ask the owner** before opening the PR, merging or tagging `v1.5.0`. Merge locally with `--no-ff`, never with `gh pr merge`.
