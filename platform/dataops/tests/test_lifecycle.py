# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import copy
import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import duckdb
import pytest

from dxos_dataops import __main__ as cli
from dxos_dataops import lifecycle
from dxos_dataops.config import Config

NOW = datetime(2026, 11, 9, 8, 0, tzinfo=timezone.utc)
UTC = timezone.utc
OLD = datetime(2026, 10, 1, 6, 0, tzinfo=UTC)  # older than the 30-day cutoff of 2026-10-10 08:00
INGESTED = datetime(2026, 10, 1, 6, 0, 1, tzinfo=UTC)
RUN_ID = UUID("00000000-0000-0000-0000-000000000001")


class Cursor:
    def __init__(self, rows=(), rowcount=0):
        self._rows = list(rows)
        self.rowcount = rowcount

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows


class FakeS3:
    def __init__(self, log):
        self.log = log
        self.objects = {}
        self.buckets = set()
        self.fail = None  # "upload" or "download"
        self.fail_key = ""  # with fail: only keys containing this text
        self.corrupt = False
        self.fail_remove = False
        self.on_upload = None

    def _failing(self, step, key):
        return self.fail == step and self.fail_key in key

    def bucket_exists(self, bucket):
        return bucket in self.buckets

    def make_bucket(self, bucket):
        self.buckets.add(bucket)

    def fput_object(self, bucket, key, path):
        self.log.append("upload")
        if self._failing("upload", key):
            raise RuntimeError("upload failed")
        self.objects[(bucket, key)] = Path(path).read_bytes()
        if self.on_upload:
            self.on_upload()

    def fget_object(self, bucket, key, path):
        self.log.append("download")
        if self._failing("download", key):
            raise RuntimeError("download failed")
        data = self.objects[(bucket, key)]
        Path(path).write_bytes(data + b"x" if self.corrupt else data)

    def remove_object(self, bucket, key):
        self.log.append("remove")
        if self.fail_remove:
            raise RuntimeError("remove failed")
        self.objects.pop((bucket, key), None)


class FakeTxn:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        self.snapshot = copy.deepcopy((self.db.readings, self.db.runs, self.db.rejects, self.db.events))
        self.db.in_txn = True
        self.db.log.append("begin")

    def __exit__(self, exc_type, exc, tb):
        self.db.in_txn = False
        if exc_type:
            self.db.readings, self.db.runs, self.db.rejects, self.db.events = self.snapshot
            self.db.log.append("rollback")
            return False
        self.db.log.append("commit")
        if self.db.lose_connection_after_commit:
            self.db.closed = True
            raise RuntimeError("connection lost during commit")
        return False


