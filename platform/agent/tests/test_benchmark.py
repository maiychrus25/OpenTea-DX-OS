# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Benchmark runner (contract C5): replay scores every suite, provider failures are recorded, the table has its format."""
import pytest

import benchmark
from benchmark import CaseResult, SuiteResult
from dxos_agent.providers import ProviderError, ReplayProvider


class FailingProvider(ReplayProvider):
    """An external provider whose every call fails, as when its key or network is down."""

    name = "anthropic"
    external = True

    def _generate(self, messages, schema):
        del messages, schema
        raise ProviderError("upstream unavailable")


def test_replay_provider_scores_every_suite_correctly():
    results = benchmark.run_suites(provider=None)

    assert {suite.name for suite in results} == set(benchmark.SUITE_NAMES)
    for suite in results:
        assert suite.case_count > 0, suite.name
        assert suite.correct_count == suite.case_count, suite.name


def test_failing_provider_marks_its_cases_failed_and_the_table_is_still_written(tmp_path):
    results = benchmark.run_suites(provider=FailingProvider(fixtures={}))

    by_name = {suite.name: suite for suite in results}
    assert set(by_name) == set(benchmark.SUITE_NAMES)
    # The assistant is answered by the provider, so every case fails with the error recorded.
    assistant = by_name["a7_assistant"]
    assert assistant.correct_count == 0
    assert all(case.error for case in assistant.cases)
    # Rule-only suites never call the provider, so they stay correct.
    assert by_name["a1_journal_review"].correct_count == by_name["a1_journal_review"].case_count

    output = tmp_path / "benchmark.md"
    benchmark.append_section(output, benchmark.format_section(results, "2026-11-26", "anthropic", "fake-model"))
    text = output.read_text(encoding="utf-8")
    assert "| a7_assistant |" in text
    assert "| **Tổng** |" in text


def test_table_section_has_heading_header_suite_rows_and_total():
    results = [
        SuiteResult(
            "a1_journal_review",
            [
                CaseResult(correct=True, latency_ms=10.0, tokens_in=0, tokens_out=0, cost_usd=0.0, error=None),
                CaseResult(correct=False, latency_ms=30.0, tokens_in=0, tokens_out=0, cost_usd=0.0, error="x"),
            ],
        )
    ]

    section = benchmark.format_section(results, "2026-11-26", "replay", "replay-v1")

    assert section.splitlines()[0] == "## 2026-11-26 · replay · replay-v1"
    assert "| Bộ kịch bản | Số ca | Đúng | Độ trễ trung vị (ms) | Chi phí (USD) |" in section
    assert "| a1_journal_review | 2 | 1 | 20.0 | 0.0000 |" in section
    assert "| **Tổng** | 2 | 1 | 20.0 | 0.0000 |" in section


def test_missing_provider_key_is_named_without_any_value(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        benchmark.make_provider("anthropic", "claude-haiku-5-5")
