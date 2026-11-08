# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from minio.error import S3Error

from dxos_scanner.clamd import ClamdUnavailable, ScanResult
from dxos_scanner.config import MAX_SCAN_BYTES, Config
from dxos_scanner.scanner import run_once

WHEN = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)


class FakeResponse:
    def __init__(self, data):
        self.data = data
        self.closed = False
        self.released = False

    def stream(self, size):
        yield self.data

    def close(self):
        self.closed = True

    def release_conn(self):
        self.released = True


class FakeS3:
    def __init__(self, log, buckets):
        self.log = log
        self.buckets = {b: {} for b in buckets}  # bucket -> key -> (etag, data)
        self.fail_copy = False
        self.vanish = set()
        self.responses = []
        self.get_headers = []
        self.precondition_failed = False
        self.replace_on_stat = {}  # key -> etag it is swapped to right before the remove-time stat

    def put(self, bucket, key, data=b"x", etag='"e1"'):
        self.buckets[bucket][key] = (etag, data)

    def bucket_exists(self, bucket):
        return bucket in self.buckets

    def make_bucket(self, bucket):
        self.log.append(("make_bucket", bucket))
        self.buckets[bucket] = {}

    def list_objects(self, bucket, recursive=False):
        assert recursive
        self.log.append(("list", bucket))
        for key, (etag, data) in list(self.buckets[bucket].items()):
            yield SimpleNamespace(object_name=key, etag=etag, size=len(data), last_modified=WHEN)

    def get_object(self, bucket, key, request_headers=None):
        self.get_headers.append(request_headers)
        if self.precondition_failed:
            raise S3Error("PreconditionFailed", "etag mismatch", key, "rid", "hid", None)
        if key in self.vanish:
            raise S3Error("NoSuchKey", "gone", key, "rid", "hid", None)
        resp = FakeResponse(self.buckets[bucket][key][1])
        self.responses.append(resp)
        return resp

    def copy_object(self, dst_bucket, dst_key, source):
        if self.fail_copy:
            raise S3Error("InternalError", "boom", dst_key, "rid", "hid", None)
        self.log.append(("copy", dst_bucket, dst_key, source.bucket_name, source.object_name))
        self.buckets.setdefault(dst_bucket, {})[dst_key] = self.buckets[source.bucket_name][source.object_name]

    def stat_object(self, bucket, key):
        if key in self.replace_on_stat:
            self.buckets[bucket][key] = (self.replace_on_stat[key], b"new")
        return SimpleNamespace(etag=self.buckets[bucket][key][0])

    def remove_object(self, bucket, key):
        self.log.append(("remove", bucket, key))
        del self.buckets[bucket][key]


class FakeDb:
    def __init__(self, log):
        self.log = log
        self.seen = set()
        self.seen_at = {}  # (bucket, key, etag) -> uploaded_at of a pre-seeded clean row (default WHEN)
        self.flagged = {}  # (bucket, key, etag) -> (status, signature) rows pre-seeded as non-clean
        self.statements = []
        self.pending = []
        self._row = None
        self.in_txn = False
        self.txn_count = 0

    def transaction(self):
        return FakeTxn(self)

    def execute(self, sql, params=()):
        if ("insert into" in sql.lower() or "record_event" in sql) and not self.in_txn:
            raise AssertionError("write outside transaction")
        self.statements.append((sql, params))
        if "select" in sql.lower() and "file_scans" in sql:
            p = tuple(params)
            self._row = (self.flagged[p][0], self.flagged[p][1], WHEN) if p in self.flagged else (("clean", None, self.seen_at.get(p, WHEN)) if p in self.seen else None)
        elif "insert into audit.file_scans" in sql.lower():
            self.pending.append(("scan", tuple(params)))
        elif "record_event" in sql:
            self.pending.append(("event", tuple(params)))
        return self

    def fetchone(self):
        return self._row

    def _commit(self):
        for kind, params in self.pending:
            if kind == "scan":
                self.seen.add(params[:3])
        self.log.append(("record", [k for k, _ in self.pending]))
        self.pending = []

    def _rollback(self):
        self.pending = []


class FakeTxn:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        self.db.in_txn = True
        self.db.txn_count += 1

    def __exit__(self, exc_type, exc, tb):
        self.db.in_txn = False
        (self.db._rollback if exc_type else self.db._commit)()
        return False