class FakeDb:
    """Autocommit psycopg stand-in that keeps real table state and undoes it on rollback."""

    def __init__(self, log):
        self.log = log
        self.readings = {}  # (htx, parcel, sensor, ts) -> (value, ingested_at)
        self.runs = {}  # id -> row dict
        self.rejects = []  # dicts with id, htx_code, received_at, reason
        self.events = []
        self.temp_keys = []
        self.in_txn = False
        self.closed = False
        self.lose_connection_after_commit = False
        self.read_windows = []

    def transaction(self):
        return FakeTxn(self)

    def cursor(self):
        db = self

        class Cur:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def executemany(self, sql, rows):
                assert "lifecycle_export_keys" in sql and db.in_txn
                db.temp_keys.extend(tuple(r) for r in rows)

        return Cur()

    def add(self, htx="TC", ts=OLD, parcel="P-TC-001", sensor="soil_moisture", value=10.0):
        self.readings[(htx, parcel, sensor, ts)] = (value, INGESTED)

    def add_reject(self, htx, received_at, reason="out_of_range"):
        self.rejects.append({"id": len(self.rejects) + 1, "htx_code": htx, "received_at": received_at, "reason": reason})

    def run(self):
        assert len(self.runs) == 1
        return next(iter(self.runs.values()))

    def by_status(self, status):
        return [r for r in self.runs.values() if r["status"] == status]

    def _partitions(self, cutoff, limit):
        days = sorted({(k[0], k[3].astimezone(UTC).date()) for k in self.readings if k[3] < cutoff}, key=lambda p: p[1])
        return days[:limit]

    def execute(self, sql, params=()):
        if self.closed:
            raise RuntimeError("connection is closed")
        if "select distinct htx_code" in sql:
            assert "at time zone 'UTC'" in sql and "limit %s" in sql
            return Cursor(self._partitions(params[0], params[1]))
        if "from telemetry.sensor_readings where htx_code" in sql:
            htx, start, end = params
            self.read_windows.append((start, end))
            return Cursor([(*k, *v) for k, v in self.readings.items() if k[0] == htx and start <= k[3] < end])
        if "count(*) from telemetry.ingest_rejects" in sql:
            htx, start, end = params
            counts = {}
            for r in self.rejects:
                if r["htx_code"] == htx and start <= r["received_at"] < end:
                    counts[r["reason"]] = counts.get(r["reason"], 0) + 1
            return Cursor(list(counts.items()))
        if "insert into telemetry.lifecycle_runs" in sql:
            assert not self.in_txn
            run_id, target, htx, day = params
            self.runs[run_id] = dict(id=run_id, target=target, htx_code=htx, partition_date=day, status="running",
                                     row_count=None, sha256=None, size_bytes=None, quality=None, error=None,
                                     min_ts=None, max_ts=None)
            self.log.append("running")
            return Cursor()
        if "select status from telemetry.lifecycle_runs" in sql:
            return Cursor([(self.runs[params[0]]["status"],)])
        if "select id, target from telemetry.lifecycle_runs" in sql:
            return Cursor([(r["id"], r["target"]) for r in self.runs.values() if r["status"] == "running"])
        if "set status = 'failed'" in sql:
            error, run_id = params
            run = self.runs[run_id]
            count = 0
            if run["status"] == "running":
                run.update(status="failed", error=error)
                count = 1
            self.log.append("failed")
            return Cursor(rowcount=count)
        if "set status = 'done'" in sql:
            assert self.in_txn
            row_count, min_ts, max_ts, sha, size, quality, run_id = params
            run = self.runs[run_id]
            if run["status"] != "running":
                return Cursor(rowcount=0)
            run.update(status="done", row_count=row_count, min_ts=min_ts, max_ts=max_ts, sha256=sha, size_bytes=size, quality=quality)
            self.log.append("done")
            return Cursor(rowcount=1)
        if "create temp table lifecycle_export_keys" in sql:
            assert self.in_txn
            self.temp_keys = []
            return Cursor()
        if "delete from telemetry.sensor_readings" in sql:
            assert self.in_txn and "lifecycle_export_keys" in sql
            removed = [k for k in self.temp_keys if k in self.readings]
            for k in removed:
                del self.readings[k]
            self.log.append("delete")
            return Cursor(rowcount=len(removed))
        if "delete from telemetry.ingest_rejects" in sql:
            if self.in_txn:
                htx, start, end = params
                self.rejects = [r for r in self.rejects if not (r["htx_code"] == htx and start <= r["received_at"] < end)]
                self.log.append("delete_rejects")
                return Cursor()
            assert "not exists" in sql
            before = params[0]
            hot = {(k[0], k[3].astimezone(UTC).date()) for k in self.readings}
            self.rejects = [
                r for r in self.rejects if r["received_at"] >= before or (r["htx_code"], r["received_at"].date()) in hot
            ]
            return Cursor()
        if "audit.record_event" in sql:
            assert self.in_txn
            self.events.append(params)
            self.log.append("event")
            return Cursor([(1,)])
        raise AssertionError(sql)

    def close(self):
        self.closed = True


class LockDb:
    def __init__(self, log, held=False):
        self.log = log
        self.held = held
        self.closed = False
        self.lost_after_lock = False
        self.locked = False

    def execute(self, sql, params=()):
        if "pg_try_advisory_lock" in sql:
            self.log.append("lock")
            self.locked = not self.held
            return Cursor([(not self.held,)])
        assert sql == "select 1"
        if self.lost_after_lock:
            raise RuntimeError("lock session terminated")
        return Cursor([(1,)])

    def close(self):
        self.closed = True


def make_cfg():
    return Config(
        db_url="x", s3_endpoint="", s3_access_key="", s3_secret_key="", mqtt_host="h", mqtt_port=1883,
        mqtt_ingest_password="", devices={}, lake_bucket="dxos-lake", hot_retention_days=30, interval_seconds=1,
        heartbeat_path="/tmp/hb",
    )


