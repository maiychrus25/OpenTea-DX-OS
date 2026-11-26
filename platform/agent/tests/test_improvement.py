# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""A10 (improvement): fixed rules pick the improvements, the LLM only words them, refusals end the week."""
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Mapping

import pytest

from dxos_agent.agents.improvement import run_improvement
from dxos_agent.client import GatewayHTTPError
from dxos_agent.providers import ProviderError, ReplayProvider

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


class ImprovementGateway:
    """Serves the inputs and records what A10 posts; `post_errors` holds one entry per post, None for success."""

    def __init__(self, inputs: Mapping[str, Any], post_errors: list[Exception | None] | None = None) -> None:
        self._inputs = dict(inputs)
        self._post_errors = list(post_errors or [])
        self.weeks: list[str] = []
        self.runs_started: list[dict[str, Any]] = []
        self.runs_finished: list[dict[str, Any]] = []
        self.posted: list[dict[str, Any]] = []
        self.effects: list[tuple[str, dict[str, Any]]] = []

    def get_improvement_inputs(self, week: str) -> dict[str, Any]:
        self.weeks.append(week)
        return json.loads(json.dumps(self._inputs))

    def start_run(self, **kwargs: Any) -> str:
        self.runs_started.append(kwargs)
        return f"run-{len(self.runs_started)}"

    def finish_run(self, run_id: str, status: str, **kwargs: Any) -> None:
        self.runs_finished.append({"id": run_id, "status": status, **kwargs})

    def post_improvement(self, body: Mapping[str, Any]) -> dict[str, Any]:
        self.posted.append(dict(body))
        error = self._post_errors.pop(0) if self._post_errors else None
        if error is not None:
            raise error
        return {"id": f"imp-{len(self.posted)}", "proposal_id": f"p-{len(self.posted)}"}

    def post_improvement_effect(self, improvement_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
        self.effects.append((improvement_id, dict(body)))
        return {"id": improvement_id}


class FailingProvider(ReplayProvider):
    """An external provider whose every call fails, as when its key or network is down."""

    name = "anthropic"
    external = True

    def _generate(self, messages, schema):
        del messages, schema
        raise ProviderError("upstream unavailable")


def _inputs(overrides: Mapping[str, Any]) -> dict[str, Any]:
    return {**json.loads(json.dumps(BASE_INPUTS)), **overrides}


def _chain(case: Mapping[str, Any]) -> list[ReplayProvider]:
    if case.get("primary_error"):
        return [FailingProvider(fixtures={})]
    if "replay" in case:
        return [ReplayProvider(fixtures={"default": case["replay"]})]
    return []


def _cases() -> list[Any]:
    cases = json.loads((SCENARIOS / "a10_improvement.json").read_text(encoding="utf-8"))
    return [pytest.param(case, id=case["name"]) for case in cases]


@pytest.mark.parametrize("case", _cases())
def test_rule_scenario(case: dict[str, Any]) -> None:
    gateway = ImprovementGateway(_inputs(case.get("inputs", {})))

    outcome = run_improvement(gateway, NOW, _chain(case))

    expect = case["expect"]
    assert gateway.weeks == ["2026-11-30"]
    assert outcome.status == "done"
    assert [body["metric_key"] for body in gateway.posted] == expect["metric_keys"]
    assert bool(gateway.runs_started) == bool(expect["metric_keys"])  # nothing to propose: no run row, as A9 does
    for key, value in expect.get("first", {}).items():
        assert gateway.posted[0].get(key) == value


def test_rationale_is_trimmed_to_600_characters() -> None:
    gateway = ImprovementGateway(_inputs({"journal_review": {"window_days": 28, "reviewed": 10, "returned_missing_info": 4}}))

    run_improvement(gateway, NOW, [ReplayProvider(fixtures={"default": {"rationale_vi": "A" * 700}})])

    assert len(gateway.posted[0]["rationale_vi"]) == 600


def test_refused_proposal_ends_the_week_and_posts_nothing_more() -> None:
    inputs = _inputs({
        "journal_review": {"window_days": 28, "reviewed": 10, "returned_missing_info": 4},
        "campaign_goals": [{"goal_key": "harvest", "days": 14, "missed_days": 3}],
    })
    refusal = GatewayHTTPError("Gateway POST failed (400): IMPROVEMENT_RANGE", 400)
    gateway = ImprovementGateway(inputs, post_errors=[refusal])

    outcome = run_improvement(gateway, NOW, [])

    assert outcome.status == "refused"
    assert len(gateway.posted) == 1  # the second improvement is not sent this week
    assert gateway.runs_finished[-1]["status"] == "failed"
    assert "IMPROVEMENT_RANGE" in gateway.runs_finished[-1]["error"]


@pytest.mark.parametrize("error", [GatewayHTTPError("Gateway POST failed (409): dup", 409)], ids=["conflict"])
def test_conflict_refusal_is_reported_as_refused(error: Exception) -> None:
    inputs = _inputs({"journal_review": {"window_days": 28, "reviewed": 10, "returned_missing_info": 4}})
    gateway = ImprovementGateway(inputs, post_errors=[error])

    assert run_improvement(gateway, NOW, []).status == "refused"


@pytest.mark.parametrize(
    "error",
    [GatewayHTTPError("Gateway POST failed (500): boom", 500), GatewayHTTPError("Gateway POST failed (401): expired", 401), ConnectionError("network down")],
    ids=["server-error", "expired-token", "network-error"],
)
def test_other_failures_raise_so_the_next_cycle_retries(error: Exception) -> None:
    inputs = _inputs({"journal_review": {"window_days": 28, "reviewed": 10, "returned_missing_info": 4}})
    gateway = ImprovementGateway(inputs, post_errors=[error])

    with pytest.raises(type(error)):
        run_improvement(gateway, NOW, [])

    assert gateway.runs_finished[-1]["status"] == "failed"


def test_deduped_answer_counts_as_done_without_error() -> None:
    inputs = _inputs({"journal_review": {"window_days": 28, "reviewed": 10, "returned_missing_info": 4}})

    class DedupeGateway(ImprovementGateway):
        def post_improvement(self, body):
            self.posted.append(dict(body))
            return {"deduped": True}

    gateway = DedupeGateway(inputs)

    assert run_improvement(gateway, NOW, []).status == "done"
    assert len(gateway.posted) == 1
