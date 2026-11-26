# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Entrypoint for dxos-telegram: starts the relay once a bot token and the client credentials are present."""
import logging
import signal
import threading
from pathlib import Path
from typing import Optional

from .auth import KeycloakTokenClient, load_credentials
from .bot_api import BotApi
from .config import Config
from .gateway import WebGateway
from .relay import Relay
from .stt import SttClient, SttError

log = logging.getLogger("dxos_telegram")
CREDENTIALS_FILE = "telegram.env"


def start_relay(cfg: Config) -> Optional[Relay]:
    """Build and start the relay, or return None while the token or the credentials file is missing."""
    if not cfg.bot_token:
        return None
    try:
        credentials = load_credentials(Path(cfg.env_dir) / CREDENTIALS_FILE)
    except (OSError, ValueError):
        return None
    tokens = KeycloakTokenClient(cfg.keycloak_url, credentials)
    try:
        stt: Optional[SttClient] = SttClient(cfg.stt_url)
    except SttError as exc:
        log.error("voice messages are off: %s", exc)  # never posts audio to a public host; text chat keeps working
        stt = None
    relay = Relay(BotApi(cfg.api_base, cfg.bot_token), WebGateway(cfg.gateway_url, tokens.get_token), cfg.version, cfg.web_public_url, stt)
    relay.start()
    log.info("dxos-telegram relay started")
    return relay


def main(stop: threading.Event | None = None) -> None:
    """Heartbeat every interval; start the relay when it can, and stop it on a termination signal."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = Config.from_env()
    stop = stop or threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    heartbeat = Path(cfg.heartbeat_path)
    relay: Optional[Relay] = None
    if not cfg.bot_token:
        log.info("TELEGRAM_BOT_TOKEN is not set: dxos-telegram idles (Telegram is optional)")

    while not stop.is_set():
        heartbeat.touch()
        if relay is None:
            relay = start_relay(cfg)
        stop.wait(cfg.interval_seconds)
    if relay is not None:
        relay.stop()
    log.info("dxos-telegram stopped")


if __name__ == "__main__":
    main()