@pytest.fixture
def env():
    log = []
    s3, db, lock = FakeS3(log), FakeDb(log), LockDb(log)
    cfg = make_cfg()
    return SimpleNamespace(
        log=log, s3=s3, db=db, lock=lock, cfg=cfg,
        run=lambda **kw: lifecycle.run_once(s3, db, cfg, NOW, kw.get("stop", lambda: False), connect_lock=lambda _: lock),
    )


def parquet_rows(data: bytes, tmp_path, sql="select * from read_parquet('{}') order by all"):
    path = tmp_path / "read.parquet"
    path.write_bytes(data)
    con = duckdb.connect(":memory:")
    try:
        return con.execute(sql.format(path)).fetchall()
    finally:
        con.close()


def test_object_key():
    key = lifecycle.object_key("TC", date(2026, 10, 1), RUN_ID)
    assert key == f"telemetry/sensor_readings/htx=TC/date=2026-10-01/{RUN_ID}.parquet"


def test_offset_timestamp_partitions_by_utc_date(env, tmp_path):
    # 23:30 at UTC-7 on Oct 1 is 06:30 UTC on Oct 2, and the connection reports it in that offset.
    env.db.add(ts=datetime(2026, 10, 1, 23, 30, tzinfo=timezone(timedelta(hours=-7))))
    assert env.run() == 0
    run = env.db.run()
    assert run["partition_date"] == date(2026, 10, 2)
    assert "date=2026-10-02" in run["target"]
    assert env.db.read_windows == [(datetime(2026, 10, 2, tzinfo=UTC), datetime(2026, 10, 3, tzinfo=UTC))]
    stored = parquet_rows(next(iter(env.s3.objects.values())), tmp_path, "select ts from read_parquet('{}')")
    assert stored == [(datetime(2026, 10, 2, 6, 30),)]


def test_happy_path_order(env, tmp_path):
    env.db.add(value=10.0)
    env.db.add(sensor="rainfall", value=2.5, ts=OLD + timedelta(hours=1))
    env.db.add_reject("TC", OLD, "out_of_range")
    assert env.run() == 0
    steps = [e for e in env.log if e != "lock"]
    assert steps == ["running", "upload", "download", "begin", "delete", "delete_rejects", "done", "event", "commit"]
    run = env.db.run()
    assert run["status"] == "done" and run["row_count"] == 2
    assert run["target"].startswith("s3://dxos-lake/telemetry/sensor_readings/htx=TC/date=2026-10-01/")
    assert run["min_ts"] == OLD and run["max_ts"] == OLD + timedelta(hours=1)
    assert not env.db.readings and env.lock.closed
    data = next(iter(env.s3.objects.values()))
    assert run["size_bytes"] == len(data)
    assert parquet_rows(data, tmp_path, "select count(*) from read_parquet('{}')") == [(2,)]
    assert run["sha256"] == hashlib.sha256(data).hexdigest()
    assert json.loads(run["quality"])["rejects"] == {"out_of_range": 1}
    assert env.db.events == [(run["target"], json.dumps({"rows": 2, "sha256": run["sha256"]}))]


@pytest.mark.parametrize("step", ["upload", "download", "sha_mismatch", "row_count_mismatch"])
def test_failure_keeps_hot_rows(env, step, monkeypatch):
    env.db.add()
    env.db.add_reject("TC", OLD)
    if step in ("upload", "download"):
        env.s3.fail = step
    elif step == "sha_mismatch":
        env.s3.corrupt = True
        monkeypatch.setattr(lifecycle, "parquet_row_count", lambda path: 1)  # only the hash can catch this
    else:
        monkeypatch.setattr(lifecycle, "parquet_row_count", lambda path: 99)
    assert env.run() == 1
    assert len(env.db.readings) == 1 and len(env.db.rejects) == 1
    run = env.db.run()
    assert run["status"] == "failed" and run["error"]
    assert not env.s3.objects  # the uploaded object is gone
    assert "delete" not in env.log and not env.db.events


