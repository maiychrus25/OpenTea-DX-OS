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
# Defaults of the M4 agents' thresholds (contract C6 of the M4 plan). The web may override any key per cooperative.
THRESHOLD_DEFAULTS: dict[str, dict[str, Any]] = {
    "field-watch": {
        "silent_hours": 6,
        "dry_soil_pct": 35,
        "heat_c": 35,
        "frost_c": 4,
        "heavy_rain_mm": 15,
        "spray_lookback_days": 2,
        "forecast_days": 2,
        "fresh_reading_hours": 2,
    },
    "disease-watch": {"radius_m": 2000, "window_days": 7, "min_reports": 3},
    "harvest-ready": {"harvest_window_days": 3},
    "bulletin": {"commodity": "Tea", "market_hours": 48},
}


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
    thresholds: Mapping[str, Mapping[str, Any]] = field(default_factory=dict)

    def choice_for(self, agent: str) -> AgentChoice:
        return self.agents.get(agent, AgentChoice())

    def thresholds_for(self, agent: str) -> dict[str, Any]:
        """The agent's defaults, with each key the web set to a value of the same type replacing its default."""
        given = self.thresholds.get(agent) or {}
        return {key: _typed(given.get(key), default) for key, default in THRESHOLD_DEFAULTS.get(agent, {}).items()}

    def report_time_of_day(self) -> time:
        hour, minute = self.report_time.split(":")
        return time(int(hour), int(minute))

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "AgentSettings":
        agents: dict[str, AgentChoice] = {}
        thresholds: dict[str, Mapping[str, Any]] = {}
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
            if isinstance(item.get("thresholds"), Mapping):
                thresholds[str(name)] = item["thresholds"]
        report_time = payload.get("report_time")
        budget = payload.get("budget") or {}
        return cls(
            agents=agents,
            report_time=report_time if isinstance(report_time, str) and _REPORT_TIME_RE.match(report_time) else DEFAULT_REPORT_TIME,
            budget_exhausted=budget.get("exhausted") is not False,
            thresholds=thresholds,
        )


def _typed(value: Any, default: Any) -> Any:
    """A web value of the default's type, else the default (a bool is not an integer here)."""
    if isinstance(default, str):
        return value.strip() if isinstance(value, str) and value.strip() else default
    return value if isinstance(value, int) and not isinstance(value, bool) else default


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
