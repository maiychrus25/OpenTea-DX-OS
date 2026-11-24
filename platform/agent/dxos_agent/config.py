# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Configuration for the dxos-agent service."""
from dataclasses import dataclass, field
import os
from pathlib import Path

DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5"


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
    # Provider keys stay out of repr() so a logged Config cannot leak them.
    anthropic_api_key: str = field(default="", repr=False)
    anthropic_model: str = DEFAULT_ANTHROPIC_MODEL
    anthropic_api_base: str = "https://api.anthropic.com"
    openai_api_key: str = field(default="", repr=False)
    openai_model: str = ""
    openai_api_base: str = "https://api.openai.com"

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
            anthropic_api_key=env.get("ANTHROPIC_API_KEY", "").strip(),
            anthropic_model=env.get("DXOS_ANTHROPIC_MODEL", "").strip() or DEFAULT_ANTHROPIC_MODEL,
            anthropic_api_base=env.get("ANTHROPIC_API_BASE", "").strip() or "https://api.anthropic.com",
            openai_api_key=env.get("OPENAI_API_KEY", "").strip(),
            openai_model=env.get("DXOS_OPENAI_MODEL", "").strip(),
            openai_api_base=env.get("OPENAI_API_BASE", "").strip() or "https://api.openai.com",
        )
