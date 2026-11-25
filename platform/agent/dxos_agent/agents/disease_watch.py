# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A3 (disease-watch): groups of nearby disease reports, decided by distance and count alone."""
from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import combinations
import math
from typing import Any, Mapping, Sequence

from ..client import CoreGatewayClient
from ..evidence import canonical_json, disease_report_evidence_row, parcel_evidence_row, sha256_hex
from ..settings import THRESHOLD_DEFAULTS
from .common import Proposal, RuleRun, clamp, parse_utc, proposal, rows_of, submit_rule_run, utc_text

AGENT_NAME = "disease-watch"
DEFAULT_THRESHOLDS = THRESHOLD_DEFAULTS[AGENT_NAME]
OPEN_STATUSES = ("PENDING", "CONFIRMED")
EARTH_RADIUS_M = 6371000.0
MAX_IDS = 50  # a disease.inspection names at most 50 reports and parcels (contract C4)
MAX_NEARBY_PARCELS = 20  # a households message names at most 20 parcels (contract C3)
# Keys of the `disease` slot (contract C3); the labels come from ai-models/tea_class_names_vi.json. healthy is not a disease.
DISEASE_LABELS_VI = {
    "algal_leaf_spot": "Bệnh đốm tảo",
    "birds_eye_spot": "Bệnh đốm mắt chim (bird's eye spot)",
    "brown_blight": "Brown blight",
    "gray_blight": "Bệnh chấm xám",
    "helopeltis": "Bọ xít muỗi",
    "red_leaf_spot": "Bệnh đốm đỏ (red leaf spot)",
    "white_spot": "Bệnh đốm trắng (white spot)",
}

REPORTS_OPERATION = "DiseaseWatchReports"
PARCELS_OPERATION = "DiseaseWatchParcels"


def reports_query(since: datetime) -> str:
    statuses = ", ".join(f'"{status}"' for status in OPEN_STATUSES)
    return (
        f"query {REPORTS_OPERATION} {{\n"
        f"  disease_reports(where: {{status: {{_in: [{statuses}]}}, "
        f'detection_date: {{_gte: "{utc_text(since)}"}}}}) {{\n'
        "    id parcel_id status detection_date ai_disease_name confirmed_diagnosis updated_at\n"
        "  }\n"
        "}"
    )


PARCELS_QUERY = (
    f"query {PARCELS_OPERATION} {{\n"
    "  parcels { id parcel_code status harvest_approved_at updated_at centroid_lat centroid_lng }\n"
    "}"
)


@dataclass(frozen=True)
class _Located:
    """A report in the window with a known disease and a parcel that has a centroid."""

    report: Mapping[str, Any]
    key: str
    parcel: Mapping[str, Any]
    point: tuple[float, float]

    @property
    def code(self) -> str:
        return str(self.parcel["parcel_code"])


