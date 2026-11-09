# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Run SQL over the Parquet lake through the view sensor_readings_cold."""
import logging
import tempfile
from pathlib import Path

import duckdb

from .config import Config

log = logging.getLogger("dxos_query")

PREFIX = "telemetry/sensor_readings/"
EMPTY_VIEW = """
create view sensor_readings_cold as select
  null::varchar htx_code, null::varchar parcel_code, null::varchar sensor, null::timestamp ts,
  null::double value, null::timestamp ingested_at, null::varchar htx, null::date date
where false"""


def _quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _create_view(con, glob: str) -> None:
    con.execute(f"create or replace view sensor_readings_cold as select * from read_parquet({_quote(glob)}, hive_partitioning = true)")


def _attach_httpfs(con, cfg: Config) -> None:
    con.execute("load httpfs")
    for name, value in (
        ("s3_endpoint", cfg.s3_endpoint), ("s3_access_key_id", cfg.s3_access_key), ("s3_secret_access_key", cfg.s3_secret_key),
        ("s3_url_style", "path"),
    ):
        con.execute(f"set {name} = {_quote(value)}")
    con.execute("set s3_use_ssl = false")


def _run_over_download(s3, cfg: Config, con, keys: list[str], sql: str) -> list[tuple]:
    with tempfile.TemporaryDirectory() as tmp:
        for key in keys:
            local = Path(tmp) / key
            local.parent.mkdir(parents=True, exist_ok=True)
            s3.fget_object(cfg.lake_bucket, key, str(local))
        _create_view(con, f"{tmp}/{PREFIX}*/*/*.parquet")
        return con.execute(sql).fetchall()


def run_query(s3, cfg: Config, sql: str) -> list[tuple]:
    keys = []
    if s3.bucket_exists(cfg.lake_bucket):
        keys = [o.object_name for o in s3.list_objects(cfg.lake_bucket, prefix=PREFIX, recursive=True) if o.object_name.endswith(".parquet")]
    con = duckdb.connect(":memory:")
    try:
        if not keys:
            con.execute(EMPTY_VIEW)
            return con.execute(sql).fetchall()
        try:
            _attach_httpfs(con, cfg)
            _create_view(con, f"s3://{cfg.lake_bucket}/{PREFIX}*/*/*.parquet")
            return con.execute(sql).fetchall()
        except duckdb.IOException:
            log.warning("httpfs cannot read the lake, downloading %d objects to a temporary directory", len(keys))
            return _run_over_download(s3, cfg, con, keys, sql)
    finally:
        con.close()
