# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A10 (improvement): fixed rules find weak metrics and propose at most five changes a week (contract C4).

The rules decide what is proposed. The LLM only words each rationale; any provider error gives a fallback sentence built
from the rule's own numbers, so a week's proposals are never held back by the model.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta
import json
import logging
from typing import Any, Mapping, Sequence

from ..client import CoreGatewayClient, GatewayHTTPError
from ..evidence import canonical_json, sha256_hex
from ..providers.base import LLMMessage, LLMProvider
from ..providers.pricing import estimate_cost_usd
from ..settings import THRESHOLD_DEFAULTS
from .common import RULES_MODEL, RULES_PROVIDER, clamp, parse_utc, vn_day
from .daily_campaign import GOAL_LABELS_VI

log = logging.getLogger("dxos_agent")

AGENT_NAME = "improvement"
PROMPT_VERSION = "m8-a10-v1"
MAX_PROPOSALS = 5
RATIONALE_MAX = 600
REPEAT_DAYS = 28
REFUSAL_STATUSES = (400, 409, 422)  # the web refused this week's body; the week's run is over and nothing is retried
REJECT_RATE_MIN = 0.6
REJECT_MIN_DECIDED = 5
MISSING_RATE_MIN = 0.4
MISSING_MIN_REVIEWED = 10
SLOW_HOURS_MIN = 24
SLOW_MIN_DECIDED = 10
MISSED_DAYS_MIN = 3
WINDOW_DAYS = 28
GOAL_WINDOW_DAYS = 14
SEASON_BEHIND_DAYS = 28  # the rule waits for four weeks of the quarter (M11 C6)
# The season plan's goals the rule may judge: key -> (label, unit, direction). The web owns the figures; the labels mirror its table.
SEASON_GOALS = {
    "yield_kg": ("Sản lượng", " kg", "up"),
    "journal_on_time_rate": ("Nhật ký đúng hạn", "%", "up"),
    "diseased_parcel_rate": ("Thửa có bệnh", "%", "down"),
    "shop_revenue_vnd": ("Doanh thu cửa hàng", " đồng", "up"),
}
DISEASE_KIND = "disease.inspection"
# field-watch template -> the threshold a rejected template loosens (C4); disease inspections loosen min_reports
FIELD_TEMPLATE_KEYS = {
    "sensor_silent": "silent_hours",
    "dry_soil": "dry_soil_pct",
    "heat": "heat_c",
    "frost": "frost_c",
    "rain_after_spray": "heavy_rain_mm",
}
# threshold key -> (low, high, one loosening step), the C2 ranges; the step moves the value towards looser
SETTING_LIMITS = {
    "silent_hours": (1, 48, 2),
    "dry_soil_pct": (5, 80, -3),
    "heat_c": (25, 50, 1),
    "frost_c": (-5, 15, -1),
    "heavy_rain_mm": (1, 200, 5),
    "min_reports": (2, 20, 1),
}
SETTING_LABELS_VI = {
    "silent_hours": "Cảm biến im lặng",
    "dry_soil_pct": "Đất khô",
    "heat_c": "Nắng nóng",
    "frost_c": "Sương giá",
    "heavy_rain_mm": "Mưa lớn",
    "min_reports": "Số báo cáo tối thiểu",
}
SETTING_UNITS = {
    "silent_hours": " giờ",
    "dry_soil_pct": "%",
    "heat_c": "°C",
    "frost_c": "°C",
    "heavy_rain_mm": " mm",
    "min_reports": " báo cáo",
}
TEMPLATE_LABELS_VI = {
    "sensor_silent": "cảnh báo cảm biến im lặng",
    "dry_soil": "cảnh báo đất khô",
    "heat": "cảnh báo nắng nóng",
    "frost": "cảnh báo sương giá",
    "rain_after_spray": "cảnh báo mưa sau phun",
    DISEASE_KIND: "đề xuất kiểm tra vùng bệnh",
}
RATIONALE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["rationale_vi"],
    "additionalProperties": False,
    # Longer than RATIONALE_MAX on purpose: an over-long answer is trimmed, not refused.
    "properties": {"rationale_vi": {"type": "string", "minLength": 1, "maxLength": 1000}},
}
SYSTEM_PROMPT = (
    "Bạn viết lý do ngắn cho một đề xuất cải tiến của HTX chè. Viết tối đa hai câu bằng tiếng Việt có dấu, "
    "chỉ dựa trên quy tắc, chỉ số, ngưỡng và thay đổi được cung cấp; không nêu con số nào khác. "
    "Trả lời bằng một đối tượng JSON có khóa rationale_vi."
)


