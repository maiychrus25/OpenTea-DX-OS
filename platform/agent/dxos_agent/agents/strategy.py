# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A11 (strategy): drafts the cooperative's season plan at the start of a quarter (contract C5 of M11).

The rules set each goal's target from last year's same quarter: up goals grow by 5%, down goals shrink by 10%, and a goal
with no figure for last year is left out. The LLM only words the priorities and the initiatives; any provider error gives
one priority per goal, so a plan is never held back by the model. The web stores the draft and opens its `strategy.adopt`
proposal. A11 never scores itself: reports compare actual figures with last year, not with these targets.
"""
from dataclasses import dataclass
from datetime import date, datetime
import json
import logging
from math import floor
from typing import Any, Mapping, Sequence

from ..client import CoreGatewayClient, GatewayHTTPError
from ..evidence import canonical_json, sha256_hex
from ..providers.base import LLMMessage, LLMProvider
from ..providers.pricing import estimate_cost_usd
from .common import RULES_MODEL, RULES_PROVIDER, vn_day

log = logging.getLogger("dxos_agent")

AGENT_NAME = "strategy"
PROMPT_VERSION = "m11-a11-v1"
MAX_LISTED = 5
TEXT_MAX = 160
REFUSAL_STATUSES = (400, 409, 422)  # the web refused the plan body; the quarter's run is over and nothing is retried
INITIATIVE_KINDS = ("miniapp", "training", "partner", "expand", "outside")
GROWTH = 1.05  # up goals: last year's value plus 5%
CUT = 0.9  # down goals: last year's value minus 10%
# Mirrors the goal table of the web (contract C2 of M11): key, label_vi, unit_vi, direction, in the order a plan lists them.
GOALS = (
    ("yield_kg", "Sản lượng", "kg", "up"),
    ("journal_on_time_rate", "Nhật ký đúng hạn", "%", "up"),
    ("diseased_parcel_rate", "Thửa có bệnh", "%", "down"),
    ("shop_revenue_vnd", "Doanh thu cửa hàng", "đồng", "up"),
)
PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["priorities", "initiatives"],
    "additionalProperties": False,
    # No limits here on purpose: an over-long list or text is trimmed, an unknown initiative kind is dropped, nothing is refused.
    "properties": {
        "priorities": {"type": "array", "items": {"type": "string"}},
        "initiatives": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["kind", "title_vi"],
                "properties": {"kind": {"type": "string"}, "title_vi": {"type": "string"}},
            },
        },
    },
}
SYSTEM_PROMPT = (
    "Bạn là trợ lý lập kế hoạch mùa vụ cho HTX chè. Dựa trên các mục tiêu và số liệu được cung cấp, nêu tối đa năm ưu tiên "
    "và tối đa năm sáng kiến phát triển bằng tiếng Việt có dấu, mỗi mục ngắn gọn; không nêu con số nào không có trong dữ liệu. "
    "Loại sáng kiến: miniapp, training, partner, expand, outside (outside là việc ngoài hệ thống như vay vốn, hợp đồng, "
    'quyết định của đại hội xã viên). Trả lời bằng một đối tượng JSON có khóa priorities (danh sách chuỗi) và '
    "initiatives (danh sách đối tượng có kind và title_vi)."
)


@dataclass(frozen=True)
class StrategyOutcome:
    # posted, existing (the web already had a draft), skipped (an adopted plan or a draft exists), empty (nothing to plan),
    # or refused (the web answered 4xx, so this quarter's run is over and nothing is retried)
    status: str
    run_id: str
    plan_id: str | None


def season_of(day: date) -> str:
    return f"{day.year}-Q{(day.month - 1) // 3 + 1}"


def _half_up(value: float, digits: int = 0) -> int | float:
    """Round half away from zero, as the web does (`round` here would round halves to even)."""
    scale = 10**digits
    rounded = floor(value * scale + 0.5) / scale
    return int(rounded) if digits == 0 else rounded


def plan_goals(last_year: Mapping[str, Any]) -> list[dict[str, Any]]:
    """The C5 targets: a goal with no figure for last year is left out, never invented."""
    goals: list[dict[str, Any]] = []
    for key, label, unit, direction in GOALS:
        baseline = last_year.get(key)
        if isinstance(baseline, bool) or not isinstance(baseline, (int, float)):
            continue
        target = _half_up(baseline * GROWTH) if direction == "up" else _half_up(baseline * CUT, 1)
        goals.append({"key": key, "label_vi": label, "unit_vi": unit, "baseline": baseline, "target": target, "direction": direction})
    return goals


def fallback_priorities(goals: Sequence[Mapping[str, Any]]) -> list[str]:
    return [f"{'Tăng' if goal['direction'] == 'up' else 'Giảm'} {goal['label_vi']}"[:TEXT_MAX] for goal in goals][:MAX_LISTED]


def _clean(data: Mapping[str, Any]) -> tuple[list[str], list[dict[str, str]]]:
    """The LLM's lists within the C1 limits: at most five each, 160 characters a text, no empty text, no unknown kind."""
    priorities = [text for text in (str(item).strip()[:TEXT_MAX] for item in data["priorities"]) if text][:MAX_LISTED]
    initiatives = [
        {"kind": item["kind"], "title_vi": item["title_vi"].strip()[:TEXT_MAX]}
        for item in data["initiatives"]
        if item["kind"] in INITIATIVE_KINDS and item["title_vi"].strip()
    ][:MAX_LISTED]
    return priorities, initiatives


