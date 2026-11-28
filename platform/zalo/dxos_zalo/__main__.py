# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Entrypoint for dxos-zalo: starts the relay once the client credentials exist; without them it idles and stays healthy."""
import logging
import signal
import threading
import time
from pathlib import Path
from typing import Optional

from .auth import KeycloakTokenClient, load_credentials
from .config import Config
from .gateway import WebGateway
from .relay import OaTokens, Relay
from .zns_api import ZnsApi

log = logging.getLogger("dxos_zalo")
CREDENTIALS_FILE = "zalo.env"


def start_relay(cfg: Config) -> Optional[Relay]:
    """Build and start the relay, or return None while the credentials file is missing. OA tokens come later, from the web."""
    try:
        credentials = load_credentials(Path(cfg.env_dir) / CREDENTIALS_FILE)
    except (OSError, ValueError):
        return None
    tokens = KeycloakTokenClient(cfg.keycloak_url, credentials)
    web = WebGateway(cfg.gateway_url, tokens.get_token)
    zns = ZnsApi(cfg.api_base, cfg.oauth_url, cfg.app_id, cfg.app_secret)
    relay = Relay(zns, web, cfg.version, OaTokens(web, zns, time.time))
    relay.start()
    log.info("dxos-zalo relay started")
    return relay


def main(stop: threading.Event | None = None) -> None:
    """Touch the heartbeat every interval; start the relay when it can, and stop it on a termination signal."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = Config.from_env()
    stop = stop or threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    heartbeat = Path(cfg.heartbeat_path)
    relay: Optional[Relay] = None
    while not stop.is_set():
        heartbeat.touch()
        if relay is None:
            relay = start_relay(cfg)
        stop.wait(cfg.interval_seconds)
    if relay is not None:
        relay.stop()
    log.info("dxos-zalo stopped")


if __name__ == "__main__":
    main()
