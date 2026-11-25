# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A4 (harvest-ready): proposes approving a harvest once its crop is near and every spraying has cleared withdrawal."""
from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Mapping, Sequence

from ..client import CoreGatewayClient
from ..evidence import crop_cycle_evidence_row, journal_entry_evidence_row, parcel_evidence_row
from ..settings import THRESHOLD_DEFAULTS
from .common import Proposal, RuleRun, parse_utc, proposal, rows_of, submit_rule_run, vn_date_text, vn_day

log = logging.getLogger("dxos_agent")

AGENT_NAME = "harvest-ready"
DEFAULT_THRESHOLDS = THRESHOLD_DEFAULTS[AGENT_NAME]
MAX_SPRAYING_ENTRIES = 48  # more entries than this: the parcel is skipped and logged, its evidence would be too large
NO_HARVEST_DATE = datetime.min.replace(tzinfo=timezone.utc)

PARCELS_OPERATION = "HarvestReadyParcels"
SPRAYINGS_OPERATION = "HarvestReadySprayings"
PARCELS_QUERY = (
    f"query {PARCELS_OPERATION} {{\n"
    '  parcels(where: {status: {_eq: "TENDING"}}) {\n'
    "    id parcel_code status harvest_approved_at updated_at\n"
    "    crop_cycles(where: {harvested_at: {_is_null: true}}, order_by: [{sowed_at: desc}]) {\n"
    "      id parcel_id season sowed_at estimated_harvest_date harvested_at\n"
    "    }\n"
    "  }\n"
    "}"
)
SPRAYINGS_QUERY = (
    f"query {SPRAYINGS_OPERATION} {{\n"
    '  journal_entries(where: {activity_type: {_eq: "SPRAYING"}, status: {_neq: "DRAFT"}, '
    '  parcel: {status: {_eq: "TENDING"}}}) {\n'
    "    id parcel_id entry_date activity_type status notes updated_at\n"
    "    activities(order_by: [{id: asc}]) { id activity_detail product_name dosage withdrawal_days safe_harvest_date }\n"
    "  }\n"
    "}"
)


def _newest_open_cycle(parcel: Mapping[str, Any]) -> Mapping[str, Any] | None:
    """The newest crop cycle that is not harvested yet and has an estimated harvest date."""
    cycles = [
        cycle
        for cycle in parcel.get("crop_cycles") or []
        if cycle.get("harvested_at") is None and cycle.get("estimated_harvest_date")
    ]
    if not cycles:
        return None
    return max(
        cycles,
        key=lambda cycle: (parse_utc(cycle["sowed_at"]) if cycle.get("sowed_at") else NO_HARVEST_DATE, str(cycle["id"])),
    )


def harvest_proposals(
    parcels: Sequence[Mapping[str, Any]],
    sprayings: Sequence[Mapping[str, Any]],
    now: datetime,
    thresholds: Mapping[str, Any] | None = None,
) -> list[Proposal]:
    cfg = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    today = vn_day(now)
    harvest_limit = today + timedelta(days=int(cfg["harvest_window_days"]))

    sprays_by_parcel: dict[str, list[Mapping[str, Any]]] = {}
    for entry in sprayings:
        if entry.get("activity_type") == "SPRAYING" and entry.get("status") != "DRAFT":
            sprays_by_parcel.setdefault(str(entry["parcel_id"]), []).append(entry)

    proposals: list[Proposal] = []
    for parcel in sorted(parcels, key=lambda item: str(item["parcel_code"])):
        if parcel.get("status") != "TENDING":
            continue
        cycle = _newest_open_cycle(parcel)
        if cycle is None or vn_day(cycle["estimated_harvest_date"]) > harvest_limit:
            continue
        entries = sprays_by_parcel.get(str(parcel["id"]), [])
        if len(entries) > MAX_SPRAYING_ENTRIES:
            log.warning("A4 harvest-ready skipped parcel %s: %d spraying entries", parcel["parcel_code"], len(entries))
            continue
        cleared = all(
            act.get("safe_harvest_date") and vn_day(act["safe_harvest_date"]) <= today
            for entry in entries
            for act in entry.get("activities") or []
        )
        if not cleared:
            continue
        code = str(parcel["parcel_code"])
        proposals.append(
            proposal(
                "harvest.approve",
                {"parcel_id": str(parcel["id"])},
                f"Thửa {code} dự kiến thu hoạch ngày {vn_date_text(vn_day(cycle['estimated_harvest_date']))} "
                "và các lần phun đã hết thời gian cách ly.",
                [parcel_evidence_row(parcel), crop_cycle_evidence_row(cycle)]
                + [journal_entry_evidence_row(entry) for entry in entries],
            )
        )
    return proposals


def run_harvest_ready(
    gateway: CoreGatewayClient,
    now: datetime,
    thresholds: Mapping[str, Any] | None = None,
) -> RuleRun | None:
    parcels = rows_of(gateway.graphql(PARCELS_QUERY), "parcels")
    sprayings = rows_of(gateway.graphql(SPRAYINGS_QUERY), "journal_entries")
    return submit_rule_run(gateway, AGENT_NAME, harvest_proposals(parcels, sprayings, now, thresholds))