@dataclass(frozen=True)
class Candidate:
    """One improvement the rules want to propose, with the sentence facts the fallback and the LLM use."""

    kind: str  # setting, process or template
    metric_key: str
    title_vi: str
    baseline: float
    label_vi: str
    value_text: str
    limit_text: str
    window_days: int
    evidence: dict[str, Any]
    settings_change: dict[str, Any] | None = None
    template: dict[str, Any] | None = None


@dataclass(frozen=True)
class Measurement:
    improvement_id: str
    after: str  # "2w" or "4w"
    value: float
    verdict: str  # helped, no_effect or drop


@dataclass(frozen=True)
class ImprovementOutcome:
    status: str  # done, or refused when the web answered 400, 409 or 422 and the week's run ends
    run_id: str
    proposed: int
    measured: int = 0


@dataclass
class _Usage:
    provider: str = RULES_PROVIDER
    model: str = RULES_MODEL
    tokens_in: int = 0
    tokens_out: int = 0
    cost_estimate_usd: float = 0.0

    def as_kwargs(self, external_calls: int) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model,
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "cost_estimate_usd": self.cost_estimate_usd,
            "external_calls": external_calls,
        }


def _percent(rate: float) -> str:
    return f"{round(rate * 100)}%"


def _current_threshold(inputs: Mapping[str, Any], agent: str, key: str) -> int:
    """The value the web holds for this cooperative, else the agent's default (the same values the agent itself uses)."""
    thresholds = ((inputs.get("settings") or {}).get(agent) or {}).get("thresholds") or {}
    value = thresholds.get(key)
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    return int(THRESHOLD_DEFAULTS[agent][key])


def _noise_key(agent: str, name: str) -> str | None:
    """The threshold a rejected template loosens, or None when the rule does not apply to this template."""
    if agent == "field-watch":
        return FIELD_TEMPLATE_KEYS.get(name)
    if agent == "disease-watch" and name == DISEASE_KIND:
        return "min_reports"
    return None


def _loosen(inputs: Mapping[str, Any], agent: str, name: str, key: str, rate: float, evidence: dict[str, Any]) -> Candidate | None:
    low, high, step = SETTING_LIMITS[key]
    current = _current_threshold(inputs, agent, key)
    new = clamp(current + step, low, high)
    if (new - current) * step <= 0:  # at the bound, or already beyond it: a clamp must never tighten the value
        return None
    unit = SETTING_UNITS[key]
    return Candidate(
        kind="setting",
        metric_key=f"reject_rate:{agent}:{name}",
        title_vi=f"Nới ngưỡng {SETTING_LABELS_VI[key]}: {current} → {new}{unit}",
        baseline=rate,
        label_vi=f"Tỉ lệ từ chối {TEMPLATE_LABELS_VI[name]}",
        value_text=_percent(rate),
        limit_text=_percent(REJECT_RATE_MIN),
        window_days=WINDOW_DAYS,
        evidence=evidence,
        settings_change={"agent": agent, "thresholds": {key: new}, "schedule": None},
    )


def _noise(inputs: Mapping[str, Any]) -> list[Candidate]:
    """Rejected templates: counts are summed per metric first, so a template split over kinds is judged once."""
    totals: dict[tuple[str, str], list[int]] = {}
    for row in inputs.get("proposal_stats") or []:
        agent, name = str(row.get("agent")), str(row.get("template") or row.get("kind"))
        if _noise_key(agent, name) is None:
            continue
        counts = totals.setdefault((agent, name), [0, 0])
        counts[0] += int(row.get("approved") or 0)
        counts[1] += int(row.get("rejected") or 0)
    found: list[Candidate] = []
    for (agent, name), (approved, rejected) in totals.items():
        decided = approved + rejected
        if decided < REJECT_MIN_DECIDED or rejected / decided < REJECT_RATE_MIN:
            continue
        evidence = {"rule": "noise", "agent": agent, "template": name, "approved": approved, "rejected": rejected, "window_days": WINDOW_DAYS}
        candidate = _loosen(inputs, agent, name, _noise_key(agent, name), rejected / decided, evidence)
        if candidate is not None:
            found.append(candidate)
    return found