def make(buckets=("agrimarket-docs",), scan_buckets=None):
    log = []
    s3 = FakeS3(log, buckets)
    db = FakeDb(log)
    cfg = Config(
        buckets=list(scan_buckets or ["agrimarket-docs"]),
        quarantine_bucket="dxos-quarantine",
        interval_seconds=5.0,
        s3_endpoint="minio:9000",
        s3_access_key="a",
        s3_secret_key="s",
        clamd_host="clamav",
        clamd_port=3310,
        db_url="postgresql://x",
        heartbeat_path="/tmp/hb",
    )
    return s3, db, cfg, log


def clean(host, port, chunks):
    b"".join(chunks)
    return ScanResult("clean", None)


def infected(host, port, chunks):
    b"".join(chunks)
    return ScanResult("infected", "Eicar-Test-Signature")


def ops(log, name):
    return [e for e in log if e[0] == name]


def test_clean_object_recorded_and_kept():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a/b.txt")
    assert run_once(s3, db, cfg, scan=clean) == 1
    assert ("agrimarket-docs", "a/b.txt", "e1") in db.seen
    assert ops(log, "copy") == [] and ops(log, "remove") == []
    assert "a/b.txt" in s3.buckets["agrimarket-docs"]
    assert all(r.closed and r.released for r in s3.responses)


def test_infected_object_copied_then_removed():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a/b.txt")
    assert run_once(s3, db, cfg, scan=infected) == 1
    steps = [e[0] for e in log if e[0] in ("copy", "record", "remove")]
    assert steps == ["copy", "record", "remove"]
    assert ops(log, "copy")[0] == ("copy", "dxos-quarantine", "agrimarket-docs/a/b.txt", "agrimarket-docs", "a/b.txt")
    assert ops(log, "record")[0][1] == ["scan", "event"]
    assert "a/b.txt" not in s3.buckets["agrimarket-docs"]
    assert "agrimarket-docs/a/b.txt" in s3.buckets["dxos-quarantine"]
    assert any("record_event" in s and "QUARANTINE" in s for s, _ in db.statements)


def test_already_scanned_etag_skipped():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    db.seen.add(("agrimarket-docs", "a.txt", "e1"))
    assert run_once(s3, db, cfg, scan=pytest.fail) == 0


def test_new_etag_rescanned():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    assert run_once(s3, db, cfg, scan=clean) == 1
    assert run_once(s3, db, cfg, scan=pytest.fail) == 0
    s3.put("agrimarket-docs", "a.txt", etag='"e2"')
    assert run_once(s3, db, cfg, scan=clean) == 1
    assert ("agrimarket-docs", "a.txt", "e2") in db.seen


def test_object_vanished_between_list_and_get_is_skipped():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    s3.vanish.add("a.txt")
    assert run_once(s3, db, cfg, scan=pytest.fail) == 0
    assert db.seen == set() and ops(log, "record") == []


def test_clamd_unavailable_records_nothing():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")

    def down(host, port, chunks):
        raise ClamdUnavailable("down")

    assert run_once(s3, db, cfg, scan=down) == 0
    assert ops(log, "copy") == [] and ops(log, "remove") == [] and ops(log, "record") == []
    assert all(r.closed and r.released for r in s3.responses)


def test_copy_failure_keeps_original():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    s3.fail_copy = True
    assert run_once(s3, db, cfg, scan=infected) == 0
    assert ops(log, "remove") == [] and ops(log, "record") == []
    assert "a.txt" in s3.buckets["agrimarket-docs"]


def test_missing_bucket_is_ignored():
    s3, db, cfg, log = make(buckets=())
    assert run_once(s3, db, cfg, scan=pytest.fail) == 0


def test_quarantine_bucket_never_scanned():
    s3, db, cfg, log = make(buckets=("dxos-quarantine",), scan_buckets=["dxos-quarantine"])
    s3.put("dxos-quarantine", "agrimarket-docs/a.txt")
    assert run_once(s3, db, cfg, scan=pytest.fail) == 0
    assert ops(log, "list") == []


def test_file_scan_row_has_size_and_uploaded_at():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt", data=b"12345")
    run_once(s3, db, cfg, scan=clean)
    inserts = [p for s, p in db.statements if "insert into audit.file_scans" in s.lower()]
    assert len(inserts) == 1
    assert 5 in inserts[0] and WHEN in inserts[0]


