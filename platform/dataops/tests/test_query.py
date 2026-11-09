# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace

import duckdb
import pytest

from dxos_dataops import query
from dxos_dataops.config import Config

KEY = "telemetry/sensor_readings/htx=TC/date=2026-10-01/run.parquet"


class FakeS3:
    def __init__(self, objects=None, bucket=True):
        self.objects = objects or {}
        self.bucket = bucket

    def bucket_exists(self, bucket):
        return self.bucket

    def list_objects(self, bucket, prefix="", recursive=False):
        assert recursive
        return [SimpleNamespace(object_name=k) for k in self.objects if k.startswith(prefix)]

    def fget_object(self, bucket, key, path):
        Path(path).write_bytes(self.objects[key])


def cfg():
    return Config(
        db_url="x", s3_endpoint="minio:9000", s3_access_key="a'b", s3_secret_key="s", mqtt_host="h", mqtt_port=1883,
        mqtt_ingest_password="", devices={}, lake_bucket="dxos-lake", hot_retention_days=30, interval_seconds=1,
        heartbeat_path="/tmp/hb",
    )


def parquet_bytes(tmp_path, sensor="rainfall", value=1.5, ingested_at="2026-10-01 06:00:01"):
    path = tmp_path / "x.parquet"
    con = duckdb.connect(":memory:")
    con.execute(
        f"create table r as select 'TC' htx_code, 'P-TC-001' parcel_code, '{sensor}' sensor, "
        f"timestamp '2026-10-01 06:00:00' ts, {value}::double value, timestamp '{ingested_at}' ingested_at"
    )
    con.execute(f"copy r to '{path}' (format parquet, compression zstd)")
    con.close()
    return path.read_bytes()


def test_empty_lake_returns_no_rows():
    assert query.run_query(FakeS3(), cfg(), "select * from sensor_readings_cold") == []


def test_missing_bucket_returns_no_rows():
    assert query.run_query(FakeS3(bucket=False), cfg(), "select * from sensor_readings_cold") == []


def test_empty_view_is_typed():
    rows = query.run_query(
        FakeS3(), cfg(),
        "select column_name, column_type from (describe sensor_readings_cold) where column_name in ('ts', 'date', 'htx')",
    )
    assert sorted(rows) == [("date", "DATE"), ("htx", "VARCHAR"), ("ts", "TIMESTAMP")]


def test_falls_back_to_download_when_httpfs_cannot_read(tmp_path, monkeypatch):
    def fail(*_):
        raise duckdb.IOException("httpfs cannot read this store")

    monkeypatch.setattr(query, "_attach_httpfs", fail)
    s3 = FakeS3({KEY: parquet_bytes(tmp_path)})
    rows = query.run_query(s3, cfg(), "select htx, date, parcel_code, value from sensor_readings_cold")
    assert rows == [("TC", date(2026, 10, 1), "P-TC-001", 1.5)]


def test_non_io_error_is_not_retried(tmp_path, monkeypatch):
    monkeypatch.setattr(query, "_attach_httpfs", lambda *a: None)
    monkeypatch.setattr(query, "_create_view", lambda con, glob: con.execute(query.EMPTY_VIEW))
    s3 = FakeS3({KEY: parquet_bytes(tmp_path)})
    s3.fget_object = None  # a fallback would raise TypeError instead of the catalog error
    with pytest.raises(duckdb.Error) as exc:
        query.run_query(s3, cfg(), "select * from sensor_readings_cold where no_such_column = 1")
    assert not isinstance(exc.value, duckdb.IOException)


def test_timestamps_read_back_naive_utc(tmp_path, monkeypatch):
    def fail(*_):
        raise duckdb.IOException("x")

    monkeypatch.setattr(query, "_attach_httpfs", fail)
    rows = query.run_query(FakeS3({KEY: parquet_bytes(tmp_path)}), cfg(), "select ts from sensor_readings_cold")
    assert rows == [(datetime(2026, 10, 1, 6, 0),)]


def test_key_exported_to_two_files_counts_once(tmp_path, monkeypatch):
    def fail(*_):
        raise duckdb.IOException("x")

    monkeypatch.setattr(query, "_attach_httpfs", fail)
    prefix = "telemetry/sensor_readings/htx=TC/date=2026-10-01/"
    s3 = FakeS3({
        prefix + "a.parquet": parquet_bytes(tmp_path, value=9.9, ingested_at="2026-10-02 00:00:00"),  # the late copy
        prefix + "b.parquet": parquet_bytes(tmp_path),
        prefix + "c.parquet": parquet_bytes(tmp_path, sensor="air_humidity", value=70.0),
    })
    rows = query.run_query(s3, cfg(), "select sensor, value from sensor_readings_cold order by sensor")
    assert rows == [("air_humidity", 70.0), ("rainfall", 1.5)]
