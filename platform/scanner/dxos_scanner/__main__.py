# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import logging
import signal
import threading
from pathlib import Path

import psycopg
from minio import Minio

from .config import Config
from .scanner import run_once

log = logging.getLogger("dxos_scanner")


def main(stop: threading.Event | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = Config.from_env()
    stop = stop or threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    s3 = Minio(cfg.s3_endpoint, access_key=cfg.s3_access_key, secret_key=cfg.s3_secret_key, secure=False)
    db = None
    heartbeat = Path(cfg.heartbeat_path)

    def alive() -> bool:  # called per object, so long rounds still refresh the heartbeat
        heartbeat.touch()
        return stop.is_set()

    while not stop.is_set():
        try:
            if db is None or db.closed:
                db = psycopg.connect(cfg.db_url, autocommit=True, application_name="dxos-scanner")
            run_once(s3, db, cfg, should_stop=alive)
            heartbeat.touch()  # only healthy rounds refresh the heartbeat
        except Exception:
            log.exception("scan round failed")
            if db is not None:
                db.close()
                db = None
        stop.wait(cfg.interval_seconds)


if __name__ == "__main__":
    main()