def disease_key(report: Mapping[str, Any]) -> str | None:
    """The disease key of a report: its confirmed diagnosis if set, else its AI name; matched by key or Vietnamese label."""
    text = str(report.get("confirmed_diagnosis") or "").strip() or str(report.get("ai_disease_name") or "").strip()
    folded = text.casefold()
    for key, label in DISEASE_LABELS_VI.items():
        if folded in (key.casefold(), label.casefold()):
            return key
    return None


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance in metres between two (latitude, longitude) points."""
    lat1, lng1 = math.radians(a[0]), math.radians(a[1])
    lat2, lng2 = math.radians(b[0]), math.radians(b[1])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def _point(parcel: Mapping[str, Any]) -> tuple[float, float] | None:
    lat, lng = parcel.get("centroid_lat"), parcel.get("centroid_lng")
    if lat is None or lng is None:
        return None
    return float(lat), float(lng)


def _located(reports: Sequence[Mapping[str, Any]], parcels: Sequence[Mapping[str, Any]], since: datetime) -> list[_Located]:
    parcels_by_id = {str(parcel["id"]): parcel for parcel in parcels}
    located: list[_Located] = []
    for report in reports:
        if report.get("status") not in OPEN_STATUSES or not report.get("detection_date"):
            continue
        if parse_utc(report["detection_date"]) < since:
            continue
        key = disease_key(report)
        parcel = parcels_by_id.get(str(report.get("parcel_id")))
        point = _point(parcel) if parcel is not None else None
        if key is None or parcel is None or point is None:
            continue
        located.append(_Located(report=report, key=key, parcel=parcel, point=point))
    return located


def _clusters(items: Sequence[_Located], radius_m: float) -> list[list[_Located]]:
    """Single-linkage groups: reports whose parcels lie within radius_m of each other, transitively."""
    parent = list(range(len(items)))

    def root(index: int) -> int:
        while parent[index] != index:
            index = parent[index]
        return index

    for i, j in combinations(range(len(items)), 2):
        if distance_m(items[i].point, items[j].point) <= radius_m:
            parent[root(j)] = root(i)
    groups: dict[int, list[_Located]] = {}
    for index, item in enumerate(items):
        groups.setdefault(root(index), []).append(item)
    return list(groups.values())


def _unique_parcels(group: Sequence[_Located]) -> list[Mapping[str, Any]]:
    seen: dict[str, Mapping[str, Any]] = {}
    for item in group:
        seen.setdefault(item.code, item.parcel)
    return [seen[code] for code in sorted(seen)]


def _group_proposals(
    key: str,
    group: Sequence[_Located],
    parcels: Sequence[Mapping[str, Any]],
    radius_m: int,
    window_days: int,
) -> list[Proposal]:
    label = DISEASE_LABELS_VI[key]
    report_ids = sorted(str(item.report["id"]) for item in group)
    codes = [str(parcel["parcel_code"]) for parcel in _unique_parcels(group)]
    evidence = [disease_report_evidence_row(item.report) for item in group]
    evidence += [parcel_evidence_row(parcel) for parcel in _unique_parcels(group)]

    inspection = proposal(
        "disease.inspection",
        {
            "disease": key,
            # shortcut: a group past 50 reports is inspected by its first 50 report ids, the count is in the reason; upgrade if groups get that large.
            "report_ids": report_ids[:MAX_IDS],
            "parcel_codes": codes[:MAX_IDS],
            "radius_m": clamp(radius_m, 100, 20000),
            "days": clamp(window_days, 1, 30),
        },
        f"Có {len(group)} báo cáo {label} trong {window_days} ngày, trong bán kính {radius_m} m: thửa {', '.join(codes)}.",
        evidence,
    )

    # The households message covers the group plus cooperative parcels within the radius, nearest first.
    nearby: list[tuple[float, str]] = []
    for parcel in parcels:
        point = _point(parcel)
        if point is None:
            continue
        distance = min(distance_m(point, item.point) for item in group)
        if distance <= radius_m:
            nearby.append((distance, str(parcel["parcel_code"])))
    nearby_codes = sorted(code for _distance, code in sorted(nearby)[:MAX_NEARBY_PARCELS])
    subject = f"disease_nearby:{key}:{min(report_ids)}"
    households = proposal(
        "notification.households",
        {
            "template": "disease_nearby",
            "slots": {
                "disease": key,
                "parcel_codes": nearby_codes,
                "count": clamp(len(group), 2, 500),
                "days": clamp(window_days, 1, 30),
            },
            "subjects": [subject],
        },
        f"Có {len(group)} báo cáo {label} trong {window_days} ngày qua ở các thửa {', '.join(nearby_codes)}.",
        evidence,
    )
    return [inspection, households]


def disease_watch_proposals(
    reports: Sequence[Mapping[str, Any]],
    parcels: Sequence[Mapping[str, Any]],
    now: datetime,
    thresholds: Mapping[str, Any] | None = None,
) -> list[Proposal]:
    cfg = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    radius_m = float(cfg["radius_m"])
    window_days = int(cfg["window_days"])
    located = _located(reports, parcels, now - timedelta(days=window_days))
    by_key: dict[str, list[_Located]] = {}
    for item in located:
        by_key.setdefault(item.key, []).append(item)

    proposals: list[Proposal] = []
    for key in sorted(by_key):
        for group in _clusters(by_key[key], radius_m):
            if len(group) >= int(cfg["min_reports"]):
                proposals.extend(_group_proposals(key, group, parcels, int(radius_m), window_days))
    return proposals


def fetch_window(
    gateway: CoreGatewayClient,
    now: datetime,
    thresholds: Mapping[str, Any] | None = None,
) -> tuple[list[Mapping[str, Any]], list[Mapping[str, Any]]]:
    """The reports of the window and the cooperative's parcels; the caller may reuse them for the change check."""
    cfg = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    reports = rows_of(gateway.graphql(reports_query(now - timedelta(days=int(cfg["window_days"])))), "disease_reports")
    parcels = rows_of(gateway.graphql(PARCELS_QUERY), "parcels")
    return reports, parcels


def window_fingerprint(reports: Sequence[Mapping[str, Any]]) -> str:
    """Changes when a report in the window is added, decided, or relabelled; the scheduler runs A3 then."""
    rows = [
        [str(r.get("id")), str(r.get("status")), str(r.get("detection_date")), str(r.get("ai_disease_name")), str(r.get("confirmed_diagnosis"))]
        for r in reports
    ]
    return sha256_hex(canonical_json(sorted(rows)))


def run_disease_watch(
    gateway: CoreGatewayClient,
    now: datetime,
    thresholds: Mapping[str, Any] | None = None,
    window: tuple[list[Mapping[str, Any]], list[Mapping[str, Any]]] | None = None,
) -> RuleRun | None:
    """Submit this cycle's A3 proposals; `window` is the pre-fetched (reports, parcels) pair when the caller has one."""
    reports, parcels = window if window is not None else fetch_window(gateway, now, thresholds)
    return submit_rule_run(gateway, AGENT_NAME, disease_watch_proposals(reports, parcels, now, thresholds))