def test_delete_count_mismatch_rolls_back(env):
    env.db.add(sensor="soil_moisture")
    env.db.add(sensor="rainfall")
    env.db.add_reject("TC", OLD)

    def vanish():  # a row exported but gone by the time of the delete
        env.s3.on_upload = None
        del env.db.readings[("TC", "P-TC-001", "rainfall", OLD)]

    env.s3.on_upload = vanish
    assert env.run() == 1
    assert "rollback" in env.log and "commit" not in env.log
    assert len(env.db.readings) == 1 and len(env.db.rejects) == 1
    assert env.db.run()["status"] == "failed" and not env.db.events
    assert not env.s3.objects


def test_row_added_after_export_is_not_deleted(env):
    env.db.add()
    late = ("TC", "P-TC-001", "air_humidity", OLD)

    def arrive():
        env.s3.on_upload = None
        env.db.readings[late] = (55.0, INGESTED)

    env.s3.on_upload = arrive
    assert env.run() == 0
    assert list(env.db.readings) == [late]
    assert env.db.run()["status"] == "done" and env.db.run()["row_count"] == 1


def test_run_marked_failed_elsewhere_rolls_back(env):
    env.db.add()

    def flip():  # e.g. a recovery that ran after this run's lock session died
        env.s3.on_upload = None
        env.db.run()["status"] = "failed"

    env.s3.on_upload = flip
    assert env.run() == 1
    assert "rollback" in env.log and len(env.db.readings) == 1 and not env.db.events


def test_recover_removes_object_and_marks_failed(env):
    key = lifecycle.object_key("TC", date(2026, 10, 1), RUN_ID)
    target = f"s3://dxos-lake/{key}"
    env.s3.objects[("dxos-lake", key)] = b"partial"
    env.db.runs[RUN_ID] = dict(id=RUN_ID, target=target, status="running", error=None)
    env.db.runs["done"] = dict(id="done", target="s3://dxos-lake/other", status="done", error=None)
    assert lifecycle.recover_interrupted(env.s3, env.db) == 1
    assert not env.s3.objects
    assert env.db.runs[RUN_ID]["status"] == "failed" and env.db.runs[RUN_ID]["error"]
    assert env.db.runs["done"]["status"] == "done"


def test_run_recovers_only_while_holding_lock(env):
    key = lifecycle.object_key("TC", date(2026, 10, 1), RUN_ID)
    env.db.runs[RUN_ID] = dict(id=RUN_ID, target=f"s3://dxos-lake/{key}", status="running", error=None)
    env.run()
    assert env.log[0] == "lock"
    assert env.db.runs[RUN_ID]["status"] == "failed"


def test_one_failed_partition_does_not_stop_others(env):
    env.db.add(htx="TC")
    env.db.add(htx="LB", parcel="P-LB-001")
    env.s3.fail, env.s3.fail_key = "upload", "htx=TC"
    assert env.run() == 1
    assert sorted(r["htx_code"] for r in env.db.by_status("done")) == ["LB"]
    assert sorted(r["htx_code"] for r in env.db.by_status("failed")) == ["TC"]
    assert [k[0] for k in env.db.readings] == ["TC"]


def test_at_most_100_partitions_per_run(env):
    for i in range(150):
        env.db.add(ts=OLD - timedelta(days=i))
    assert env.run() == 0
    assert len(env.db.by_status("done")) == 100
    assert len(env.db.readings) == 50


def test_skips_when_advisory_lock_held(env):
    env.lock.held = True
    env.db.add()
    env.db.runs[RUN_ID] = dict(id=RUN_ID, target="s3://dxos-lake/x", status="running", error=None)
    assert env.run() == 0
    assert env.log == ["lock"]
    assert env.db.runs[RUN_ID]["status"] == "running"
    assert env.lock.closed


def test_partition_rejects_deleted_in_final_transaction(env):
    env.db.add()
    env.db.add_reject("TC", OLD, "bad_json")
    env.db.add_reject("TC", OLD + timedelta(days=2), "bad_json")  # another day
    env.db.add_reject("LB", OLD, "bad_json")  # another HTX
    assert env.run() == 0
    assert env.log.index("begin") < env.log.index("delete_rejects") < env.log.index("commit")
    assert sorted(r["htx_code"] for r in env.db.rejects) == ["LB", "TC"]


