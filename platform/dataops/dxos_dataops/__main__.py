# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import argparse
import logging
import signal
import threading
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from minio import Minio

from .config import Config

log = logging.getLogger("dxos_dataops")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dxos_dataops")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("ingest", help="consume MQTT sensor readings into Postgres")
    sim = sub.add_parser("simulate", help="publish simulated sensor readings")
    sim.add_argument("--backfill-days", type=int, help="publish history from now-N days to now-1 day, then exit")
    sim.add_argument("--step-minutes", type=int, default=60)
    life = sub.add_parser("lifecycle", help="archive aged sensor readings to the Parquet lake")
    life.add_argument("--once", action="store_true", help="run one round and exit; exit status 1 if a partition failed")
    q = sub.add_parser("query", help="run SQL over the Parquet lake (view sensor_readings_cold)")
    q.add_argument("sql")
    return parser


def make_s3(cfg: Config) -> Minio:
    return Minio(cfg.s3_endpoint, access_key=cfg.s3_access_key, secret_key=cfg.s3_secret_key, secure=False)


def run_lifecycle(cfg: Config, stop: threading.Event, once: bool) -> None:
    from . import lifecycle

    s3 = make_s3(cfg)
    connect_db = lambda: psycopg.connect(cfg.db_url, autocommit=True, application_name="dxos-lifecycle")  # noqa: E731
    if once:
        with connect_db() as db:
            if lifecycle.run_once(s3, db, cfg, datetime.now(timezone.utc), stop.is_set):
                raise SystemExit(1)
        return

    heartbeat = Path(cfg.heartbeat_path)

    def alive() -> bool:  # called per partition, so long rounds still refresh the heartbeat
        heartbeat.touch()
        return stop.is_set()

    db = None
    while not stop.is_set():
        try:
            if db is None or db.closed:
                db = connect_db()
            failed = lifecycle.run_once(s3, db, cfg, datetime.now(timezone.utc), alive)
            if failed:
                log.warning("%d partitions failed this round and will be retried", failed)
            heartbeat.touch()
        except Exception:
            log.exception("lifecycle round failed")
            if db is not None:
                db.close()
                db = None
        stop.wait(cfg.interval_seconds)


def main(argv=None, stop: threading.Event | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_parser().parse_args(argv)
    cfg = Config.from_env()
    stop = stop or threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())

    if args.command == "ingest":
        from .ingest import Worker, make_client

        if not cfg.mqtt_ingest_password:
            raise SystemExit("DXOS_MQTT_INGEST_PASSWORD is required")
        connect_db = lambda: psycopg.connect(cfg.db_url, autocommit=True, application_name="dxos-ingest")  # noqa: E731
        Worker(cfg, lambda: make_client(cfg), connect_db).run(stop)
    elif args.command == "simulate":
        from . import simulate

        connect_db = lambda: psycopg.connect(cfg.db_url, autocommit=True, application_name="dxos-simulate")  # noqa: E731
        simulate.run(cfg, connect_db, stop, args.backfill_days, args.step_minutes)
    elif args.command == "lifecycle":
        run_lifecycle(cfg, stop, args.once)
    elif args.command == "query":
        from .query import run_query

        for row in run_query(make_s3(cfg), cfg, args.sql):
            print("\t".join(str(v) for v in row))


if __name__ == "__main__":
    main()
