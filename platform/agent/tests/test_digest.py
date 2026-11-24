# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A6 digest: report timing in Vietnam time, the figures' UTC window, posting once per period."""
from datetime import date, datetime, timezone

from dxos_agent.agents import digest
from dxos_agent.agents.digest import DigestSchedule, ReportPeriod, figures_query, run_digest

# 2026-11-24 is a Tuesday. 18:00 Vietnam time is 11:00 UTC.
TUESDAY_17_30_VN = datetime(2026, 11, 24, 10, 30, tzinfo=timezone.utc)
TUESDAY_18_00_VN = datetime(2026, 11, 24, 11, 0, tzinfo=timezone.utc)
MONDAY_07_00_VN = datetime(2026, 11, 23, 0, 0, tzinfo=timezone.utc)  # Monday 07:00 Vietnam time
MONDAY_06_59_VN = datetime(2026, 11, 22, 23, 59, tzinfo=timezone.utc)


class FakeDigestGateway:
    """Serves aggregate counts for the digest figures and records posted reports."""

    def __init__(self, fail_posts: int = 0) -> None:
        self.queries: list[str] = []
        self.reports: list[dict] = []
        self._fail_posts = fail_posts

    def graphql(self, query, variables=None):
        del variables
        self.queries.append(query)
        return {name: {"aggregate": {"count": index}} for index, name in enumerate(digest.FIGURES, start=1)}

    def post_report(self, report):
        if self._fail_posts:
            self._fail_posts -= 1
            raise RuntimeError("web unavailable")
        self.reports.append(dict(report))


def test_daily_report_is_due_from_eighteen_in_vietnam_time_and_once_per_day():
    schedule = DigestSchedule()
    assert schedule.due_reports(TUESDAY_17_30_VN) == []
    assert schedule.due_reports(TUESDAY_18_00_VN) == [ReportPeriod("daily", date(2026, 11, 24), date(2026, 11, 24))]

    schedule.last_daily = date(2026, 11, 24)
    assert schedule.due_reports(TUESDAY_18_00_VN) == []


def test_weekly_report_is_due_on_monday_from_seven_for_the_week_before():
    schedule = DigestSchedule()
    assert [r for r in schedule.due_reports(MONDAY_06_59_VN) if r.kind == "weekly"] == []
    weekly = [r for r in schedule.due_reports(MONDAY_07_00_VN) if r.kind == "weekly"]
    assert weekly == [ReportPeriod("weekly", date(2026, 11, 16), date(2026, 11, 22))]


def test_weekly_report_is_not_due_on_other_days():
    tuesday_morning = datetime(2026, 11, 24, 1, 0, tzinfo=timezone.utc)
    assert [r for r in DigestSchedule().due_reports(tuesday_morning) if r.kind == "weekly"] == []


def test_figures_are_counted_over_the_vietnam_day_expressed_in_utc():
    query = figures_query("2026-11-23T17:00:00Z", "2026-11-24T17:00:00Z")
    assert 'created_at: {_gte: "2026-11-23T17:00:00Z", _lt: "2026-11-24T17:00:00Z"}' in query
    assert "journal_entries_aggregate" in query and "disease_reports_aggregate" in query
    assert "lots_aggregate" in query and "PENDING_APPROVAL" in query


def test_run_digest_posts_the_figures_once_per_period():
    gateway = FakeDigestGateway()
    schedule = DigestSchedule()

    posted = run_digest(gateway, schedule, TUESDAY_18_00_VN)
    again = run_digest(gateway, schedule, TUESDAY_18_00_VN)

    assert posted == [ReportPeriod("daily", date(2026, 11, 24), date(2026, 11, 24))]
    assert again == []
    assert gateway.reports == [
        {
            "kind": "daily",
            "period_start": "2026-11-24",
            "period_end": "2026-11-24",
            "figures": {name: index for index, name in enumerate(digest.FIGURES, start=1)},
        }
    ]


def test_failed_post_stays_due_and_is_retried_next_cycle():
    gateway = FakeDigestGateway(fail_posts=1)
    schedule = DigestSchedule()

    assert run_digest(gateway, schedule, TUESDAY_18_00_VN) == []
    assert run_digest(gateway, schedule, TUESDAY_18_00_VN) == [
        ReportPeriod("daily", date(2026, 11, 24), date(2026, 11, 24))
    ]
    assert len(gateway.reports) == 1
