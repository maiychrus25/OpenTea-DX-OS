# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A6 (digest): daily and weekly operating figures, counted from the cooperative's own rows."""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
import logging
from typing import Any

from ..client import CoreGatewayClient
from .journal_review import VN_TZ

log = logging.getLogger("dxos_agent")

AGENT_NAME = "digest"
DAILY_HOUR = 18  # 18:00 Vietnam time, covers the day
WEEKLY_HOUR = 7  # Monday 07:00 Vietnam time, covers the week before
FIGURES = ("journals_new", "journals_approved", "journals_pending", "disease_reports", "lots_created")


@dataclass(frozen=True)
class ReportPeriod:
    """One report to post: its kind and the inclusive Vietnam-time date range."""

    kind: str
    start: date
    end: date


@dataclass
class DigestSchedule:
    """Last report periods posted by this process; the web also dedupes per period, so a restart re-sends safely."""

    last_daily: date | None = None
    last_weekly: date | None = None

    def due_reports(self, now: datetime) -> list[ReportPeriod]:
        local = now.astimezone(VN_TZ)
        today = local.date()
        due: list[ReportPeriod] = []
        if local.hour >= DAILY_HOUR and self.last_daily != today:
            due.append(ReportPeriod("daily", today, today))
        last_monday = today - timedelta(days=7)
        if today.weekday() == 0 and local.hour >= WEEKLY_HOUR and self.last_weekly != last_monday:
            due.append(ReportPeriod("weekly", last_monday, today - timedelta(days=1)))
        return due

    def mark_posted(self, report: ReportPeriod) -> None:
        if report.kind == "daily":
            self.last_daily = report.start
        else:
            self.last_weekly = report.start


def _utc_text(local_midnight: datetime) -> str:
    return local_midnight.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def figures_query(start: str, end: str) -> str:
    """Counts only: each figure is one aggregate alias, filtered to the window [start, end) in UTC."""
    created = f'created_at: {{_gte: "{start}", _lt: "{end}"}}'
    lines = [
        f"journals_new: journal_entries_aggregate(where: {{{created}}}) {{ aggregate {{ count }} }}",
        'journals_approved: journal_entries_aggregate(where: {status: {_eq: "APPROVED"}, '
        f'approved_at: {{_gte: "{start}", _lt: "{end}"}}}}) {{ aggregate {{ count }} }}',
        'journals_pending: journal_entries_aggregate(where: {status: {_eq: "PENDING_APPROVAL"}}) '
        "{ aggregate { count } }",
        f"disease_reports: disease_reports_aggregate(where: {{{created}}}) {{ aggregate {{ count }} }}",
        f"lots_created: lots_aggregate(where: {{{created}}}) {{ aggregate {{ count }} }}",
    ]
    return "query DigestFigures {\n  " + "\n  ".join(lines) + "\n}"


def collect_figures(gateway: CoreGatewayClient, period: ReportPeriod) -> dict[str, int]:
    """Read the C5 figures for a period; `journals_pending` is the queue as of now, not within the period."""
    start = _utc_text(datetime.combine(period.start, time(), VN_TZ))
    end = _utc_text(datetime.combine(period.end + timedelta(days=1), time(), VN_TZ))
    data: dict[str, Any] = gateway.graphql(figures_query(start, end))
    return {name: int(data[name]["aggregate"]["count"]) for name in FIGURES}


def run_digest(gateway: CoreGatewayClient, schedule: DigestSchedule, now: datetime) -> list[ReportPeriod]:
    """Post every report that is due; a failed one stays due and is retried on the next cycle."""
    posted: list[ReportPeriod] = []
    for report in schedule.due_reports(now):
        try:
            figures = collect_figures(gateway, report)
            gateway.post_report(
                {
                    "kind": report.kind,
                    "period_start": report.start.isoformat(),
                    "period_end": report.end.isoformat(),
                    "figures": figures,
                }
            )
        except Exception:
            log.exception("A6 digest %s failed for period starting %s", report.kind, report.start)
            continue
        schedule.mark_posted(report)
        posted.append(report)
    return posted
