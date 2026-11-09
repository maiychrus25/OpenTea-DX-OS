# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Archive aged sensor rows to Parquet, one HTX and UTC day at a time, then delete exactly what was archived."""
import hashlib
import json
import logging
import tempfile
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

import duckdb
import psycopg

from .config import Config
from .quality import build_quality

log = logging.getLogger("dxos_lifecycle")

MAX_PARTITIONS = 100
UTC = timezone.utc

PARTITIONS_SQL = """
select distinct htx_code, (ts at time zone 'UTC')::date from telemetry.sensor_readings
where ts < %s order by 2 limit %s"""
READ_ROWS_SQL = """
select htx_code, parcel_code, sensor, ts, value, ingested_at
from telemetry.sensor_readings where htx_code = %s and ts >= %s and ts < %s"""
COUNT_REJECTS_SQL = """
select reason, count(*) from telemetry.ingest_rejects
where htx_code = %s and received_at >= %s and received_at < %s group by reason"""
INSERT_RUN_SQL = """
insert into telemetry.lifecycle_runs (id, target, htx_code, partition_date, status)
values (%s, %s, %s, %s, 'running')"""
MARK_FAILED_SQL = """
update telemetry.lifecycle_runs set status = 'failed', error = %s, finished_at = now()
where id = %s and status = 'running'"""
MARK_DONE_SQL = """
update telemetry.lifecycle_runs set status = 'done', row_count = %s, min_ts = %s, max_ts = %s, sha256 = %s,
  size_bytes = %s, quality = %s::jsonb, finished_at = now()
where id = %s and status = 'running'"""
DELETE_ROWS_SQL = """
delete from telemetry.sensor_readings r using lifecycle_export_keys k
where r.htx_code = k.htx_code and r.parcel_code = k.parcel_code and r.sensor = k.sensor and r.ts = k.ts"""
DELETE_PARTITION_REJECTS_SQL = """
delete from telemetry.ingest_rejects where htx_code = %s and received_at >= %s and received_at < %s"""
# Rejects of a partition still waiting for export (cap, failed run) stay until that export reports them.
DELETE_ORPHAN_REJECTS_SQL = """
delete from telemetry.ingest_rejects i where i.received_at < %s and not exists (
  select 1 from telemetry.sensor_readings r
  where r.htx_code = i.htx_code and (r.ts at time zone 'UTC')::date = (i.received_at at time zone 'UTC')::date)"""


def object_key(htx_code: str, day: date, run_id: uuid.UUID) -> str:
    return f"telemetry/sensor_readings/htx={htx_code}/date={day.isoformat()}/{run_id}.parquet"


def connect_lock(cfg: Config):
    return psycopg.connect(cfg.db_url, autocommit=True, application_name="dxos-lifecycle-lock")


def _naive_utc(ts: datetime) -> datetime:
    return ts.astimezone(UTC).replace(tzinfo=None)


def write_parquet(rows: list[tuple], path: Path) -> None:
    # shortcut: rows held in memory per partition, fine for one HTX-day; stream when partitions exceed memory
    con = duckdb.connect(":memory:")
    try:
        con.execute(
            "create table r (htx_code varchar, parcel_code varchar, sensor varchar, ts timestamp, value double, ingested_at timestamp)"
        )
        con.executemany(
            "insert into r values (?, ?, ?, ?, ?, ?)",
            [(h, p, s, _naive_utc(ts), v, _naive_utc(ing)) for h, p, s, ts, v, ing in rows],
        )
        con.execute(f"copy r to '{path}' (format parquet, compression zstd)")
    finally:
        con.close()


def parquet_row_count(path: Path) -> int:
    con = duckdb.connect(":memory:")
    try:
        return con.execute("select count(*) from read_parquet(?)", [str(path)]).fetchone()[0]
    finally:
        con.close()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _delete_exported(db, rows: list[tuple]) -> None:
    db.execute(
        "create temp table lifecycle_export_keys (htx_code text, parcel_code text, sensor text, ts timestamptz) on commit drop"
    )
    with db.cursor() as cur:
        cur.executemany("insert into lifecycle_export_keys values (%s, %s, %s, %s)", [r[:4] for r in rows])
    deleted = db.execute(DELETE_ROWS_SQL).rowcount
    if deleted != len(rows):
        raise ValueError(f"deleted {deleted} rows but exported {len(rows)}")


def _abandon(s3, db, bucket: str, key: str, run_id: uuid.UUID, error: str) -> None:
    """Undo a failed export. Anything that goes wrong here leaves the row `running` for recover_interrupted."""
    # The status is read first: after a lost COMMIT the rows may be gone and this object their only copy.
    status = db.execute("select status from telemetry.lifecycle_runs where id = %s", (run_id,)).fetchone()[0]
    if status != "running":
        return
    s3.remove_object(bucket, key)
    db.execute(MARK_FAILED_SQL, (error, run_id))