def _missing_info(inputs: Mapping[str, Any]) -> list[Candidate]:
    journal = inputs.get("journal_review") or {}
    reviewed = int(journal.get("reviewed") or 0)
    returned = int(journal.get("returned_missing_info") or 0)
    if reviewed < MISSING_MIN_REVIEWED or returned / reviewed < MISSING_RATE_MIN:
        return []
    rate = returned / reviewed
    return [
        Candidate(
            kind="process",
            metric_key="journal_missing_info_rate",
            title_vi="Bắt buộc ghi liều lượng khi ghi nhật ký phun thuốc",
            baseline=rate,
            label_vi="Tỉ lệ nhật ký thiếu thông tin",
            value_text=_percent(rate),
            limit_text=_percent(MISSING_RATE_MIN),
            window_days=WINDOW_DAYS,
            evidence={"rule": "missing_info", "reviewed": reviewed, "returned_missing_info": returned, "window_days": WINDOW_DAYS},
        )
    ]


def _weighted_median(pairs: Sequence[tuple[float, int]], total: int) -> float:
    # Fallback only, for inputs without `overall`: the median of the per-group medians, weighted by decided count.
    running = 0
    for wait, count in sorted(pairs):
        running += count
        if running * 2 >= total:
            return wait
    return 0.0


def _slow(inputs: Mapping[str, Any]) -> list[Candidate]:
    overall = inputs.get("overall")
    if isinstance(overall, Mapping) and overall.get("median_wait_hours") is not None:
        # The web's true median over every decided proposal: the same figure its `metrics` measures against later.
        total = int(overall.get("decided") or 0)
        median = float(overall["median_wait_hours"])
        if total < SLOW_MIN_DECIDED:
            return []
    else:
        pairs = []
        for row in inputs.get("proposal_stats") or []:
            decided = int(row.get("approved") or 0) + int(row.get("rejected") or 0)
            if decided > 0:
                pairs.append((float(row.get("median_wait_hours") or 0), decided))
        total = sum(count for _, count in pairs)
        if total < SLOW_MIN_DECIDED:
            return []
        median = _weighted_median(pairs, total)
    if median < SLOW_HOURS_MIN:
        return []
    return [
        Candidate(
            kind="process",
            metric_key="median_wait_hours",
            title_vi="Đề xuất chờ duyệt quá lâu: nên giao thêm người duyệt",
            baseline=median,
            label_vi="Thời gian chờ duyệt trung vị",
            value_text=f"{median:.0f} giờ",
            limit_text=f"{SLOW_HOURS_MIN} giờ",
            window_days=WINDOW_DAYS,
            evidence={"rule": "slow_decisions", "decided": total, "median_wait_hours": median, "window_days": WINDOW_DAYS},
        )
    ]


def _missed(inputs: Mapping[str, Any]) -> list[Candidate]:
    found: list[Candidate] = []
    for goal in inputs.get("campaign_goals") or []:
        missed = int(goal.get("missed_days") or 0)
        if missed < MISSED_DAYS_MIN:
            continue
        key = str(goal["goal_key"])
        label = GOAL_LABELS_VI.get(key, key)
        found.append(
            Candidate(
                kind="template",
                metric_key=f"missed_days:{key}",
                title_vi=f"Nhắc đầu tuần: {label}",
                baseline=float(missed),
                label_vi=f"Số ngày trượt mục tiêu {label}",
                value_text=f"{missed} ngày",
                limit_text=f"{MISSED_DAYS_MIN} ngày",
                window_days=GOAL_WINDOW_DAYS,
                evidence={"rule": "missed_goal", "goal_key": key, "missed_days": missed, "window_days": GOAL_WINDOW_DAYS},
                template={"weekday": 1, "goal_key": key, "title_vi": f"Xem lại mục tiêu: {label}"},
            )
        )
    return found


