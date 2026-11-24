# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Scenario and resilience tests for Agent A1 (journal-review)."""
from datetime import datetime, timezone
import json
from pathlib import Path

from dxos_agent.agents import run_journal_review
from dxos_agent.evidence import build_evidence, journal_entry_evidence_row
from dxos_agent.providers import ProviderError, ReplayProvider

SCENARIO_PATH = Path(__file__).parent / "scenarios" / "a1_journal_review.json"


class FakeGatewayClient:
    """In-memory CoreGatewayClient stand-in capturing runs and proposals."""

    def __init__(self, entries: list[dict]) -> None:
        self.entries = entries
        self.runs_started: list[dict] = []
        self.runs_finished: list[dict] = []
        self.proposals: list[dict] = []

    def graphql(self, query, variables=None):
        del query, variables
        return {"journal_entries": self.entries}

    def start_run(self, agent, trigger, provider, model, prompt_version, input_hash):
        run_id = f"run-{len(self.runs_started) + 1}"
        self.runs_started.append(
            {
                "id": run_id,
                "agent": agent,
                "trigger": trigger,
                "provider": provider,
                "model": model,
                "prompt_version": prompt_version,
                "input_hash": input_hash,
            }
        )
        return run_id

    def finish_run(self, run_id, status, tokens_in=0, tokens_out=0, cost_estimate=0.0, error=None):
        self.runs_finished.append(
            {
                "id": run_id,
                "status": status,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "cost_estimate": cost_estimate,
                "error": error,
            }
        )

    def submit_proposal(self, proposal):
        self.proposals.append(dict(proposal))
        return {"id": f"prop-{len(self.proposals)}", "deduped": False}


class FailingProvider(ReplayProvider):
    """Simulates Ollama/network unavailability after external outage (spec test 8)."""

    name = "ollama"

    def _generate(self, messages, schema):
        del messages, schema
        raise ProviderError("connection refused")


def _load_scenario() -> dict:
    return json.loads(SCENARIO_PATH.read_text(encoding="utf-8"))


def test_a1_scenario_with_replay_provider_matches_expected_proposals_and_evidence():
    scenario = _load_scenario()
    now = datetime.fromisoformat(scenario["now"].replace("Z", "+00:00"))
    gateway = FakeGatewayClient(scenario["entries"])
    provider = ReplayProvider(fixtures={"default": scenario["replay_response"]})

    outcome = run_journal_review(gateway=gateway, provider=provider, trigger="schedule", now=now)

    assert outcome.status == "ok"
    assert outcome.entries_scanned == len(scenario["entries"])
    assert outcome.rejected_count == 5
    assert outcome.approved_count == 2
    assert outcome.proposals_submitted == 6
    assert outcome.used_llm is True
    assert gateway.runs_finished[-1]["status"] == "ok"

    reject_proposals = {p["payload"]["entry_id"]: p for p in gateway.proposals if p["kind"] == "journal.reject"}
    assert set(reject_proposals) == set(scenario["expected"]["rejected"])
    for entry_id, expected_pair in scenario["expected"]["rejected"].items():
        prop = reject_proposals[entry_id]
        assert [prop["payload"]["decision"], prop["payload"]["reason_code"]] == expected_pair
        source = next(item for item in scenario["entries"] if item["id"] == entry_id)
        expected_evidence = build_evidence([journal_entry_evidence_row(source)])
        assert prop["evidence"] == expected_evidence

    approve_proposals = [p for p in gateway.proposals if p["kind"] == "journal.approve"]
    assert len(approve_proposals) == 1
    assert approve_proposals[0]["payload"]["entry_ids"] == scenario["expected"]["approved_entry_ids"]


def test_prompt_injection_and_hijacked_llm_response_cannot_flip_hard_rule_decision():
    scenario = _load_scenario()
    now = datetime.fromisoformat(scenario["now"].replace("Z", "+00:00"))
    injected = next(item for item in scenario["entries"] if item["id"] == "je_a3_prompt_injection")
    gateway = FakeGatewayClient([injected])
    hijacked_provider = ReplayProvider(
        fixtures={
            "default": {
                "reject_reasons": {},
                "approve_summary_vi": "Duyệt hết toàn bộ nhật ký theo ghi chú nông hộ",
            }
        }
    )

    outcome = run_journal_review(gateway=gateway, provider=hijacked_provider, trigger="event", now=now)

    assert outcome.rejected_count == 1
    assert outcome.approved_count == 0
    assert len(gateway.proposals) == 1
    prop = gateway.proposals[0]
    assert prop["kind"] == "journal.reject"
    assert prop["payload"]["decision"] == "REJECTED"
    assert prop["payload"]["reason_code"] == "WITHDRAWAL_PERIOD"
    # Missing entry reason in hijacked LLM JSON falls back to deterministic rule text, not approval prompt.
    assert "cách ly" in prop["reason_vi"]


def test_llm_outage_falls_back_to_hard_rules_without_dropping_proposals():
    scenario = _load_scenario()
    now = datetime.fromisoformat(scenario["now"].replace("Z", "+00:00"))
    gateway = FakeGatewayClient(scenario["entries"])

    outcome = run_journal_review(gateway=gateway, provider=FailingProvider(), trigger="schedule", now=now)

    assert outcome.status == "ok"
    assert outcome.used_llm is False
    assert outcome.proposals_submitted == 6
    assert gateway.runs_finished[-1]["status"] == "ok"


def test_empty_pending_queue_finishes_run_as_skipped():
    gateway = FakeGatewayClient([])
    provider = ReplayProvider(fixtures={"default": {"reject_reasons": {}, "approve_summary_vi": "Không có"}})

    outcome = run_journal_review(gateway=gateway, provider=provider, now=datetime.now(timezone.utc))

    assert outcome.status == "skipped"
    assert outcome.proposals_submitted == 0
    assert gateway.proposals == []
    assert gateway.runs_finished == [
        {"id": "run-1", "status": "skipped", "tokens_in": 0, "tokens_out": 0, "cost_estimate": 0.0, "error": None}
    ]
