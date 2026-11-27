# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Shared pieces of the M4 rule agents: Vietnam-time helpers, the proposal record and the run submission."""
from dataclasses import dataclass
from datetime import date, datetime, timezone
import logging
from typing import Any, Mapping, Sequence
from zoneinfo import ZoneInfo

from ..client import CoreGatewayClient, GatewayHTTPError
from ..evidence import build_evidence, canonical_json, sha256_hex

log = logging.getLogger("dxos_agent")
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
RULES_PROVIDER = "rules"
RULES_MODEL = "rules-v1"
RULES_PROMPT_VERSION = "m4-rules-v1"


def parse_utc(ts: str | datetime) -> datetime:
    """A timestamp as an aware UTC datetime; a timestamp without an offset (as Hasura returns it) is UTC."""
    if isinstance(ts, datetime):
        dt = ts
    else:
        raw = str(ts).strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def vn_day(ts: str | datetime) -> date:
    """Calendar day in Vietnam of a timestamp."""
    return parse_utc(ts).astimezone(VN_TZ).date()


def vn_date_text(day: date) -> str:
    """A Vietnam calendar day as the text used in reasons: dd/MM/yyyy."""
    return day.strftime("%d/%m/%Y")


def utc_text(ts: datetime) -> str:
    """A timestamp as the UTC text Hasura filters compare with."""
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def rows_of(data: Mapping[str, Any], key: str) -> list[Mapping[str, Any]]:
    """Rows of one GraphQL root field; a missing field counts as no rows."""
    return [row for row in (data.get(key) or []) if isinstance(row, Mapping)]


def clamp(value: int, low: int, high: int) -> int:
    # shortcut: a value outside its template's slot range is clamped, so the web never refuses the slot; upgrade if the range is ever exceeded in practice.
    return max(low, min(high, value))


@dataclass(frozen=True)
class Proposal:
    """One proposal an agent wants to make; `evidence` is the built evidence payload of its source rows."""

    kind: str
    payload: dict[str, Any]
    reason_vi: str
    evidence: dict[str, Any]


def proposal(kind: str, payload: dict[str, Any], reason_vi: str, rows: Sequence[Mapping[str, Any]]) -> Proposal:
    return Proposal(kind=kind, payload=payload, reason_vi=reason_vi, evidence=build_evidence(list(rows)))


@dataclass(frozen=True)
class RuleRun:
    run_id: str
    submitted: int
    deduped: int
    refused: int = 0


def submit_rule_run(
    gateway: CoreGatewayClient,
    agent: str,
    proposals: Sequence[Proposal],
    skip_statuses: Sequence[int] = (),
) -> RuleRun | None:
    """Submit proposals as one run; no proposals means no run row and no request, as A1 does for an empty queue.

    A proposal the web answers with one of `skip_statuses` is logged and counted as refused; the others go on.
    """
    if not proposals:
        return None
    input_hash = sha256_hex(canonical_json(sorted(item.evidence["sha256"] for item in proposals)))
    run_id = gateway.start_run(
        agent=agent,
        trigger="schedule",
        provider=RULES_PROVIDER,
        model=RULES_MODEL,
        prompt_version=RULES_PROMPT_VERSION,
        input_hash=input_hash,
    )
    submitted = 0
    deduped = 0
    refused = 0
    try:
        for item in proposals:
            try:
                res = gateway.submit_proposal(
                    {
                        "run_id": run_id,
                        "agent": agent,
                        "kind": item.kind,
                        "payload": item.payload,
                        "reason_vi": item.reason_vi,
                        "evidence": item.evidence,
                        "confidence": 1.0,
                    }
                )
            except GatewayHTTPError as exc:
                if exc.status_code not in skip_statuses:
                    raise
                log.warning("%s: the web refused a %s proposal (%d)", agent, item.kind, exc.status_code)
                refused += 1
                continue
            if res.get("deduped"):
                deduped += 1
            else:
                submitted += 1
    except Exception as exc:
        gateway.finish_run(run_id, status="failed", provider=RULES_PROVIDER, model=RULES_MODEL, error=str(exc)[:1000])
        raise
    gateway.finish_run(run_id, status="ok", provider=RULES_PROVIDER, model=RULES_MODEL)
    return RuleRun(run_id=run_id, submitted=submitted, deduped=deduped, refused=refused)
