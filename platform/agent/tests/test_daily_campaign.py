# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Scenario and unit tests for A9 (daily campaign): fixed candidates in, the posted campaign or no campaign out."""
from datetime import datetime
import json
from pathlib import Path
from typing import Any, Mapping

import pytest

from dxos_agent.agents.daily_campaign import run_daily_campaign
from dxos_agent.providers import ProviderError, ReplayProvider

SCENARIOS = Path(__file__).parent / "scenarios"
NOW = datetime.fromisoformat("2026-11-26T23:00:00+00:00")  # 06:00 on 27 November in Vietnam


class CampaignGateway:
    """Serves the candidates and records the run and the campaign the agent posts."""

    def __init__(self, candidates: Mapping[str, Any], post_answer: Mapping[str, Any] | None = None) -> None:
        self._candidates = candidates
        self._post_answer = dict(post_answer or {"id": "camp-1"})
        self.days: list[str] = []
        self.runs_started: list[dict[str, Any]] = []
        self.runs_finished: list[dict[str, Any]] = []
        self.posted: list[dict[str, Any]] = []

    def get_campaign_candidates(self, day: str) -> dict[str, Any]:
        self.days.append(day)
        return dict(self._candidates)

    def start_run(self, **kwargs: Any) -> str:
        self.runs_started.append(kwargs)
        return f"run-{len(self.runs_started)}"

    def finish_run(self, run_id: str, status: str, **kwargs: Any) -> None:
        self.runs_finished.append({"id": run_id, "status": status, **kwargs})

    def post_campaign(self, body: Mapping[str, Any]) -> dict[str, Any]:
        self.posted.append(dict(body))
        return dict(self._post_answer)


class FailingProvider(ReplayProvider):
    """An external provider whose every call fails, as when its key or network is down."""

    name = "anthropic"
    external = True

    def _generate(self, messages, schema):
        del messages, schema
        raise ProviderError("upstream unavailable")


class CountingProvider(ReplayProvider):
    """Counts the LLM calls it receives, so a test can prove none was made."""

    def __init__(self) -> None:
        super().__init__(fixtures={"default": {"summary_vi": "Không có việc."}})
        self.calls = 0

    def _generate(self, messages, schema):
        self.calls += 1
        return super()._generate(messages, schema)


def _chain(case: Mapping[str, Any]) -> list[ReplayProvider]:
    if case.get("primary_error"):
        return [FailingProvider(fixtures={})]
    return [ReplayProvider(fixtures={"default": case["replay_response"]})]


def _cases() -> list[Any]:
    cases = json.loads((SCENARIOS / "a9_daily_campaign.json").read_text(encoding="utf-8"))
    return [pytest.param(case, id=case["name"]) for case in cases]


@pytest.mark.parametrize("case", _cases())
def test_scenario_case(case: dict[str, Any]) -> None:
    gateway = CampaignGateway(case["candidates"])
    now = datetime.fromisoformat(case["now"].replace("Z", "+00:00"))

    outcome = run_daily_campaign(gateway, now, _chain(case))

    expected = case["expected"]
    assert gateway.days == ["2026-11-27"]
    assert len(gateway.runs_started) == 1
    assert gateway.runs_finished[-1]["status"] == "ok"
    if not expected["posted"]:
        assert outcome.status == "empty"
        assert gateway.posted == []
        return
    assert outcome.status == "posted"
    body = gateway.posted[0]
    assert body["day"] == "2026-11-27"
    assert body["run_id"] == "run-1"
    assert [item["proposal_id"] for item in body["items"]] == expected["items"]
    assert [item["position"] for item in body["items"]] == list(range(1, len(expected["items"]) + 1))
    assert body["dropped"] == expected["dropped"]
    if "summary_vi" in expected:
        assert body["summary_vi"] == expected["summary_vi"]
    if "summary_len" in expected:
        assert len(body["summary_vi"]) == expected["summary_len"]


def _one_item() -> dict[str, Any]:
    return {
        "day": "2026-11-27",
        "proposals": [
            {
                "id": "n1",
                "kind": "notification.internal",
                "risk": "low",
                "title_vi": "Gửi thông báo cán bộ",
                "created_at": "2026-11-20T00:00:00Z",
                "parcel_codes": [],
                "goal_key": "internal_notice",
                "target": 1,
                "involves_spraying": False,
                "people_needed": 0,
            }
        ],
        "rain_parcel_codes": [],
        "withdrawal_parcel_codes": [],
        "people_available": None,
    }


def test_second_campaign_of_the_day_is_reported_as_existing() -> None:
    gateway = CampaignGateway(_one_item(), post_answer={"existing": True, "id": "camp-first"})

    outcome = run_daily_campaign(gateway, NOW, [ReplayProvider(fixtures={"default": {"summary_vi": "Một việc."}})])

    assert outcome.status == "existing"
    assert outcome.campaign_id == "camp-first"
    assert len(gateway.posted) == 1


def test_no_item_left_makes_no_llm_call_and_finishes_the_run_ok() -> None:
    provider = CountingProvider()
    gateway = CampaignGateway({**_one_item(), "proposals": []})

    outcome = run_daily_campaign(gateway, NOW, [provider])

    assert outcome.status == "empty"
    assert provider.calls == 0
    assert gateway.posted == []
    assert gateway.runs_finished == [{"id": "run-1", "status": "ok", "provider": "rules", "model": "rules-v1"}]


def test_fallback_summary_is_recorded_as_rules_output() -> None:
    gateway = CampaignGateway(_one_item())

    run_daily_campaign(gateway, NOW, [FailingProvider(fixtures={})])

    assert gateway.posted[0]["summary_vi"] == "Hôm nay có 1 việc: 1 Báo cán bộ"
    assert gateway.runs_finished[-1]["provider"] == "rules"
    assert gateway.runs_finished[-1]["status"] == "ok"


def test_llm_summary_is_recorded_with_its_provider() -> None:
    gateway = CampaignGateway(_one_item())

    run_daily_campaign(gateway, NOW, [ReplayProvider(fixtures={"default": {"summary_vi": "Một việc cần duyệt."}})])

    assert gateway.posted[0]["summary_vi"] == "Một việc cần duyệt."
    assert gateway.runs_finished[-1]["provider"] == "replay"
