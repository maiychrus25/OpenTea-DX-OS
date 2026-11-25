# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A5 (bulletin): writes the market bulletin text with the chosen LLM; rules only decide that there is a bulletin."""
from dataclasses import dataclass
from datetime import datetime, timedelta
import json
import logging
import re
from typing import Any, Mapping, Sequence

from ..client import CoreGatewayClient
from ..evidence import canonical_json, market_evidence_row, sha256_hex
from ..providers.base import LLMMessage, LLMProvider, LLMResult, ProviderError
from ..providers.pricing import estimate_cost_usd
from ..settings import THRESHOLD_DEFAULTS
from .common import Proposal, parse_utc, proposal, rows_of, utc_text, vn_day, vn_date_text

log = logging.getLogger("dxos_agent")

AGENT_NAME = "bulletin"
PROMPT_VERSION = "m4-bulletin-v1"
DEFAULT_THRESHOLDS = THRESHOLD_DEFAULTS[AGENT_NAME]
COMMODITY_RE = re.compile(r"^[A-Za-z][A-Za-z ]{0,63}$")
MAX_EVIDENCE_ROWS = 50
MAX_SOURCES = 30  # the web takes at most 30 sources (contract C4)
BULLETIN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["bulletin_vi"],
    "additionalProperties": False,
    "properties": {"bulletin_vi": {"type": "string", "minLength": 50, "maxLength": 4000}},
}
MARKET_OPERATION = "BulletinMarketRows"
BULLETIN_SYSTEM_PROMPT = (
    "Bạn là trợ lý viết bản tin giá chè cho HTX. Chỉ viết bằng tiếng Việt có dấu, dựa trên các dòng số liệu "
    "được cung cấp; không được nêu con số nào không có trong các dòng đó. "
    "Trả lời bằng một đối tượng JSON có khóa bulletin_vi."
)


@dataclass(frozen=True)
class BulletinOutcome:
    status: str  # ok, or skipped when there were no rows or every provider failed
    run_id: str
    submitted: int
    deduped: int


def market_query(commodity: str, since: datetime) -> str:
    return (
        f"query {MARKET_OPERATION} {{\n"
        f"  market_data(where: {{commodity: {{_eq: {json.dumps(commodity)}}}, "
        f'fetched_at: {{_gte: "{utc_text(since)}"}}}}, order_by: [{{fetched_at: desc}}]) {{\n'
        "    id source commodity metric value unit period fetched_at\n"
        "  }\n"
        "}"
    )


def _newest_rows(
    rows: Sequence[Mapping[str, Any]],
    commodity: str,
    since: datetime,
) -> list[Mapping[str, Any]]:
    """Market rows of the commodity fetched inside the window, newest first."""
    inside = [
        row
        for row in rows
        if row.get("commodity") == commodity and row.get("fetched_at") and parse_utc(row["fetched_at"]) >= since
    ]
    return sorted(inside, key=lambda row: (parse_utc(row["fetched_at"]), str(row["id"])), reverse=True)


def _messages(commodity: str, rows: Sequence[Mapping[str, Any]]) -> list[LLMMessage]:
    payload = {
        "commodity": commodity,
        "rows": [
            {"source": row["source"], "metric": row["metric"], "value": row["value"], "unit": row["unit"], "period": row["period"]}
            for row in rows[:MAX_EVIDENCE_ROWS]
        ],
    }
    return [
        LLMMessage(role="system", content=BULLETIN_SYSTEM_PROMPT),
        LLMMessage(role="user", content=json.dumps(payload, ensure_ascii=False, sort_keys=True)),
    ]


def _external_requests(chain: Sequence[LLMProvider]) -> int:
    return sum(getattr(provider, "requests_sent", 0) for provider in chain if provider.external)


