# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Configuration for the dxos-agent service."""
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    """Runtime settings for the agent heartbeat loop."""

    interval_seconds: float
    heartbeat_path: str

    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        env = os.environ
        return cls(
            interval_seconds=float(env.get("DXOS_AGENT_INTERVAL_SECONDS", "30")),
            heartbeat_path=env.get("DXOS_HEARTBEAT_PATH", "/tmp/dxos-agent.heartbeat"),
        )
