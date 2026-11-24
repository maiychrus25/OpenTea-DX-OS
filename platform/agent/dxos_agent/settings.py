# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Per-cooperative agent settings read from the web once per cycle (contract C1), and the provider choice."""
from dataclasses import dataclass, field
from datetime import time
import logging
import re
from typing import Any, Mapping

from .client import CoreGatewayClient
from .providers import LLMProvider

log = logging.getLogger("dxos_agent")

OLLAMA = "ollama"
DEFAULT_REPORT_TIME = "18:00"
_REPORT_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_KNOWN_PROVIDERS = (OLLAMA, "anthropic", "openai")


@dataclass(frozen=True)
class AgentChoice:
    provider: str = OLLAMA
    model: str | None = None


@dataclass(frozen=True)
class AgentSettings:
    agents: Mapping[str, AgentChoice] = field(default_factory=dict)
    report_time: str = DEFAULT_REPORT_TIME
    # Unknown budget counts as spent: external providers are only used when the web says the budget allows it.
    budget_exhausted: bool = True

    def choice_for(self, agent: str) -> AgentChoice:
        return self.agents.get(agent, AgentChoice())

    def report_time_of_day(self) -> time:
        hour, minute = self.report_time.split(":")
        return time(int(hour), int(minute))

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "AgentSettings":
        agents: dict[str, AgentChoice] = {}
        for name, item in (payload.get("agents") or {}).items():
            if not isinstance(item, Mapping):
                continue
            provider = item.get("provider")
            model = item.get("model")
            if not isinstance(model, str) or not model.strip():
                model = None
            agents[str(name)] = AgentChoice(
                provider=provider if provider in _KNOWN_PROVIDERS else OLLAMA,
                model=model.strip() if model else None,
            )
        report_time = payload.get("report_time")
        budget = payload.get("budget") or {}
        return cls(
            agents=agents,
            report_time=report_time if isinstance(report_time, str) and _REPORT_TIME_RE.match(report_time) else DEFAULT_REPORT_TIME,
            budget_exhausted=budget.get("exhausted") is not False,
        )


def fetch_settings(gateway: CoreGatewayClient) -> AgentSettings:
    """Read the settings; on any failure the cycle runs on Ollama with the default report time."""
    try:
        return AgentSettings.from_payload(gateway.get_settings())
    except Exception:
        log.warning("Agent settings unavailable; using Ollama defaults for this cycle")
        return AgentSettings()


def choose_providers(
    settings: AgentSettings,
    agent: str,
    providers: Mapping[str, LLMProvider],
) -> tuple[LLMProvider, LLMProvider | None]:
    """Primary provider for one run and the fallback after it. Ollama is the last LLM step; the rules come after that."""
    internal = providers[OLLAMA]
    choice = settings.choice_for(agent)
    external = providers.get(choice.provider)
    if choice.provider == OLLAMA or external is None or settings.budget_exhausted:
        return internal, None
    # Each run sets the model it uses; the provider object keeps its rate-limit state across runs.
    external.model = choice.model or external.default_model
    if not external.model:
        return internal, None
    return external, internal