def _complete_with_fallback(chain: Sequence[LLMProvider], messages: Sequence[LLMMessage]) -> tuple[LLMProvider, LLMResult]:
    """Try each provider in order; the last ProviderError is raised when all of them fail."""
    last_error: ProviderError | None = None
    for candidate in chain:
        try:
            return candidate, candidate.complete_json(messages, BULLETIN_SCHEMA)
        except ProviderError as exc:
            log.warning("A5 provider %s unavailable: %s", candidate.name, type(exc).__name__)
            last_error = exc
    assert last_error is not None
    raise last_error


def run_bulletin(
    gateway: CoreGatewayClient,
    now: datetime,
    provider: LLMProvider,
    thresholds: Mapping[str, Any] | None = None,
    fallback: LLMProvider | None = None,
) -> BulletinOutcome:
    """Write and submit today's bulletin; `provider` is the one the cooperative chose, `fallback` is Ollama when it is external."""
    cfg = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    commodity = str(cfg["commodity"]) if COMMODITY_RE.match(str(cfg["commodity"])) else DEFAULT_THRESHOLDS["commodity"]
    hours = int(cfg["market_hours"])
    since = now - timedelta(hours=hours)
    rows = _newest_rows(rows_of(gateway.graphql(market_query(commodity, since)), "market_data"), commodity, since)
    if not rows:
        return BulletinOutcome(status="skipped", run_id="", submitted=0, deduped=0)

    chain = [provider] if fallback is None else [provider, fallback]
    external_before = _external_requests(chain)
    evidence = [market_evidence_row(row) for row in rows[:MAX_EVIDENCE_ROWS]]
    run_id = gateway.start_run(
        agent=AGENT_NAME,
        trigger="schedule",
        provider=provider.name,
        model=provider.model,
        prompt_version=PROMPT_VERSION,
        input_hash=sha256_hex(canonical_json(sorted(item["sha256"] for item in evidence))),
    )
    try:
        used, result = _complete_with_fallback(chain, _messages(commodity, rows))
    except ProviderError as exc:
        gateway.finish_run(
            run_id,
            status="skipped",
            provider=provider.name,
            model=provider.model,
            external_calls=_external_requests(chain) - external_before,
            error=str(exc)[:1000],
        )
        return BulletinOutcome(status="skipped", run_id=run_id, submitted=0, deduped=0)

    tokens_in, tokens_out = result.tokens_in, result.tokens_out
    cost = estimate_cost_usd(result.model, tokens_in, tokens_out) if used.external else 0.0
    try:
        period_day = vn_day(now)
        sources = [
            {
                "source": row["source"],
                "metric": row["metric"],
                "value": row["value"],
                "unit": row["unit"],
                "period": row["period"],
            }
            for row in rows[:MAX_SOURCES]
        ]
        item = proposal(
            "bulletin.publish",
            {
                "commodity": commodity,
                "period_day": period_day.isoformat(),
                "bulletin_vi": result.data["bulletin_vi"],
                "sources": sources,
            },
            f"Bản tin {commodity} ngày {vn_date_text(period_day)} từ {len(sources)} số liệu thị trường trong {hours} giờ qua.",
            evidence,
        )
        res = gateway.submit_proposal(_body(run_id, item))
    except Exception as exc:
        gateway.finish_run(run_id, status="failed", provider=used.name, model=result.model, error=str(exc)[:1000])
        raise
    gateway.finish_run(
        run_id,
        status="ok",
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_estimate_usd=cost,
        provider=used.name,
        model=result.model,
        external_calls=_external_requests(chain) - external_before,
    )
    deduped = 1 if res.get("deduped") else 0
    return BulletinOutcome(status="ok", run_id=run_id, submitted=1 - deduped, deduped=deduped)


def _body(run_id: str, item: Proposal) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "agent": AGENT_NAME,
        "kind": item.kind,
        "payload": item.payload,
        "reason_vi": item.reason_vi,
        "evidence": item.evidence,
        "confidence": 1.0,
    }
