# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A8 (staff-tasks): work for the staff from the proposals approved in the last day (contract C4). Rules only, no LLM."""
from datetime import datetime
import logging
from typing import Any, Mapping, Sequence

from ..client import CoreGatewayClient
from ..evidence import build_evidence
from .common import Proposal, RuleRun, submit_rule_run, vn_day

log = logging.getLogger("dxos_agent")

AGENT_NAME = "staff-tasks"
TASK_KIND = "staff.task.create"
MAX_TASKS = 10
TITLE_MAX = 120
TECHNICAL_DEPARTMENT = "Kỹ thuật"
HARVEST = "harvest.approve"
INSPECTION = "disease.inspection"
HOUSEHOLDS = "notification.households"
# Harvests come first, then inspections, then watering, so the daily cap drops the least urgent work.
TITLES = {HARVEST: "Hái chè thửa", INSPECTION: "Kiểm tra bệnh quanh thửa", HOUSEHOLDS: "Tưới thửa"}
ORDER = {HARVEST: 0, INSPECTION: 1, HOUSEHOLDS: 2}
REASONS = {
    HARVEST: "Đề xuất duyệt thu hoạch đã được duyệt trong 24 giờ qua, cần người hái chè.",
    INSPECTION: "Đề xuất kiểm tra bệnh đã được duyệt trong 24 giờ qua, cần người đi kiểm tra.",
    HOUSEHOLDS: "Cảnh báo đất khô đã được duyệt trong 24 giờ qua, cần người tưới.",
}


def _task_kind(source: Mapping[str, Any]) -> str | None:
    """The source kind that gets a task: a dry-soil notice, a harvest or an inspection; nothing else does."""
    kind = source.get("kind")
    if kind == HOUSEHOLDS:
        return kind if source.get("template") == "dry_soil" else None
    return kind if kind in (HARVEST, INSPECTION) else None


def _pick_assignee(roster: Sequence[Mapping[str, Any]], load: dict[str, int], kind: str) -> Mapping[str, Any] | None:
    """The active member with the fewest tasks suggested today; inspections prefer the technical department."""
    active = [member for member in roster if member.get("active") is not False]
    if kind == INSPECTION:
        active = [m for m in active if m.get("department") == TECHNICAL_DEPARTMENT] or active
    if not active:
        return None
    return min(active, key=lambda m: (load.get(str(m["staff_ref"]), 0), str(m["staff_ref"])))


def staff_task_proposals(inputs: Mapping[str, Any], now: datetime) -> list[Proposal]:
    today = vn_day(now).isoformat()
    roster = [m for m in inputs.get("roster") or [] if isinstance(m, Mapping) and m.get("staff_ref")]
    candidates = []
    for source in inputs.get("proposals") or []:
        kind = _task_kind(source)
        codes = [str(p["code"]) for p in source.get("parcels") or [] if p.get("code")]
        if kind is not None and codes:
            candidates.append((ORDER[kind], codes[0], kind, source, codes))
    candidates.sort(key=lambda item: item[:2] + (str(item[3]["id"]),))

    load: dict[str, int] = {}
    proposals: list[Proposal] = []
    for _, _, kind, source, codes in candidates:
        if len(proposals) >= MAX_TASKS:
            break
        # The staff app cannot create a task without an assignee, so a task with nobody to give it to is skipped.
        assignee = _pick_assignee(roster, load, kind)
        if assignee is None:
            log.info("A8 staff-tasks skipped source %s: no active staff member to assign", source["id"])
            continue
        parcels = source["parcels"]
        payload: dict[str, Any] = {
            "title_vi": f"{TITLES[kind]} {', '.join(codes)}"[:TITLE_MAX],
            "due_date": today,
            "source": {"kind": kind, "proposal_id": str(source["id"])},
        }
        if len(parcels) == 1 and parcels[0].get("id"):
            payload["parcel_id"] = str(parcels[0]["id"])
        ref = str(assignee["staff_ref"])
        load[ref] = load.get(ref, 0) + 1
        payload["assignee_ref"] = ref
        reason = REASONS[kind] + f" Gợi ý giao cho {assignee.get('name') or ref}."
        row = source.get("evidence_row")
        proposals.append(Proposal(TASK_KIND, payload, reason, build_evidence([row] if row else [])))
    return proposals


def run_staff_tasks(gateway: CoreGatewayClient, now: datetime) -> RuleRun | None:
    return submit_rule_run(gateway, AGENT_NAME, staff_task_proposals(gateway.get_staff_inputs(), now))
