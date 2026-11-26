# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A9 (daily-campaign): one campaign a day from the open proposals, ordered by fixed rules (contract C5).

The rules decide what is in the campaign. The LLM only writes the two-sentence summary; any provider error gives a
fallback summary built from the goals, so a campaign is never held back by the model.
"""
from dataclasses import dataclass
from datetime import date, datetime
import json
import logging
from typing import Any, Mapping, Sequence

from ..client import CoreGatewayClient, GatewayHTTPError
from ..evidence import canonical_json, sha256_hex
from ..providers.base import LLMMessage, LLMProvider, ProviderError
from ..providers.pricing import estimate_cost_usd
from .common import RULES_MODEL, RULES_PROVIDER, parse_utc, vn_day

log = logging.getLogger("dxos_agent")

AGENT_NAME = "daily-campaign"
PROMPT_VERSION = "m7-a9-v1"
MAX_ITEMS = 15
SUMMARY_MAX = 400
OTHER_LABEL_VI = "Việc khác"
OTHER_WEIGHT = 9
REFUSAL_STATUSES = (400, 409, 422)  # the web refused the campaign body; the day is done
KIND_WEIGHT = {
    "harvest.approve": 1,
    "disease.inspection": 2,
    "notification.households": 3,
    "journal.reject": 4,
    "journal.approve": 5,
    "notification.internal": 6,
    "bulletin.publish": 7,
}
# The season plan's goal keys (contract C2 of M11) and the campaign goals they raise; a key already in campaign form passes through.
SEASON_GOAL_CAMPAIGN = {"yield_kg": "harvest", "diseased_parcel_rate": "inspection", "journal_on_time_rate": "journal_backlog"}
# Mirrors the goal table of the web (contract C2): the agent needs the labels for its prompt and fallback summary.
GOAL_LABELS_VI = {
    "harvest": "Duyệt thu hoạch",
    "journal_backlog": "Duyệt nhật ký tồn",
    "inspection": "Kiểm tra vùng bệnh",
    "households_notice": "Báo nông hộ",
    "internal_notice": "Báo cán bộ",
    "bulletin": "Đăng bản tin",
    "other": OTHER_LABEL_VI,
}
SUMMARY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["summary_vi"],
    "additionalProperties": False,
    # Longer than SUMMARY_MAX on purpose: an over-long answer is trimmed, not refused.
    "properties": {"summary_vi": {"type": "string", "minLength": 1, "maxLength": 1000}},
}
SYSTEM_PROMPT = (
    "Bạn là trợ lý viết tóm tắt chiến dịch hằng ngày cho HTX chè. Viết tối đa hai câu bằng tiếng Việt có dấu, "
    "chỉ dựa trên danh sách việc được cung cấp; không nêu con số nào không có trong danh sách. "
    "Trả lời bằng một đối tượng JSON có khóa summary_vi."
)


@dataclass(frozen=True)
class CampaignPlan:
    items: list[Mapping[str, Any]]  # kept candidates, in position order
    dropped: list[dict[str, str]]  # {"proposal_id", "rule"} for every candidate the rules did not keep


@dataclass(frozen=True)
class CampaignOutcome:
    # posted, existing (the web already had today's campaign), empty (the rules left nothing),
    # or refused (the web answered 4xx, so today's schedule is done and nothing is retried)
    status: str
    run_id: str
    campaign_id: str | None


def _dropped(row: Mapping[str, Any], rule: str) -> dict[str, str]:
    return {"proposal_id": str(row["id"]), "rule": rule}


def plan_campaign(candidates: Mapping[str, Any]) -> CampaignPlan:
    """Apply the C5 rules in order: withdrawal, rain, sort (season goals first), people, overflow."""
    withdrawal = set(candidates.get("withdrawal_parcel_codes") or [])
    rain = set(candidates.get("rain_parcel_codes") or [])
    dropped: list[dict[str, str]] = []
    pool: list[Mapping[str, Any]] = []
    for row in candidates.get("proposals") or []:
        codes = set(row.get("parcel_codes") or [])
        if row["kind"] == "harvest.approve" and codes & withdrawal:
            dropped.append(_dropped(row, "withdrawal"))
        elif row.get("involves_spraying") and codes & rain:
            dropped.append(_dropped(row, "rain"))
        else:
            pool.append(row)
    raised = {SEASON_GOAL_CAMPAIGN.get(str(key), str(key)) for key in candidates.get("season_goal_keys") or []}
    # Items that serve the adopted plan's goals come first; the kind weights order each group (C6 of M11).
    pool.sort(key=lambda row: (row.get("goal_key") not in raised, KIND_WEIGHT.get(row["kind"], OTHER_WEIGHT), parse_utc(row["created_at"]), str(row["id"])))

    people = candidates.get("people_available")
    if isinstance(people, (int, float)) and not isinstance(people, bool):
        left = people
        fitting: list[Mapping[str, Any]] = []
        for row in pool:  # each item is checked against what is left; an item that does not fit is skipped, not the rest
            need = int(row.get("people_needed") or 0)
            if need <= left:
                left -= need
                fitting.append(row)
            else:
                dropped.append(_dropped(row, "people"))
        pool = fitting
    dropped += [_dropped(rest, "overflow") for rest in pool[MAX_ITEMS:]]
    return CampaignPlan(items=pool[:MAX_ITEMS], dropped=dropped)


def _goal_totals(items: Sequence[Mapping[str, Any]]) -> list[tuple[str, int]]:
    """Target summed per goal, in the order of first appearance (the order of the campaign's goals)."""
    totals: dict[str, int] = {}
    for row in items:
        totals[str(row["goal_key"])] = totals.get(str(row["goal_key"]), 0) + int(row["target"])
    return list(totals.items())


def fallback_summary(items: Sequence[Mapping[str, Any]]) -> str:
    parts = ", ".join(f"{total} {GOAL_LABELS_VI.get(key, OTHER_LABEL_VI)}" for key, total in _goal_totals(items))
    return f"Hôm nay có {len(items)} việc: {parts}"[:SUMMARY_MAX]


def _messages(day: date, items: Sequence[Mapping[str, Any]]) -> list[LLMMessage]:
    payload = {
        "day": day.isoformat(),
        "items": [
            {
                "title_vi": row["title_vi"],
                "goal_key": row["goal_key"],
                "label_vi": GOAL_LABELS_VI.get(str(row["goal_key"]), OTHER_LABEL_VI),
                "target": int(row["target"]),
            }
            for row in items
        ],
    }
    return [
        LLMMessage(role="system", content=SYSTEM_PROMPT),
        LLMMessage(role="user", content=json.dumps(payload, ensure_ascii=False, sort_keys=True)),
    ]


def _external_requests(providers: Sequence[LLMProvider]) -> int:
    return sum(getattr(provider, "requests_sent", 0) for provider in providers if provider.external)


def _summarize(providers: Sequence[LLMProvider], day: date, items: Sequence[Mapping[str, Any]]) -> tuple[str, dict[str, Any]]:
    """The LLM's summary, or the fallback when no provider answers; the usage is what the run records."""
    external_before = _external_requests(providers)
    for provider in providers:
        try:
            result = provider.complete_json(_messages(day, items), SUMMARY_SCHEMA)
        except ProviderError as exc:
            log.warning("A9 provider %s unavailable: %s", provider.name, type(exc).__name__)
            continue
        text = str(result.data["summary_vi"]).strip()[:SUMMARY_MAX]
        if text:
            cost = estimate_cost_usd(result.model, result.tokens_in, result.tokens_out) if provider.external else 0.0
            return text, {
                "provider": provider.name,
                "model": result.model,
                "tokens_in": result.tokens_in,
                "tokens_out": result.tokens_out,
                "cost_estimate_usd": cost,
                "external_calls": _external_requests(providers) - external_before,
            }
    return fallback_summary(items), {
        "provider": RULES_PROVIDER,
        "model": RULES_MODEL,
        "external_calls": _external_requests(providers) - external_before,
    }


def run_daily_campaign(
    gateway: CoreGatewayClient,
    now: datetime,
    providers: Sequence[LLMProvider],
) -> CampaignOutcome:
    """Build and post today's campaign; `providers` is the chain the cooperative chose (empty means the fallback summary only)."""
    day = vn_day(now)
    candidates = gateway.get_campaign_candidates(day.isoformat())
    if not candidates.get("proposals"):  # no open proposal: no run row and no request, as A2 and A4 do
        return CampaignOutcome(status="empty", run_id="", campaign_id=None)
    plan = plan_campaign(candidates)
    primary = providers[0] if providers else None
    run_id = gateway.start_run(
        agent=AGENT_NAME,
        trigger="schedule",
        provider=primary.name if primary is not None else RULES_PROVIDER,
        model=primary.model if primary is not None else RULES_MODEL,
        prompt_version=PROMPT_VERSION,
        input_hash=sha256_hex(canonical_json(sorted(str(row["id"]) for row in candidates.get("proposals") or []))),
    )
    if not plan.items:
        gateway.finish_run(run_id, status="ok", provider=RULES_PROVIDER, model=RULES_MODEL)
        return CampaignOutcome(status="empty", run_id=run_id, campaign_id=None)

    summary, usage = _summarize(providers, day, plan.items)
    body = {
        "day": day.isoformat(),
        "items": [{"proposal_id": str(row["id"]), "position": position} for position, row in enumerate(plan.items, start=1)],
        "dropped": plan.dropped,
        "summary_vi": summary,
        "run_id": run_id,
    }
    try:
        res = gateway.post_campaign(body)
    except GatewayHTTPError as exc:
        gateway.finish_run(run_id, status="failed", error=str(exc)[:1000], **usage)
        if exc.status_code in REFUSAL_STATUSES:  # the web refused this body; the same body would be refused again today
            return CampaignOutcome(status="refused", run_id=run_id, campaign_id=None)
        raise  # 401, 403 and other errors: a fresh token or a later cycle may succeed, so the caller retries
    except Exception as exc:  # network errors: the caller retries on the next cycle
        gateway.finish_run(run_id, status="failed", error=str(exc)[:1000], **usage)
        raise
    gateway.finish_run(run_id, status="ok", **usage)
    return CampaignOutcome(status="existing" if res.get("existing") else "posted", run_id=run_id, campaign_id=res.get("id"))
