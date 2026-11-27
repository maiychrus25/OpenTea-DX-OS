# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Public benchmark (contract C5): every agent scenario suite through the agents' own functions with one provider.

Run it from the repository root: `make benchmark PROVIDER=replay`. The replay provider answers from the
scenario files, so it must score every case; a real provider's failures are recorded per case.
"""
import argparse
from dataclasses import dataclass
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import re
import statistics
import time
from typing import Any, Callable, Mapping, Sequence

from dxos_agent.agents.assistant import run_assistant_once
from dxos_agent.agents.bulletin import BULLETIN_SCHEMA, run_bulletin
from dxos_agent.agents.daily_campaign import SUMMARY_SCHEMA, run_daily_campaign
from dxos_agent.agents.disease_watch import run_disease_watch
from dxos_agent.agents.field_watch import run_field_watch
from dxos_agent.agents.harvest_ready import run_harvest_ready
from dxos_agent.agents.improvement import RATIONALE_SCHEMA, run_improvement
from dxos_agent.agents.journal_review import _classify_entry
from dxos_agent.agents.strategy import PLAN_SCHEMA, run_strategy
from dxos_agent.config import Config
from dxos_agent.providers import (
    AnthropicProvider,
    LLMMessage,
    LLMProvider,
    LLMResponse,
    OllamaProvider,
    OpenAIProvider,
    ProviderError,
    ReplayProvider,
    SchemaValidationError,
    validate_json_schema,
)
from dxos_agent.settings import AgentChoice, AgentSettings

SCENARIO_DIR = Path(__file__).resolve().parent / "tests" / "scenarios"
DOCS_PATH = Path(__file__).resolve().parents[2] / "docs" / "benchmark.md"
REPLAY_MODEL = "replay-v1"
OPERATION = re.compile(r"\s*query\s+(\w+)")
A7_NOW = datetime(2026, 11, 26, 3, 0, tzinfo=timezone.utc)
A10_NOW = datetime(2026, 11, 30, 0, 0, tzinfo=timezone.utc)
A11_NOW = datetime(2026, 10, 1, 0, 0, tzinfo=timezone.utc)
A10_BASE_INPUTS: dict[str, Any] = {
    "week": "2026-11-30",
    "settings": {},
    "proposal_stats": [],
    "journal_review": {"window_days": 28, "reviewed": 0, "returned_missing_info": 0},
    "campaign_goals": [],
    "improvements": [],
    "metrics": {},
}


@dataclass(frozen=True)
class CaseResult:
    correct: bool
    latency_ms: float
    tokens_in: int
    tokens_out: int
    cost_usd: float
    error: str | None


@dataclass(frozen=True)
class SuiteResult:
    name: str
    cases: list[CaseResult]

    @property
    def case_count(self) -> int:
        return len(self.cases)

    @property
    def correct_count(self) -> int:
        return sum(1 for case in self.cases if case.correct)

    @property
    def median_ms(self) -> float:
        return statistics.median(case.latency_ms for case in self.cases) if self.cases else 0.0

    @property
    def cost_usd(self) -> float:
        return sum(case.cost_usd for case in self.cases)


class _Replay(ReplayProvider):
    """Replay provider under a chosen name; `fail` makes every call raise, as the scenario's simulated outage does."""

    def __init__(self, fixtures: Mapping[str, Any], name: str = "ollama", external: bool = False, fail: bool = False) -> None:
        super().__init__(fixtures=fixtures)
        self.name = name
        self.external = external
        self._fail = fail

    def _generate(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> LLMResponse:
        if self._fail:
            raise ProviderError("simulated provider outage")
        return super()._generate(messages, schema)


class _Probe(LLMProvider):
    """Wraps the chosen real provider and remembers whether it raised, so the case counts as failed."""

    def __init__(self, inner: LLMProvider) -> None:
        self._inner = inner
        self.name = inner.name
        self.model = inner.model
        self.default_model = getattr(inner, "default_model", inner.model)
        self.external = inner.external
        self.failed = False

    def complete_json(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]):
        try:
            return self._inner.complete_json(messages, schema)
        except ProviderError:
            self.failed = True
            raise

    def _generate(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> LLMResponse:
        raise NotImplementedError("complete_json is overridden")


class _NoLocalModel(LLMProvider):
    """Internal model slot in an external-provider run: the benchmark times only the chosen provider."""

    name = "ollama"
    model = ""

    def _generate(self, messages: Sequence[LLMMessage], schema: Mapping[str, Any]) -> LLMResponse:
        del messages, schema
        raise ProviderError("internal model not part of this run")


class BenchGateway:
    """Serves one case's data to whichever agent runs and records what the agent sends back."""

    def __init__(self, case: Mapping[str, Any]) -> None:
        self._case = case
        self._pending_requests = [case["request"]] if "request" in case else []
        self.inputs: dict[str, Any] = {}
        self.proposals: list[dict[str, Any]] = []
        self.posted: list[dict[str, Any]] = []
        self.effects: list[tuple[str, dict[str, Any]]] = []
        self.results: list[dict[str, Any]] = []
        self.runs_started: list[dict[str, Any]] = []
        self.runs_finished: list[dict[str, Any]] = []

    def graphql(self, query: str, variables: Mapping[str, Any] | None = None) -> dict[str, Any]:
        del variables
        return dict(self._case["graphql"][OPERATION.match(query).group(1)])

    def start_run(self, **kwargs: Any) -> str:
        self.runs_started.append(kwargs)
        return f"run-{len(self.runs_started)}"

    def finish_run(self, run_id: str, status: str, **kwargs: Any) -> None:
        self.runs_finished.append({"id": run_id, "status": status, **kwargs})

    def submit_proposal(self, proposal: Mapping[str, Any]) -> dict[str, Any]:
        self.proposals.append(dict(proposal))
        return {"id": f"p-{len(self.proposals)}", "deduped": False}

    def get_campaign_candidates(self, day: str) -> dict[str, Any]:
        del day
        return dict(self._case["candidates"])

    def post_campaign(self, body: Mapping[str, Any]) -> dict[str, Any]:
        self.posted.append(dict(body))
        return {"id": "camp-1"}

    def get_improvement_inputs(self, week: str) -> dict[str, Any]:
        del week
        return json.loads(json.dumps(self.inputs))

    def post_improvement(self, body: Mapping[str, Any]) -> dict[str, Any]:
        self.posted.append(dict(body))
        return {"id": f"imp-{len(self.posted)}", "proposal_id": f"p-{len(self.posted)}"}

    def post_improvement_effect(self, improvement_id: str, body: Mapping[str, Any]) -> dict[str, Any]:
        self.effects.append((improvement_id, dict(body)))
        return {"id": improvement_id}

    def get_strategy_inputs(self, season: str) -> dict[str, Any]:
        del season
        return json.loads(json.dumps(self.inputs))

    def post_strategy_plan(self, body: Mapping[str, Any]) -> dict[str, Any]:
        self.posted.append(dict(body))
        return {"id": "plan-1", "proposal_id": "p-1"}

    def claim_assistant_requests(self, limit: int) -> list[dict[str, Any]]:
        claimed, self._pending_requests = self._pending_requests[:limit], self._pending_requests[limit:]
        return claimed

    def post_assistant_result(self, request_id: str, intent: dict[str, Any], run_id: str | None) -> bool:
        self.results.append({"request_id": request_id, "intent": intent, "run_id": run_id})
        return True


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _schema_ok(data: Mapping[str, Any], schema: Mapping[str, Any]) -> bool:
    """The output passes the agent's own schema, which carries its length limits."""
    try:
        validate_json_schema(dict(data), schema)
    except SchemaValidationError:
        return False
    return True


def _subjects(kind: str, payload: Mapping[str, Any]) -> list[str]:
    """The subjects the web derives from a payload; the agent does not send them."""
    if kind in ("notification.internal", "notification.households"):
        return list(payload["subjects"])
    if kind == "disease.inspection":
        return list(payload["report_ids"])
    if kind == "harvest.approve":
        return [payload["parcel_id"]]
    if kind == "bulletin.publish":
        return [f"{payload['commodity']}:{payload['period_day']}"]
    raise AssertionError(f"unknown kind {kind}")


def _order(item: Mapping[str, Any]) -> tuple[str, list[str]]:
    return item["kind"], item["subjects"]


def _submitted_proposals(gateway: BenchGateway) -> list[dict[str, Any]]:
    return sorted(
        (
            {"kind": item["kind"], "subjects": _subjects(item["kind"], item["payload"]), "payload": item["payload"]}
            for item in gateway.proposals
        ),
        key=_order,
    )


def _rule_case(run: Callable[[BenchGateway, datetime, Mapping[str, Any]], Any]) -> Callable[..., bool]:
    def runner(case: Mapping[str, Any], gateway: BenchGateway, real: LLMProvider | None) -> bool:
        del real
        run(gateway, _parse(case["now"]), case)
        return _submitted_proposals(gateway) == sorted(case["expected"]["proposals"], key=_order)

    return runner


def _run_a1(case: Mapping[str, Any], gateway: BenchGateway, real: LLMProvider | None) -> bool:
    """One journal entry per case: the hard-rule decision, rejected as [decision, reason] or approved (None)."""
    del gateway, real
    violation = _classify_entry(case["entry"], None, case["now"])
    actual = None if violation is None else [violation.decision, violation.reason_code]
    return actual == case["expected"]


def _run_a5(case: Mapping[str, Any], gateway: BenchGateway, real: LLMProvider | None) -> bool:
    if real is not None:
        provider, fallback = real, None
    elif case.get("primary_error"):
        provider = _Replay({}, name="anthropic", external=True, fail=True)
        fallback = _Replay({"default": case["replay_response"]})
    else:
        provider, fallback = _Replay({"default": case["replay_response"]}), None
    run_bulletin(gateway, _parse(case["now"]), provider, case.get("thresholds"), fallback)
    proposals = _submitted_proposals(gateway)
    if [(item["kind"], item["subjects"]) for item in proposals] != [
        (item["kind"], item["subjects"]) for item in sorted(case["expected"]["proposals"], key=_order)
    ]:
        return False
    return all(_schema_ok({"bulletin_vi": item["payload"]["bulletin_vi"]}, BULLETIN_SCHEMA) for item in proposals)


def _run_a9(case: Mapping[str, Any], gateway: BenchGateway, real: LLMProvider | None) -> bool:
    if real is not None:
        chain: list[LLMProvider] = [real]
    elif case.get("primary_error"):
        chain = [_Replay({}, name="anthropic", external=True, fail=True)]
    else:
        chain = [_Replay({"default": case["replay_response"]})]
    outcome = run_daily_campaign(gateway, _parse(case["now"]), chain)
    expected = case["expected"]
    if not expected["posted"]:
        return outcome.status == "empty" and not gateway.posted
    if outcome.status != "posted" or len(gateway.posted) != 1:
        return False
    body = gateway.posted[0]
    if [item["proposal_id"] for item in body["items"]] != expected["items"] or body["dropped"] != expected["dropped"]:
        return False
    return _schema_ok({"summary_vi": body["summary_vi"]}, SUMMARY_SCHEMA)


def _run_a10(case: Mapping[str, Any], gateway: BenchGateway, real: LLMProvider | None) -> bool:
    gateway.inputs = {**A10_BASE_INPUTS, **case.get("inputs", {})}
    if real is not None:
        chain: list[LLMProvider] = [real]
    elif case.get("primary_error"):
        chain = [_Replay({}, name="anthropic", external=True, fail=True)]
    elif "replay" in case:
        chain = [_Replay({"default": case["replay"]})]
    else:
        chain = []
    outcome = run_improvement(gateway, A10_NOW, chain)
    expect = case["expect"]
    if outcome.status != "done" or [body["metric_key"] for body in gateway.posted] != expect["metric_keys"]:
        return False
    if any(gateway.posted[0].get(key) != value for key, value in expect.get("first", {}).items()):
        return False
    return all(_schema_ok({"rationale_vi": body["rationale_vi"]}, RATIONALE_SCHEMA) for body in gateway.posted)


def _run_a10_measurement(case: Mapping[str, Any], gateway: BenchGateway, real: LLMProvider | None) -> bool:
    del real
    gateway.inputs = {**A10_BASE_INPUTS, **case["inputs"]}
    run_improvement(gateway, A10_NOW, [])
    return [{"id": imp_id, **body} for imp_id, body in gateway.effects] == case["expect"]


def _run_a11(case: Mapping[str, Any], gateway: BenchGateway, real: LLMProvider | None) -> bool:
    gateway.inputs = case["inputs"]
    if real is not None:
        chain: list[LLMProvider] = [real]
    elif case.get("primary_error"):
        chain = [_Replay({}, name="anthropic", external=True, fail=True)]
    elif "replay" in case:
        chain = [_Replay({"default": case["replay"]})]
    else:
        chain = []
    outcome = run_strategy(gateway, A11_NOW, chain)
    expect = case["expect"]
    if outcome.status != expect["status"]:
        return False
    if expect["status"] != "posted":
        return not gateway.posted
    body = gateway.posted[0]
    if [[g["key"], g["target"], g["baseline"], g["direction"]] for g in body["goals"]] != expect["goals"]:
        return False
    # A real provider words its own priorities and initiatives, so only the replay run compares the words.
    if real is None and (body["priorities"] != expect["priorities"] or body["initiatives"] != expect["initiatives"]):
        return False
    return _schema_ok({"priorities": body["priorities"], "initiatives": body["initiatives"]}, PLAN_SCHEMA)


def _run_a7(case: Mapping[str, Any], gateway: BenchGateway, real: LLMProvider | None) -> bool:
    settings = AgentSettings()
    if real is not None:
        providers: dict[str, LLMProvider] = {"ollama": _NoLocalModel(), real.name: real}
        settings = AgentSettings(agents={"assistant": AgentChoice(provider=real.name, model=real.model)}, budget_exhausted=False)
    elif case.get("provider_error"):
        providers = {"ollama": _Replay({}, fail=True)}
    else:
        providers = {"ollama": _Replay({"default": case["replay_response"]})}
    run_assistant_once(gateway, providers, lambda: settings, A7_NOW)
    return len(gateway.results) == 1 and gateway.results[0]["intent"] == case["expected"]["intent"]


def _load_cases(stem: str) -> list[dict[str, Any]]:
    data = json.loads((SCENARIO_DIR / f"{stem}.json").read_text(encoding="utf-8"))
    if stem == "a1_journal_review":
        # One journal entry is one case: the file is a single scenario with many entries.
        return [
            {"entry": entry, "now": _parse(data["now"]), "expected": data["expected"]["rejected"].get(entry["id"])}
            for entry in data["entries"]
        ]
    return list(data)


SUITES: tuple[tuple[str, Callable[..., bool]], ...] = (
    ("a1_journal_review", _run_a1),
    ("a2_field_watch", _rule_case(lambda gateway, now, case: run_field_watch(gateway, now, case.get("thresholds")))),
    ("a3_disease_watch", _rule_case(lambda gateway, now, case: run_disease_watch(gateway, now, case.get("thresholds")))),
    ("a4_harvest_ready", _rule_case(lambda gateway, now, case: run_harvest_ready(gateway, now, case.get("thresholds")))),
    ("a5_bulletin", _run_a5),
    ("a7_assistant", _run_a7),
    ("a9_daily_campaign", _run_a9),
    ("a10_improvement", _run_a10),
    ("a10_improvement_measurement", _run_a10_measurement),
    ("a11_strategy", _run_a11),
)
SUITE_NAMES = tuple(name for name, _ in SUITES)


def _run_case(runner: Callable[..., bool], case: Mapping[str, Any], real: LLMProvider | None) -> CaseResult:
    gateway = BenchGateway(case)
    probe = _Probe(real) if real is not None else None
    started = time.perf_counter()
    correct = False
    error: str | None = None
    try:
        correct = runner(case, gateway, probe)
    except Exception as exc:  # one broken case must not stop the run
        error = type(exc).__name__
    latency_ms = (time.perf_counter() - started) * 1000.0
    if probe is not None and probe.failed:
        correct, error = False, "ProviderError"
    return CaseResult(
        correct=correct,
        latency_ms=latency_ms,
        tokens_in=sum(int(run.get("tokens_in") or 0) for run in gateway.runs_finished),
        tokens_out=sum(int(run.get("tokens_out") or 0) for run in gateway.runs_finished),
        cost_usd=sum(float(run.get("cost_estimate_usd") or 0.0) for run in gateway.runs_finished),
        error=error,
    )


def run_suites(provider: LLMProvider | None = None) -> list[SuiteResult]:
    """Run every suite. `provider=None` is the replay run: each case answers from its own scenario data."""
    return [
        SuiteResult(name, [_run_case(runner, case, provider) for case in _load_cases(name)])
        for name, runner in SUITES
    ]


def format_section(results: Sequence[SuiteResult], day: str, provider_name: str, model: str) -> str:
    lines = [
        f"## {day} · {provider_name} · {model}",
        "",
        "| Bộ kịch bản | Số ca | Đúng | Độ trễ trung vị (ms) | Chi phí (USD) |",
        "|---|---:|---:|---:|---:|",
    ]
    for suite in results:
        lines.append(f"| {suite.name} | {suite.case_count} | {suite.correct_count} | {suite.median_ms:.1f} | {suite.cost_usd:.4f} |")
    all_cases = [case for suite in results for case in suite.cases]
    total_median = statistics.median(case.latency_ms for case in all_cases) if all_cases else 0.0
    lines.append(
        f"| **Tổng** | {len(all_cases)} | {sum(c.correct for c in all_cases)} | {total_median:.1f} "
        f"| {sum(c.cost_usd for c in all_cases):.4f} |"
    )
    return "\n".join(lines) + "\n"


def append_section(path: Path, section: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write("\n" + section)


def make_provider(name: str, model: str) -> LLMProvider:
    """A real provider from the environment, as dxos-agent builds it; a missing key is named, never printed."""
    cfg = Config.from_env()
    if name == "anthropic":
        return AnthropicProvider(
            api_key=_required("ANTHROPIC_API_KEY", cfg.anthropic_api_key),
            default_model=model or cfg.anthropic_model,
            base_url=cfg.anthropic_api_base,
        )
    if name == "openai":
        openai_model = model or cfg.openai_model
        if not openai_model:
            raise ValueError("OpenAI needs MODEL, there is no default model")
        return OpenAIProvider(
            api_key=_required("OPENAI_API_KEY", cfg.openai_api_key),
            default_model=openai_model,
            base_url=cfg.openai_api_base,
        )
    if name == "ollama":
        token = _required("DXOS_BENCH_TOKEN", os.environ.get("DXOS_BENCH_TOKEN", "").strip())
        return OllamaProvider(gateway_url=cfg.gateway_url, token_provider=lambda: token, model=model or cfg.llm_model)
    raise ValueError(f"unknown provider {name!r}")


def _required(name: str, value: str) -> str:
    if not value:
        raise ValueError(f"{name} is not set")
    return value


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run every agent scenario suite with one provider.")
    parser.add_argument("--provider", choices=("replay", "ollama", "anthropic", "openai"), default="replay")
    parser.add_argument("--model", default="")
    parser.add_argument("--output", type=Path, default=DOCS_PATH)
    args = parser.parse_args(argv)

    provider = None if args.provider == "replay" else make_provider(args.provider, args.model)
    provider_name = "replay" if provider is None else provider.name
    model = (args.model or REPLAY_MODEL) if provider is None else provider.model
    section = format_section(run_suites(provider), date.today().isoformat(), provider_name, model)
    append_section(args.output, section)
    print(section, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
