# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""A10 measurement: adopted improvements are measured after 2 and 4 weeks against their baseline (contract C4)."""
from datetime import datetime
import json
from pathlib import Path
from typing import Any, Mapping

import pytest

from dxos_agent.agents.improvement import run_improvement
from dxos_agent.client import GatewayHTTPError

SCENARIOS = Path(__file__).parent / "scenarios"
NOW = datetime.fromisoformat("2026-11-30T00:00:00+00:00")  # 07:00 on Monday 30 November in Vietnam
BASE_INPUTS: dict[str, Any] = {
    "week": "2026-11-30",
    "settings": {},
    "proposal_stats": [],
    "journal_review": {"window_days": 28, "reviewed": 0, "returned_missing_info": 0},
    "campaign_goals": [],
    "improvements": [],
    "metrics": {},
}


class MeasureGateway:
    """Serves the inputs and records each effect A10 posts; `effect_error` is raised by the first effect post."""

    def __init__(self, inputs: Mapping[str, Any], effect_error: Exception | None = None) -> None:
        self._inputs = inputs
        self._effect_error = effect_error
        self.runs_started: list[dict[str, Any]] = []
        self.runs_finished: list[dict[str, Any]] = []
        self.effects: list[tuple[str, dict[str, Any]]] = []

    def get_improvement_inputs(self, week: str) -> dict[str, Any]:
        del week
        return json.loads(json.dumps(self._inputs))

    def start_run(self, **kwargs: Any) -> str:
        self.runs_started.append(kwargs)
        return f"run-{len(self.runs_started)}"

    def finish_run(self, run_id: str, status: str, **kwargs: Any) -> None:
        self.runs_finished.append({"id": run_id, "status": status, **kwargs})

    def post_improvement_effect(self, improvement_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
        self.effects.append((improvement_id, dict(body)))
        if self._effect_error is not None:
            raise self._effect_error
        return {"id": improvement_id}


def _cases() -> list[Any]:
    cases = json.loads((SCENARIOS / "a10_improvement_measurement.json").read_text(encoding="utf-8"))
    return [pytest.param(case, id=case["name"]) for case in cases]


@pytest.mark.parametrize("case", _cases())
def test_measurement_scenario(case: dict[str, Any]) -> None:
    gateway = MeasureGateway({**BASE_INPUTS, **case["inputs"]})

    outcome = run_improvement(gateway, NOW, [])

    assert outcome.status == "done"
    posted = [{"id": imp_id, **body} for imp_id, body in gateway.effects]
    assert posted == case["expect"]
    assert bool(gateway.runs_started) == bool(case["expect"])  # nothing measured: no run row
    if case["expect"]:
        assert gateway.runs_finished[-1]["status"] == "ok"


def test_refused_effect_ends_the_week_with_a_failed_run() -> None:
    inputs = {
        **BASE_INPUTS,
        "improvements": [{"id": "i1", "kind": "setting", "metric_key": "m", "status": "adopted", "baseline": 0.5, "adopted_at": "2026-11-01T00:00:00Z", "effect": {}}],
        "metrics": {"m": 0.4},
    }
    gateway = MeasureGateway(inputs, effect_error=GatewayHTTPError("Gateway POST failed (409): already measured", 409))

    outcome = run_improvement(gateway, NOW, [])

    assert outcome.status == "refused"
    assert gateway.runs_finished[-1]["status"] == "failed"
