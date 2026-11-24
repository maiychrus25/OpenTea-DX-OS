# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Configuration for the dxos-agent service."""
from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Config:
    """Runtime settings for the agent runner and heartbeat loop."""

    interval_seconds: float
    heartbeat_path: str
    gateway_url: str = "http://apisix:9081"
    keycloak_url: str = "http://keycloak:8080/realms/agrimarket"
    env_dir: Path = Path("/run/dxos-agent")
    provider_name: str = "ollama"
    llm_model: str = "qwen2.5:0.5b"
    replay_dir: Path | None = None

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        env = os.environ
        replay_raw = env.get("DXOS_AGENT_REPLAY_DIR", "").strip()
        return cls(
            interval_seconds=float(env.get("DXOS_AGENT_INTERVAL_SECONDS", "30")),
            heartbeat_path=env.get("DXOS_HEARTBEAT_PATH", "/tmp/dxos-agent.heartbeat"),
            gateway_url=env.get("DXOS_GATEWAY_URL", "http://apisix:9081"),
            keycloak_url=env.get("KEYCLOAK_INTERNAL_URL", "http://keycloak:8080/realms/agrimarket"),
            env_dir=Path(env.get("DXOS_AGENT_ENV_DIR", "/run/dxos-agent")),
            provider_name=env.get("DXOS_AGENT_PROVIDER", "ollama"),
            llm_model=env.get("DXOS_LLM_MODEL", "qwen2.5:0.5b"),
            replay_dir=Path(replay_raw) if replay_raw else None,
        )
