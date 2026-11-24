# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Entrypoint for the dxos-telegram milestone M0 skeleton service."""
import logging
import signal
import threading
from pathlib import Path

from .config import Config

log = logging.getLogger("dxos_telegram")


def main(stop: threading.Event | None = None) -> None:
    """Run the skeleton heartbeat loop until a termination signal arrives."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = Config.from_env()
    stop = stop or threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    heartbeat = Path(cfg.heartbeat_path)
    log.info("dxos-telegram skeleton started (milestone M0): no Telegram connection yet")

    while not stop.is_set():
        heartbeat.touch()
        stop.wait(cfg.interval_seconds)


if __name__ == "__main__":
    main()
