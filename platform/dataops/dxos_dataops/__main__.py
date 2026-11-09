# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import argparse
import logging
import signal
import threading

import psycopg

from .config import Config


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dxos_dataops")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("ingest", help="consume MQTT sensor readings into Postgres")
    sim = sub.add_parser("simulate", help="publish simulated sensor readings")
    sim.add_argument("--backfill-days", type=int, help="publish history from now-N days to now-1 day, then exit")
    sim.add_argument("--step-minutes", type=int, default=60)
    return parser


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


if __name__ == "__main__":
    main()