def _export_partition(s3, db, lock_db, cfg: Config, htx: str, day: date, cutoff: datetime) -> None:
    run_id = uuid.uuid4()
    key = object_key(htx, day, run_id)
    target = f"s3://{cfg.lake_bucket}/{key}"
    db.execute(INSERT_RUN_SQL, (run_id, target, htx, day))  # before the upload, so a crash leaves something to clean up
    try:
        start = datetime(day.year, day.month, day.day, tzinfo=UTC)
        end = min(start + timedelta(days=1), cutoff)  # the cutoff day is exported in pieces, in-retention rows stay hot
        rows = db.execute(READ_ROWS_SQL, (htx, start, end)).fetchall()
        rejects = dict(db.execute(COUNT_REJECTS_SQL, (htx, start, end)).fetchall())
        quality = build_quality([(r[2], r[4]) for r in rows], rejects)
        min_ts, max_ts = min(r[3] for r in rows), max(r[3] for r in rows)
        with tempfile.TemporaryDirectory() as tmp:
            local, copy = Path(tmp) / "export.parquet", Path(tmp) / "verify.parquet"
            write_parquet(rows, local)
            sha256, size = _sha256(local), local.stat().st_size
            s3.fput_object(cfg.lake_bucket, key, str(local))
            s3.fget_object(cfg.lake_bucket, key, str(copy))
            if _sha256(copy) != sha256:
                raise ValueError("stored object does not match the exported file")
            if parquet_row_count(copy) != len(rows):
                raise ValueError("stored object has the wrong row count")
        lock_db.execute("select 1")  # a lost lock means another run may be recovering this very object
        with db.transaction():
            _delete_exported(db, rows)
            db.execute(DELETE_PARTITION_REJECTS_SQL, (htx, start, end))
            done = db.execute(MARK_DONE_SQL, (len(rows), min_ts, max_ts, sha256, size, json.dumps(quality), run_id))
            if done.rowcount != 1:
                raise ValueError("run is no longer running")
            db.execute(
                "select audit.record_event('dxos-lifecycle', 'lake_export', %s, %s::jsonb)",
                (target, json.dumps({"rows": len(rows), "sha256": sha256})),
            )
    except Exception as exc:
        try:
            _abandon(s3, db, cfg.lake_bucket, key, run_id, f"{type(exc).__name__}: {exc}")
        except Exception:
            log.exception("cleanup of run %s failed, the next run recovers it", run_id)
        raise


def recover_interrupted(s3, db) -> int:
    """Clean up runs left `running` by a crash. Only call while holding the advisory lock."""
    running = db.execute("select id, target from telemetry.lifecycle_runs where status = 'running'").fetchall()
    for run_id, target in running:
        bucket, _, key = target.removeprefix("s3://").partition("/")
        s3.remove_object(bucket, key)  # removing first: a crash before the update only repeats this step
        db.execute(MARK_FAILED_SQL, ("interrupted before completion", run_id))
    return len(running)


def run_once(s3, db, cfg: Config, now: datetime, should_stop: Callable[[], bool], connect_lock=connect_lock) -> int:
    """One lifecycle round on an autocommit connection. Returns the number of failed partitions."""
    # Separate session: the lock must outlive errors and reconnects of the working connection.
    lock_db = connect_lock(cfg)
    try:
        if not lock_db.execute("select pg_try_advisory_lock(hashtext('dxos-lifecycle'))").fetchone()[0]:
            log.info("another lifecycle run holds the lock, skipping")
            return 0
        if not s3.bucket_exists(cfg.lake_bucket):
            s3.make_bucket(cfg.lake_bucket)
        recovered = recover_interrupted(s3, db)
        if recovered:
            log.warning("cleaned up %d interrupted runs", recovered)
        cutoff = now - timedelta(days=cfg.hot_retention_days)
        failed = 0
        for htx, day in db.execute(PARTITIONS_SQL, (cutoff, MAX_PARTITIONS)).fetchall():
            if should_stop():
                break
            try:
                _export_partition(s3, db, lock_db, cfg, htx, day, cutoff)
            except Exception:
                failed += 1
                log.exception("export of %s %s failed, hot rows kept", htx, day)
        db.execute(DELETE_ORPHAN_REJECTS_SQL, (now - timedelta(days=2 * cfg.hot_retention_days),))
        return failed
    finally:
        lock_db.close()  # closing the session releases the lock