def _season_behind(inputs: Mapping[str, Any], now: datetime) -> list[Candidate]:
    """Plan goals at least 20% behind the pro-rated target, once four weeks of the quarter have passed (C6 of M11)."""
    today = vn_day(now)
    if (today - date(today.year, (today.month - 1) // 3 * 3 + 1, 1)).days < SEASON_BEHIND_DAYS:
        return []
    found: list[Candidate] = []
    for goal in inputs.get("season_progress") or []:
        key = str(goal.get("key"))
        current, expected = goal.get("current"), goal.get("pro_rated_target")
        if key not in SEASON_GOALS or current is None or expected is None:
            continue
        label, unit, direction = SEASON_GOALS[key]
        # Cross-multiplied (a 20% margin is 4/5 or 6/5) so the edge is exact in floats.
        behind = current * 5 <= expected * 4 if direction == "up" else current * 5 >= expected * 6 and current > expected
        if not behind:
            continue
        found.append(
            Candidate(
                kind="process",
                metric_key=f"season_goal:{key}",
                title_vi=f'Mục tiêu vụ "{label}" đang chậm so với kế hoạch',
                baseline=float(current),
                label_vi=f"Tiến độ mục tiêu vụ {label}",
                value_text=f"{current}{unit}",
                limit_text=f"{expected}{unit}",
                window_days=SEASON_BEHIND_DAYS,
                evidence={"rule": "season_goal_behind", "goal_key": key, "current": current, "pro_rated_target": expected, "window_days": SEASON_BEHIND_DAYS},
            )
        )
    return found


def _blocked_metric_keys(inputs: Mapping[str, Any], now: datetime) -> set[str]:
    """A metric with an open improvement, or one adopted within REPEAT_DAYS, gets no new proposal."""
    blocked: set[str] = set()
    for imp in inputs.get("improvements") or []:
        if imp.get("status") == "proposed":
            blocked.add(str(imp["metric_key"]))
        elif imp.get("status") == "adopted" and imp.get("adopted_at") and now - parse_utc(imp["adopted_at"]) < timedelta(days=REPEAT_DAYS):
            blocked.add(str(imp["metric_key"]))
    return blocked


def plan_proposals(inputs: Mapping[str, Any], now: datetime) -> list[Candidate]:
    """The C4 rules in table order (noise, missing info, slow decisions, missed goal, season goal behind), capped at MAX_PROPOSALS."""
    blocked = _blocked_metric_keys(inputs, now)
    candidates = _noise(inputs) + _missing_info(inputs) + _slow(inputs) + _missed(inputs) + _season_behind(inputs, now)
    return [candidate for candidate in candidates if candidate.metric_key not in blocked][:MAX_PROPOSALS]


def measurement_verdict(baseline: float, value: float) -> str:
    """Lower is better: at least 20% lower helped, at least 20% higher dropped, anything between had no effect."""
    if baseline > 0 and value <= baseline * 0.8:
        return "helped"
    if value > baseline and value >= baseline * 1.2:
        return "drop"
    return "no_effect"


def plan_measurements(inputs: Mapping[str, Any], now: datetime) -> list[Measurement]:
    """2-week and 4-week effects of adopted improvements; a 4-week effect follows a 2-week one, recorded now or earlier."""
    metrics = inputs.get("metrics") or {}
    found: list[Measurement] = []
    for imp in inputs.get("improvements") or []:
        if imp.get("status") != "adopted" or not imp.get("adopted_at"):
            continue
        value = metrics.get(str(imp["metric_key"]))
        if value is None:  # no data for the metric: nothing to measure yet
            continue
        effect = imp.get("effect") or {}
        age = now - parse_utc(imp["adopted_at"])
        has_2w = "after_2w" in effect
        if not has_2w and age >= timedelta(days=14):
            found.append(Measurement(str(imp["id"]), "2w", float(value), measurement_verdict(float(imp["baseline"]), float(value))))
            has_2w = True
        if has_2w and "after_4w" not in effect and age >= timedelta(days=28):
            found.append(Measurement(str(imp["id"]), "4w", float(value), measurement_verdict(float(imp["baseline"]), float(value))))
    return found


def fallback_rationale(candidate: Candidate) -> str:
    return f"{candidate.label_vi}: {candidate.value_text} trong {candidate.window_days} ngày gần đây (ngưỡng {candidate.limit_text}). Đề xuất: {candidate.title_vi}."[:RATIONALE_MAX]


def _messages(candidate: Candidate) -> list[LLMMessage]:
    payload = {
        "rule": candidate.evidence["rule"],
        "metric_key": candidate.metric_key,
        "label_vi": candidate.label_vi,
        "value": candidate.value_text,
        "window_days": candidate.window_days,
        "limit": candidate.limit_text,
        "change_vi": candidate.title_vi,
    }
    return [
        LLMMessage(role="system", content=SYSTEM_PROMPT),
        LLMMessage(role="user", content=json.dumps(payload, ensure_ascii=False, sort_keys=True)),
    ]


def _external_requests(providers: Sequence[LLMProvider]) -> int:
    return sum(getattr(provider, "requests_sent", 0) for provider in providers if provider.external)


def _rationale(providers: Sequence[LLMProvider], candidate: Candidate, usage: _Usage) -> str:
    for provider in providers:
        try:
            result = provider.complete_json(_messages(candidate), RATIONALE_SCHEMA)
        except Exception:  # any error: the next provider, then the rules' own sentence
            log.warning("A10 provider %s unavailable", provider.name)
            continue
        text = str(result.data["rationale_vi"]).strip()[:RATIONALE_MAX]
        if not text:
            continue
        if usage.provider == RULES_PROVIDER:
            usage.provider, usage.model = provider.name, result.model
        usage.tokens_in += result.tokens_in
        usage.tokens_out += result.tokens_out
        if provider.external:
            usage.cost_estimate_usd += estimate_cost_usd(result.model, result.tokens_in, result.tokens_out)
        return text
    return fallback_rationale(candidate)


def _monday(day) -> Any:
    return day - timedelta(days=day.weekday())


def _body(week, candidate: Candidate, rationale: str, run_id: str) -> dict[str, Any]:
    body: dict[str, Any] = {
        "week": week.isoformat(),
        "kind": candidate.kind,
        "metric_key": candidate.metric_key,
        "title_vi": candidate.title_vi,
        "rationale_vi": rationale,
        "baseline": candidate.baseline,
        "evidence": candidate.evidence,
        "run_id": run_id,
    }
    if candidate.settings_change is not None:
        body["settings_change"] = candidate.settings_change
    if candidate.template is not None:
        body["template"] = candidate.template
    return body


def run_improvement(
    gateway: CoreGatewayClient,
    now: datetime,
    providers: Sequence[LLMProvider],
) -> ImprovementOutcome:
    """Propose this week's improvements; `providers` is the chain the cooperative chose (empty means the fallback sentences only)."""
    week = _monday(vn_day(now))
    inputs = gateway.get_improvement_inputs(week.isoformat())
    candidates = plan_proposals(inputs, now)
    measurements = plan_measurements(inputs, now)
    if not candidates and not measurements:  # nothing to do: no run row and no LLM call, as A9 does for an empty campaign
        return ImprovementOutcome(status="done", run_id="", proposed=0)
    primary = providers[0] if providers else None
    run_id = gateway.start_run(
        agent=AGENT_NAME,
        trigger="schedule",
        provider=primary.name if primary is not None else RULES_PROVIDER,
        model=primary.model if primary is not None else RULES_MODEL,
        prompt_version=PROMPT_VERSION,
        input_hash=sha256_hex(canonical_json(sorted(candidate.metric_key for candidate in candidates))),
    )
    usage = _Usage()
    external_before = _external_requests(providers)
    proposed = 0
    measured = 0
    try:
        for candidate in candidates:
            rationale = _rationale(providers, candidate, usage)
            res = gateway.post_improvement(_body(week, candidate, rationale, run_id))
            if not res.get("deduped"):
                proposed += 1
        # Proposals come first: a refused measurement must not cost the week's proposals.
        for measurement in measurements:
            gateway.post_improvement_effect(
                measurement.improvement_id,
                {"after": measurement.after, "value": measurement.value, "verdict": measurement.verdict},
            )
            measured += 1
    except Exception as exc:
        gateway.finish_run(run_id, status="failed", error=str(exc)[:1000], **usage.as_kwargs(_external_requests(providers) - external_before))
        if isinstance(exc, GatewayHTTPError) and exc.status_code in REFUSAL_STATUSES:
            return ImprovementOutcome(status="refused", run_id=run_id, proposed=proposed, measured=measured)
        raise  # 401, 403, 5xx and network errors: the next cycle retries; posted rows are deduped by the web
    gateway.finish_run(run_id, status="ok", **usage.as_kwargs(_external_requests(providers) - external_before))
    return ImprovementOutcome(status="done", run_id=run_id, proposed=proposed, measured=measured)
