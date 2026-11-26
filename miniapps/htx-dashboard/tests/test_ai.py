# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The AI tab's figures: rates, waits, cost and verdicts, from the rows Hasura returns for the manager role (spec §15)."""
import re
from datetime import timedelta

import sample

from htx_dashboard import core_client as cc
from htx_dashboard import metrics as m

NOW = sample.NOW


def ago(**delta) -> object:
    return NOW - timedelta(**delta)


def proposal(agent, status, created, decided=None):
    return m.AgentProposal(agent, status, created, decided)


def run(agent, status, cost, started):
    return m.AgentRun(agent, status, cost, started)


# ---------- figures per agent ----------

def test_rates_use_decided_proposals_only():
    rows = [proposal("field-watch", "approved", ago(hours=10), ago(hours=8)),
            proposal("field-watch", "executed", ago(hours=10), ago(hours=8)),
            proposal("field-watch", "rejected", ago(hours=10), ago(hours=9)),
            proposal("field-watch", "proposed", ago(hours=5)),
            proposal("field-watch", "expired", ago(days=3))]
    (figures,) = m.agent_figures(rows, [], NOW)
    assert figures.proposals == 5
    assert figures.approved == 2
    assert figures.rejected == 1
    assert figures.approval_rate == 2 / 3
    assert figures.rejection_rate == 1 / 3


def test_failed_proposal_was_approved_first():
    rows = [proposal("digest", "failed", ago(hours=6), ago(hours=5)), proposal("digest", "rejected", ago(hours=6), ago(hours=5))]
    (figures,) = m.agent_figures(rows, [], NOW)
    assert figures.approved == 1
    assert figures.approval_rate == 0.5


def test_rates_are_none_without_a_decision():
    rows = [proposal("harvest-ready", "proposed", ago(hours=2))]
    (figures,) = m.agent_figures(rows, [], NOW)
    assert figures.approval_rate is None
    assert figures.rejection_rate is None
    assert figures.median_wait_hours is None


def test_median_wait_counts_decided_proposals_in_hours():
    rows = [proposal("field-watch", "approved", ago(hours=10), ago(hours=7)),
            proposal("field-watch", "rejected", ago(hours=20), ago(hours=10)),
            proposal("field-watch", "rejected", ago(hours=30), ago(hours=0)),
            proposal("field-watch", "proposed", ago(hours=50))]
    (figures,) = m.agent_figures(rows, [], NOW)
    assert figures.median_wait_hours == 10.0  # waits 3, 10 and 30 hours: the middle one


def test_failed_runs_and_cost_per_agent():
    runs = [run("field-watch", "ok", 0.1234, ago(days=1)), run("field-watch", "ok", 0.5, ago(days=2)),
            run("digest", "failed", 0.25, ago(days=1)), run("digest", "ok", None, ago(days=1))]
    by_agent = {f.agent: f for f in m.agent_figures([], runs, NOW)}
    assert by_agent["field-watch"].failed_runs == 0
    assert round(by_agent["field-watch"].cost_usd, 4) == 0.6234
    assert by_agent["digest"].failed_runs == 1
    assert by_agent["digest"].cost_usd == 0.25
    assert by_agent["digest"].proposals == 0


def test_agents_come_from_both_sources_busiest_first():
    rows = [proposal("disease-watch", "approved", ago(hours=5), ago(hours=4))]
    runs = [run("field-watch", "ok", 0.1, ago(days=1)), run("field-watch", "ok", 0.1, ago(days=1))]
    names = [f.agent for f in m.agent_figures(rows, runs, NOW)]
    assert names == ["disease-watch", "field-watch"]


def test_only_the_last_28_days_count():
    rows = [proposal("field-watch", "approved", ago(days=29), ago(days=28)), proposal("field-watch", "rejected", ago(days=3), ago(days=2))]
    runs = [run("field-watch", "failed", 1.0, ago(days=40))]
    (figures,) = m.agent_figures(rows, runs, NOW)
    assert figures.proposals == 1
    assert figures.failed_runs == 0
    assert figures.cost_usd == 0


def test_cost_is_two_decimals_with_a_comma():
    assert m.usd_text(0.6234) == "0,62 USD"
    assert m.usd_text(0) == "0,00 USD"
    assert m.usd_text(12.5) == "12,50 USD"


# ---------- chart series ----------

def test_status_series_groups_statuses_and_drops_empty_groups():
    rows = [proposal("field-watch", "proposed", ago(hours=1)), proposal("field-watch", "executed", ago(hours=5), ago(hours=4)),
            proposal("disease-watch", "rejected", ago(hours=5), ago(hours=4))]
    names, series = m.status_series(rows, ["field-watch", "disease-watch"])
    assert names == ["Chờ duyệt", "Đã duyệt", "Từ chối"]
    assert series == [[1, 0], [1, 0], [0, 1]]


# ---------- improvements and verdicts ----------

def test_verdict_text_reads_each_window_and_hides_unknowns():
    effect = {"after_2w": {"value": 0.2, "verdict": "helped"}, "after_4w": {"value": 0.9, "verdict": "drop"}}
    assert m.verdict_text(effect, "after_2w") == "Đã giúp"
    assert m.verdict_text(effect, "after_4w") == "Nên bỏ"
    assert m.verdict_text(effect, "after_8w") == "—"
    assert m.verdict_text({"after_2w": {"verdict": "mystery"}}, "after_2w") == "—"
    assert m.verdict_text({}, "after_2w") == "—"


# ---------- the queries and the parsers ----------

FORBIDDEN = {"reason_vi", "payload", "evidence", "htx_code", "error", "input_hash", "prompt_version", "trigger", "rationale_vi",
             "baseline", "decided_by", "proposal_id", "template", "week", "dedupe_key", "run_id", "risk", "origin"}


def test_ai_queries_never_name_a_hidden_column():
    for query in (cc.AI_PROPOSALS, cc.AI_RUNS, cc.AI_IMPROVEMENTS):
        words = set(re.findall(r"[a-z_0-9]+", query))
        assert not words & FORBIDDEN, query


def test_ai_parsers_read_the_raw_rows():
    proposals = cc.parse_ai_proposals(sample.answer({"query": cc.AI_PROPOSALS, "variables": {"since": ago(days=28).isoformat(), "limit": 5000}})["data"])
    assert proposals and all(isinstance(p, m.AgentProposal) for p in proposals)
    runs = cc.parse_ai_runs(sample.answer({"query": cc.AI_RUNS, "variables": {"since": ago(days=28).isoformat(), "limit": 5000}})["data"])
    assert runs and all(isinstance(r, m.AgentRun) for r in runs)
    items = cc.parse_ai_improvements(sample.answer({"query": cc.AI_IMPROVEMENTS, "variables": {"since": ago(days=56).isoformat(), "limit": 5000}})["data"])
    assert items and all(isinstance(i, m.Improvement) for i in items)
