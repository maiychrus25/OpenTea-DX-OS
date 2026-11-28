# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A13 (cross-check): rule-only alerts on real operating data, sent to officers and heads for review.

R1: a pesticide advance with no spraying logged by the household after the grace period.
R2: fresh leaf weighed on a parcel above its area norm in one flush.
"""
from datetime import date, datetime, timedelta
import math
from typing import Any, Collection, Mapping, Sequence

from ..client import CoreGatewayClient
from ..evidence import advance_evidence_row, parcel_evidence_row, ticket_evidence_row
from ..settings import THRESHOLD_DEFAULTS
from .common import Proposal, RuleRun, proposal, rows_of, submit_rule_run, vn_date_text, vn_day

AGENT_NAME = "cross-check"
DEFAULT_THRESHOLDS = THRESHOLD_DEFAULTS[AGENT_NAME]
KIND = "notification.internal"
ADVANCE_LOOKBACK_DAYS = 60  # an older advance is not raised the first day the agent runs
WINDOW_DAYS = 30  # tickets without a flush are grouped over this many days
TICKET_LOOKBACK_DAYS = 45
MAX_TICKET_ROWS = 48  # evidence holds at most 50 rows: the parcel and its tickets; a busier flush cites its largest tickets
MAX_PARCEL_CODES = 20
# A spraying counts unless its entry is a draft or was rejected (the same rule as the withdrawal period in harvest-ready).
SPRAYING_EXCLUDED_STATUSES = ("DRAFT", "REJECTED")

ADVANCES_OPERATION = "CrossCheckAdvances"
ITEMS_OPERATION = "CrossCheckItems"
SPRAYINGS_OPERATION = "CrossCheckSprayings"
PARCELS_OPERATION = "CrossCheckParcels"
TICKETS_OPERATION = "CrossCheckTickets"
ALERTED_OPERATION = "CrossCheckAlerted"
ADVANCES_QUERY = (
    f"query {ADVANCES_OPERATION}($since: date!) {{\n"
    '  input_advances(where: {status: {_eq: "VALID"}, advanced_on: {_gte: $since}}, order_by: [{advanced_on: asc}, {id: asc}]) {\n'
    "    id household_id item_id quantity advanced_on status settlement_id\n"
    "  }\n"
    "}"
)
ITEMS_QUERY = (
    f"query {ITEMS_OPERATION} {{\n"
    '  input_items(where: {kind: {_eq: "PESTICIDE"}}) { id kind pesticide_product_id active }\n'
    "}"
)
SPRAYINGS_QUERY = (
    f"query {SPRAYINGS_OPERATION}($since: timestamptz!) {{\n"
    '  journal_entries(where: {activity_type: {_eq: "SPRAYING"}, status: {_nin: ["DRAFT", "REJECTED"]}, entry_date: {_gte: $since}}) {\n'
    "    id parcel_id entry_date activity_type status\n"
    "    activities(order_by: [{id: asc}]) { id pesticide_product_id }\n"
    "  }\n"
    "}"
)
PARCELS_QUERY = (
    f"query {PARCELS_OPERATION} {{\n"
    "  parcels(order_by: [{parcel_code: asc}]) { id parcel_code household_id area_ha status harvest_approved_at updated_at }\n"
    "}"
)
TICKETS_QUERY = (
    f"query {TICKETS_OPERATION}($since: timestamptz!) {{\n"
    '  fresh_leaf_tickets(where: {status: {_eq: "VALID"}, weighed_at: {_gte: $since}}, order_by: [{weighed_at: asc}, {id: asc}]) {\n'
    "    id household_id parcel_id cycle_id weighed_at net_kg status\n"
    "  }\n"
    "}"
)
ALERTED_QUERY = (
    f"query {ALERTED_OPERATION} {{\n"
    f'  platform_agent_proposals(where: {{agent: {{_eq: "{AGENT_NAME}"}}}}) {{ subject_ids }}\n'
    "}"
)


def _cfg(thresholds: Mapping[str, Any] | None) -> dict[str, Any]:
    return {**DEFAULT_THRESHOLDS, **(thresholds or {})}


def advance_alerts(
    advances: Sequence[Mapping[str, Any]],
    items: Sequence[Mapping[str, Any]],
    sprayings: Sequence[Mapping[str, Any]],
    parcels: Sequence[Mapping[str, Any]],
    today: date,
    thresholds: Mapping[str, Any] | None = None,
    alerted: Collection[str] = (),
) -> list[Proposal]:
    """R1. Each advance is raised once: its key is its id, and a key already in `alerted` is skipped."""
    cfg = _cfg(thresholds)
    grace = int(cfg["grace_days"])
    items_by_id = {str(item["id"]): item for item in items}
    parcels_by_household: dict[str, list[Mapping[str, Any]]] = {}
    for parcel in parcels:
        parcels_by_household.setdefault(str(parcel["household_id"]), []).append(parcel)
    sprays = [
        entry
        for entry in sprayings
        if entry.get("activity_type") == "SPRAYING" and entry.get("status") not in SPRAYING_EXCLUDED_STATUSES
    ]

    proposals: list[Proposal] = []
    for advance in sorted(advances, key=lambda item: (str(item["advanced_on"]), str(item["id"]))):
        item = items_by_id.get(str(advance["item_id"]))
        if advance.get("status") != "VALID" or item is None or item.get("kind") != "PESTICIDE":
            continue
        subject = f"cross-check:advance:{advance['id']}"
        start = date.fromisoformat(str(advance["advanced_on"])[:10])
        end = start + timedelta(days=grace)
        if today <= end or subject in alerted:
            continue
        household_parcels = parcels_by_household.get(str(advance["household_id"]), [])
        parcel_ids = {str(parcel["id"]) for parcel in household_parcels}
        product_id = item.get("pesticide_product_id")
        cleared = any(
            str(entry["parcel_id"]) in parcel_ids
            and start <= vn_day(entry["entry_date"]) <= end
            and (
                product_id is None
                or any(act.get("pesticide_product_id") == product_id for act in entry.get("activities") or [])
            )
            for entry in sprays
        )
        if cleared:
            continue
        codes = sorted({str(parcel["parcel_code"]) for parcel in household_parcels})[:MAX_PARCEL_CODES]
        who = f"có thửa {', '.join(codes)}" if codes else f"mã {advance['household_id']}"
        proposals.append(
            proposal(
                KIND,
                {
                    "template": "advance_without_spraying",
                    "slots": {
                        "household_id": str(advance["household_id"]),
                        "parcel_codes": codes,
                        "advanced_on": start.isoformat(),
                        "grace_days": grace,
                    },
                    "subjects": [subject],
                },
                f"Hộ {who} nhận vật tư thuốc ngày {vn_date_text(start)} nhưng chưa ghi nhật ký phun sau {grace} ngày. "
                "Cán bộ kiểm tra giúp.",
                [advance_evidence_row(advance)],
            )
        )
    return proposals


def norm_alerts(
    tickets: Sequence[Mapping[str, Any]],
    parcels: Sequence[Mapping[str, Any]],
    alerted: Collection[str],
    today: date,
    thresholds: Mapping[str, Any] | None = None,
) -> list[Proposal]:
    """R2. The key carries a step number that rises by `realert_extra` of the limit, so a flush is raised once per step."""
    cfg = _cfg(thresholds)
    norm = float(cfg["fresh_norm_kg_per_ha_flush"])
    tolerance = float(cfg["norm_tolerance"])
    extra = float(cfg["realert_extra"])
    window_start = today - timedelta(days=WINDOW_DAYS - 1)
    parcels_by_id = {str(parcel["id"]): parcel for parcel in parcels}

    groups: dict[tuple[str, str | None], list[Mapping[str, Any]]] = {}
    for ticket in tickets:
        if ticket.get("status") != "VALID":
            continue
        cycle_id = ticket.get("cycle_id")
        if cycle_id is None and not window_start <= vn_day(ticket["weighed_at"]) <= today:
            continue
        groups.setdefault((str(ticket["parcel_id"]), None if cycle_id is None else str(cycle_id)), []).append(ticket)

    proposals: list[Proposal] = []
    for (parcel_id, cycle_id), group in sorted(groups.items(), key=lambda item: (item[0][0], item[0][1] or "")):
        parcel = parcels_by_id.get(parcel_id)
        if parcel is None:
            continue
        limit = float(parcel["area_ha"]) * norm * tolerance
        total = sum(float(ticket["net_kg"]) for ticket in group)
        if limit <= 0 or total <= limit:
            continue
        step = math.floor((total / limit - 1) / extra)
        prefix = f"cross-check:norm:{parcel_id}:{cycle_id or 'window'}:"
        raised = [int(key[len(prefix):]) for key in alerted if key.startswith(prefix) and key[len(prefix):].isdigit()]
        if raised and step <= max(raised):
            continue
        area = round(float(parcel["area_ha"]), 2)
        kg, norm_kg = round(total), round(limit)
        # The total counts every ticket; a busy flush cites only its largest ones, kept in id order.
        cited = sorted(sorted(group, key=lambda t: (-float(t["net_kg"]), str(t["id"])))[:MAX_TICKET_ROWS], key=lambda t: str(t["id"]))
        note = f" ({len(group)} phiếu; bằng chứng gồm {MAX_TICKET_ROWS} phiếu lớn nhất)" if len(group) > MAX_TICKET_ROWS else ""
        proposals.append(
            proposal(
                KIND,
                {
                    "template": "weighing_over_norm",
                    "slots": {"parcel_code": str(parcel["parcel_code"]), "area_ha": area, "kg": kg, "norm_kg": norm_kg},
                    "subjects": [f"{prefix}{step}"],
                },
                f"Thửa {parcel['parcel_code']} ({area:g} ha) đã cân {kg} kg trong lứa này, vượt định mức {norm_kg} kg. "
                f"Kiểm tra búp gom từ thửa khác.{note}",
                [parcel_evidence_row(parcel)] + [ticket_evidence_row(ticket) for ticket in cited],
            )
        )
    return proposals


def run_cross_check(
    gateway: CoreGatewayClient,
    now: datetime,
    thresholds: Mapping[str, Any] | None = None,
) -> RuleRun | None:
    today = vn_day(now)
    advances = rows_of(gateway.graphql(ADVANCES_QUERY, {"since": (today - timedelta(days=ADVANCE_LOOKBACK_DAYS)).isoformat()}), "input_advances")
    items = rows_of(gateway.graphql(ITEMS_QUERY), "input_items")
    since_spraying = f"{(today - timedelta(days=ADVANCE_LOOKBACK_DAYS)).isoformat()}T00:00:00+07:00"
    sprayings = rows_of(gateway.graphql(SPRAYINGS_QUERY, {"since": since_spraying}), "journal_entries")
    parcels = rows_of(gateway.graphql(PARCELS_QUERY), "parcels")
    since_ticket = f"{(today - timedelta(days=TICKET_LOOKBACK_DAYS)).isoformat()}T00:00:00+07:00"
    tickets = rows_of(gateway.graphql(TICKETS_QUERY, {"since": since_ticket}), "fresh_leaf_tickets")
    previous = rows_of(gateway.graphql(ALERTED_QUERY), "platform_agent_proposals")
    alerted = {str(subject) for row in previous for subject in row.get("subject_ids") or []}
    proposals = advance_alerts(advances, items, sprayings, parcels, today, thresholds, alerted) + norm_alerts(
        tickets, parcels, alerted, today, thresholds
    )
    return submit_rule_run(gateway, AGENT_NAME, proposals)
