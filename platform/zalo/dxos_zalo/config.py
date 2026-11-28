# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Configuration for the dxos-zalo service."""
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    """Runtime settings for the Zalo relay and its heartbeat loop."""

    interval_seconds: float
    heartbeat_path: str
    api_base: str = "https://business.openapi.zalo.me"
    oauth_url: str = "https://oauth.zaloapp.com/v4/oa/access_token"
    app_id: str = ""
    app_secret: str = ""
    gateway_url: str = "http://apisix:9081"
    keycloak_url: str = "http://keycloak:8080/realms/agrimarket"
    env_dir: Path = Path("/run/dxos-zalo")
    version: str = "dev"

    @classmethod
    def from_env(cls) -> "Config":
        env = os.environ
        return cls(
            interval_seconds=float(env.get("DXOS_ZALO_INTERVAL_SECONDS", "30")),
            heartbeat_path=env.get("DXOS_HEARTBEAT_PATH", "/tmp/dxos-zalo.heartbeat"),
            api_base=env.get("ZALO_API_BASE", "https://business.openapi.zalo.me").strip().rstrip("/"),
            oauth_url=env.get("ZALO_OAUTH_URL", "https://oauth.zaloapp.com/v4/oa/access_token").strip(),
            app_id=env.get("ZALO_APP_ID", "").strip(),
            app_secret=env.get("ZALO_APP_SECRET", "").strip(),
            gateway_url=env.get("DXOS_GATEWAY_URL", "http://apisix:9081"),
            keycloak_url=env.get("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080/realms/agrimarket"),
            env_dir=Path(env.get("DXOS_ZALO_ENV_DIR", "/run/dxos-zalo")),
            version=env.get("DXOS_ZALO_VERSION", "dev"),
        )