def test_flagged_object_still_present_is_removed_again():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a/b.txt")
    db.flagged[("agrimarket-docs", "a/b.txt", "e1")] = ("infected", "Eicar-Test-Signature")
    assert run_once(s3, db, cfg, scan=pytest.fail) == 1
    steps = [e[0] for e in log if e[0] in ("copy", "record", "remove")]
    assert steps == ["copy", "record", "remove"]
    assert ops(log, "record")[0][1] == ["event"]
    assert any("already_flagged" in str(p) for _, p in db.statements)
    assert "a/b.txt" not in s3.buckets["agrimarket-docs"]


def test_identical_reupload_of_flagged_content_is_quarantined():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    assert run_once(s3, db, cfg, scan=infected) == 1
    db.flagged[("agrimarket-docs", "a.txt", "e1")] = ("infected", "Eicar-Test-Signature")
    s3.put("agrimarket-docs", "a.txt")  # same key, same etag
    assert run_once(s3, db, cfg, scan=pytest.fail) == 1
    assert "a.txt" not in s3.buckets["agrimarket-docs"]
    assert len(ops(log, "remove")) == 2


def test_clean_row_still_skips():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    db.seen.add(("agrimarket-docs", "a.txt", "e1"))
    assert run_once(s3, db, cfg, scan=pytest.fail) == 0
    assert ops(log, "copy") == [] and ops(log, "remove") == [] and ops(log, "record") == []


def test_oversized_object_quarantined_without_scan():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "big.bin", data=b"x" * 10)
    original = s3.list_objects

    def big_list(bucket, recursive=False):
        for o in original(bucket, recursive):
            o.size = MAX_SCAN_BYTES + 1
            yield o

    s3.list_objects = big_list
    assert run_once(s3, db, cfg, scan=pytest.fail) == 1
    assert s3.get_headers == []
    assert "big.bin" not in s3.buckets["agrimarket-docs"]
    assert "agrimarket-docs/big.bin" in s3.buckets["dxos-quarantine"]
    assert any("INSTREAM size limit exceeded" in str(p) for _, p in db.statements)


def test_get_uses_if_match_on_listed_etag():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt", etag='"abc"')
    run_once(s3, db, cfg, scan=clean)
    assert s3.get_headers == [{"If-Match": '"abc"'}]


def test_precondition_failed_records_nothing():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    s3.precondition_failed = True
    assert run_once(s3, db, cfg, scan=pytest.fail) == 0
    assert db.seen == set() and ops(log, "record") == [] and ops(log, "remove") == []


def test_skip_path_leaves_no_open_transaction():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    db.seen.add(("agrimarket-docs", "a.txt", "e1"))
    assert run_once(s3, db, cfg, scan=pytest.fail) == 0
    assert db.txn_count == 0 and not db.in_txn and db.pending == []


def test_clean_row_with_same_last_modified_is_skipped():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    db.seen.add(("agrimarket-docs", "a.txt", "e1"))
    db.seen_at[("agrimarket-docs", "a.txt", "e1")] = WHEN
    assert run_once(s3, db, cfg, scan=pytest.fail) == 0


def test_clean_row_with_new_last_modified_is_rescanned():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    db.seen.add(("agrimarket-docs", "a.txt", "e1"))
    db.seen_at[("agrimarket-docs", "a.txt", "e1")] = datetime(2025, 1, 1, tzinfo=timezone.utc)
    assert run_once(s3, db, cfg, scan=infected) == 1  # same etag, newer LastModified: scanned, now infected
    assert "a.txt" not in s3.buckets["agrimarket-docs"]
    assert any("do update set" in s.lower() for s, _ in db.statements)


def test_remove_skipped_when_source_etag_changed_after_scan():
    s3, db, cfg, log = make()
    s3.put("agrimarket-docs", "a.txt")
    s3.replace_on_stat["a.txt"] = '"e2"'
    assert run_once(s3, db, cfg, scan=infected) == 1
    assert ops(log, "remove") == []
    assert "a.txt" in s3.buckets["agrimarket-docs"]
    # next round the replacement (new etag, new content) is scanned on its own
    s3.replace_on_stat.clear()
    assert run_once(s3, db, cfg, scan=clean) == 1
    assert ("agrimarket-docs", "a.txt", "e2") in db.seen
