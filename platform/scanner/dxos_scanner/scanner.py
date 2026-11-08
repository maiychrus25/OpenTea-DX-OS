# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""One scan round: list, scan unseen objects with clamd, quarantine what is not clean."""
import json
import logging
from typing import Callable

from minio.commonconfig import CopySource

from .clamd import ScanResult, scan_stream
from .config import MAX_SCAN_BYTES, Config
from .decision import Action, decide

log = logging.getLogger("dxos_scanner")
CHUNK = 65536


def run_once(s3, db, cfg: Config, scan=scan_stream, should_stop: Callable[[], bool] = lambda: False) -> int:
    recorded = 0
    for bucket in cfg.buckets:
        if bucket == cfg.quarantine_bucket:
            continue
        try:
            if not s3.bucket_exists(bucket):
                continue
            objects = list(s3.list_objects(bucket, recursive=True))
        except Exception:
            log.exception("cannot list bucket %s", bucket)
            continue
        for obj in objects:
            if should_stop():
                return recorded
            try:
                recorded += _process(s3, db, cfg, scan, bucket, obj)
            except Exception:  # vanished object, clamd/S3/DB fault: record nothing, retry next round
                log.exception("skipping %s/%s this round", bucket, obj.object_name)
    return recorded


def _process(s3, db, cfg: Config, scan, bucket: str, obj) -> int:
    key = obj.object_name
    etag = (obj.etag or "").strip('"')
    row = db.execute(
        "select status, signature from audit.file_scans where bucket = %s and key = %s and etag = %s", (bucket, key, etag)
    ).fetchone()
    flagged = row is not None and row[0] != "clean"
    if row is not None and not flagged:
        return 0
    if flagged:  # known-bad content still (or again) in the source bucket: quarantine without re-scanning
        result = ScanResult(row[0], row[1])
    elif obj.size > MAX_SCAN_BYTES:  # clamd would drop the stream at StreamMaxLength; never scannable
        result = ScanResult("unscannable", "INSTREAM size limit exceeded")
    else:
        # If-Match pins the read to the listed etag, so the recorded etag is the one actually scanned.
        response = s3.get_object(bucket, key, request_headers={"If-Match": f'"{etag}"'})
        try:
            result = scan(cfg.clamd_host, cfg.clamd_port, response.stream(CHUNK))
        finally:
            response.close()
            response.release_conn()
    quarantine = decide(result) is Action.QUARANTINE
    if quarantine:
        dst = f"{bucket}/{key}"
        if not s3.bucket_exists(cfg.quarantine_bucket):
            s3.make_bucket(cfg.quarantine_bucket)
        s3.copy_object(cfg.quarantine_bucket, dst, CopySource(bucket, key, match_etag=etag))
    with db.transaction():
        if not flagged:
            db.execute(
                "insert into audit.file_scans (bucket, key, etag, status, signature, size_bytes, uploaded_at) "
                "values (%s, %s, %s, %s, %s, %s, %s) on conflict do nothing",
                (bucket, key, etag, result.status, result.signature, obj.size, obj.last_modified),
            )
        if quarantine:
            details = {"status": result.status, "signature": result.signature, "etag": etag, "size_bytes": obj.size}
            if flagged:
                details["reason"] = "already_flagged"
            db.execute(
                "select audit.record_event('scanner', 'QUARANTINE', %s, %s::jsonb)",
                (f"{bucket}/{key}", json.dumps(details)),
            )
    if quarantine:
        s3.remove_object(bucket, key)
        log.warning("quarantined %s/%s (%s)", bucket, key, result.signature or result.status)
    return 1