def test_rows_inside_retention_stay_in_a_partly_expired_day(env):
    cutoff = NOW - timedelta(days=30)  # 2026-10-10 08:00 UTC
    expired, fresh = cutoff - timedelta(hours=1), cutoff + timedelta(hours=1)
    env.db.add(ts=expired)
    env.db.add(ts=fresh)
    env.db.add_reject("TC", expired, "bad_json")
    env.db.add_reject("TC", fresh, "bad_json")
    assert env.run() == 0
    assert [k[3] for k in env.db.readings] == [fresh]
    assert [r["received_at"] for r in env.db.rejects] == [fresh]
    assert env.db.run()["row_count"] == 1


def test_rejects_without_partition_deleted_after_twice_retention(env):
    ancient, recent = NOW - timedelta(days=61), NOW - timedelta(days=59)
    env.db.add_reject(None, ancient, "bad_topic")
    env.db.add_reject("TC", ancient, "bad_json")
    env.db.add_reject(None, recent, "bad_topic")
    assert env.run() == 0
    assert [r["received_at"] for r in env.db.rejects] == [recent]


def test_rejects_of_a_pending_partition_are_kept_past_twice_retention(env):
    # 150 days of backlog against the cap of 100: only the oldest 100 are exported, so a day 70 days old stays hot.
    for i in range(150):
        env.db.add(ts=NOW - timedelta(days=31 + i))
    pending = NOW - timedelta(days=70)
    env.db.add_reject("TC", pending, "bad_json")
    env.db.add_reject("TC", NOW - timedelta(days=500), "bad_json")  # no partition left for this day
    assert env.run() == 0
    assert [r["received_at"] for r in env.db.rejects] == [pending]


def test_unknown_commit_outcome_keeps_object(env):
    env.db.add()
    env.db.lose_connection_after_commit = True  # COMMIT reached the server, the reply never arrived
    with pytest.raises(RuntimeError):  # the closing housekeeping statement hits the dead connection too
        env.run()
    assert env.s3.objects, "the object may be the only copy of the deleted rows"
    assert "remove" not in env.log


def test_cleanup_failure_leaves_run_for_recovery(env):
    env.db.add()
    env.s3.fail, env.s3.fail_remove = "download", True
    assert env.run() == 1
    assert env.db.run()["status"] == "running"
    assert len(env.db.readings) == 1
    env.s3.fail, env.s3.fail_remove = None, False
    assert env.run() == 0  # recovery clears the stuck row, then the partition is exported again
    assert sorted(r["status"] for r in env.db.runs.values()) == ["done", "failed"]
    assert len(env.s3.objects) == 1 and not env.db.readings


def test_lost_lock_session_stops_before_delete(env):
    env.db.add()
    env.s3.on_upload = lambda: setattr(env.lock, "lost_after_lock", True)
    assert env.run() == 1
    assert len(env.db.readings) == 1 and "delete" not in env.log
    assert env.db.run()["status"] == "failed" and not env.s3.objects


def test_stop_ends_the_round_between_partitions(env):
    env.db.add(htx="TC")
    env.db.add(htx="LB", parcel="P-LB-001")
    calls = []

    def stop():
        calls.append(1)
        return len(calls) > 1

    assert env.run(stop=stop) == 0
    assert len(env.db.by_status("done")) == 1


def test_creates_bucket_when_missing(env):
    env.db.add()
    assert env.run() == 0
    assert env.s3.buckets == {"dxos-lake"}


class FakeConnection:
    closed = False

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def close(self):
        pass


@pytest.mark.parametrize("failed,code", [(0, None), (2, 1)])
def test_once_exit_code(monkeypatch, tmp_path, failed, code):
    monkeypatch.setenv("DXOS_DB_URL", "x")
    monkeypatch.setenv("DXOS_HEARTBEAT_PATH", str(tmp_path / "hb"))
    monkeypatch.setattr(cli.psycopg, "connect", lambda *a, **k: FakeConnection())
    monkeypatch.setattr(lifecycle, "run_once", lambda *a, **k: failed)
    if code is None:
        cli.main(["lifecycle", "--once"])
    else:
        with pytest.raises(SystemExit) as exc:
            cli.main(["lifecycle", "--once"])
        assert exc.value.code == code
