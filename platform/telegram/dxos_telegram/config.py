# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Configuration for the dxos-telegram service."""
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    """Runtime settings for the Telegram relay and its heartbeat loop."""

    interval_seconds: float
    heartbeat_path: str
    bot_token: str = ""
    api_base: str = "https://api.telegram.org"
    gateway_url: str = "http://apisix:9081"
    keycloak_url: str = "http://keycloak:8080/realms/agrimarket"
    env_dir: Path = Path("/run/dxos-telegram")
    version: str = "dev"
    web_public_url: str = ""
    stt_url: str = "http://dxos-stt:8080"

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        env = os.environ
        return cls(
            interval_seconds=float(env.get("DXOS_TELEGRAM_INTERVAL_SECONDS", "30")),
            heartbeat_path=env.get("DXOS_HEARTBEAT_PATH", "/tmp/dxos-telegram.heartbeat"),
            bot_token=env.get("TELEGRAM_BOT_TOKEN", "").strip(),
            api_base=env.get("TELEGRAM_API_BASE", "https://api.telegram.org").rstrip("/"),
            gateway_url=env.get("DXOS_GATEWAY_URL", "http://apisix:9081"),
            keycloak_url=env.get("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080/realms/agrimarket"),
            env_dir=Path(env.get("DXOS_TELEGRAM_ENV_DIR", "/run/dxos-telegram")),
            version=env.get("DXOS_TELEGRAM_VERSION", "dev"),
            web_public_url=env.get("DXOS_WEB_PUBLIC_URL", "").strip().rstrip("/"),
            stt_url=env.get("DXOS_STT_URL", "http://dxos-stt:8080").strip().rstrip("/"),
        )