def _messages(season: str, goals: Sequence[Mapping[str, Any]], inputs: Mapping[str, Any]) -> list[LLMMessage]:
    payload = {
        "season": season,
        "goals": list(goals),
        "figures": {name: inputs.get(name) for name in ("current", "last_year", "previous")},
    }
    return [
        LLMMessage(role="system", content=SYSTEM_PROMPT),
        LLMMessage(role="user", content=json.dumps(payload, ensure_ascii=False, sort_keys=True)),
    ]


def _external_requests(providers: Sequence[LLMProvider]) -> int:
    return sum(getattr(provider, "requests_sent", 0) for provider in providers if provider.external)


def _word(
    providers: Sequence[LLMProvider], season: str, goals: Sequence[Mapping[str, Any]], inputs: Mapping[str, Any]
) -> tuple[list[str], list[dict[str, str]], dict[str, Any]]:
    """The LLM's priorities and initiatives, or the rules' fallback; the usage is what the run records."""
    external_before = _external_requests(providers)
    for provider in providers:
        try:
            result = provider.complete_json(_messages(season, goals, inputs), PLAN_SCHEMA)
            priorities, initiatives = _clean(result.data)
        except Exception:  # any error: the next provider, then the rules' own priorities
            log.warning("A11 provider %s unavailable", provider.name)
            continue
        if not priorities and not initiatives:
            continue
        cost = estimate_cost_usd(result.model, result.tokens_in, result.tokens_out) if provider.external else 0.0
        usage = {
            "provider": provider.name,
            "model": result.model,
            "tokens_in": result.tokens_in,
            "tokens_out": result.tokens_out,
            "cost_estimate_usd": cost,
            "external_calls": _external_requests(providers) - external_before,
        }
        return priorities or fallback_priorities(goals), initiatives, usage
    return fallback_priorities(goals), [], {
        "provider": RULES_PROVIDER,
        "model": RULES_MODEL,
        "external_calls": _external_requests(providers) - external_before,
    }


def run_strategy(gateway: CoreGatewayClient, now: datetime, providers: Sequence[LLMProvider]) -> StrategyOutcome:
    """Draft the current quarter's plan; `providers` is the chain the cooperative chose (empty means the rules' priorities only)."""
    season = season_of(vn_day(now))
    inputs = gateway.get_strategy_inputs(season)
    adopted = inputs.get("adopted") or {}
    if inputs.get("draft_exists") or adopted.get("season") == season:  # no run row and no LLM call, as A9 does for an empty campaign
        return StrategyOutcome(status="skipped", run_id="", plan_id=None)
    goals = plan_goals(inputs.get("last_year") or {})
    if not goals and not providers:
        return StrategyOutcome(status="empty", run_id="", plan_id=None)
    primary = providers[0] if providers else None
    run_id = gateway.start_run(
        agent=AGENT_NAME,
        trigger="schedule",
        provider=primary.name if primary is not None else RULES_PROVIDER,
        model=primary.model if primary is not None else RULES_MODEL,
        prompt_version=PROMPT_VERSION,
        input_hash=sha256_hex(canonical_json({"season": season, "last_year": inputs.get("last_year") or {}})),
    )
    priorities, initiatives, usage = _word(providers, season, goals, inputs)
    if not goals and not priorities and not initiatives:  # a new cooperative whose model said nothing: no empty plan
        gateway.finish_run(run_id, status="ok", **usage)
        return StrategyOutcome(status="empty", run_id=run_id, plan_id=None)
    body = {"season": season, "goals": goals, "priorities": priorities, "initiatives": initiatives, "run_id": run_id}
    try:
        res = gateway.post_strategy_plan(body)
    except Exception as exc:
        gateway.finish_run(run_id, status="failed", error=str(exc)[:1000], **usage)
        if isinstance(exc, GatewayHTTPError) and exc.status_code in REFUSAL_STATUSES:
            return StrategyOutcome(status="refused", run_id=run_id, plan_id=None)
        raise  # 401, 403, 5xx and network errors: the next cycle retries
    gateway.finish_run(run_id, status="ok", **usage)
    return StrategyOutcome(status="existing" if res.get("existing") else "posted", run_id=run_id, plan_id=res.get("id"))
