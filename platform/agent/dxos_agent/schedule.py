# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""When the agents run for one cooperative: A1's review clock, and the M4 interval and daily schedules."""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
REVIEW_INTERVAL = timedelta(minutes=60)
REVIEW_HOUR_START = 6  # 06:00 Vietnam time, inclusive
REVIEW_HOUR_END = 20  # 20:00 Vietnam time, exclusive


@dataclass
class ReviewSchedule:
    """Memory of the last A1 decision for one cooperative, kept across cycles in the agent process."""

    last_review_at: datetime | None = None
    last_input_hash: str | None = None

    def is_due(self, now: datetime, input_hash: str) -> bool:
        if self.last_review_at is None:  # first cycle after start
            return True
        if input_hash != self.last_input_hash:  # the pending queue changed since the last run
            return True
        local_hour = now.astimezone(VN_TZ).hour
        return now - self.last_review_at >= REVIEW_INTERVAL and REVIEW_HOUR_START <= local_hour < REVIEW_HOUR_END

    def record(self, now: datetime, input_hash: str, ran: bool) -> None:
        """Store the queue fingerprint seen this cycle; a run also moves the hourly clock."""
        self.last_input_hash = input_hash
        if ran:
            self.last_review_at = now


@dataclass
class IntervalSchedule:
    """Due at most once per `interval`; the first cycle is always due."""

    interval: timedelta
    last_run_at: datetime | None = None

    def is_due(self, now: datetime) -> bool:
        return self.last_run_at is None or now - self.last_run_at >= self.interval

    def record(self, now: datetime) -> None:
        self.last_run_at = now


@dataclass
class WeeklySchedule:
    """Due once per Vietnam week (weeks start on Monday) at or after `at` on that Monday; a week not recorded is due again."""

    at: time
    last_week: date | None = None

    @staticmethod
    def _monday(local: datetime) -> date:
        return local.date() - timedelta(days=local.weekday())

    def is_due(self, now: datetime) -> bool:
        local = now.astimezone(VN_TZ)
        monday = self._monday(local)
        if self.last_week == monday:
            return False
        return local >= datetime.combine(monday, self.at, tzinfo=VN_TZ)

    def record(self, now: datetime) -> None:
        self.last_week = self._monday(now.astimezone(VN_TZ))


@dataclass
class DailySchedule:
    """Due on the first cycle after start, then once per Vietnam day at or after `at` (Vietnam time)."""

    at: time
    last_day: date | None = None

    def is_due(self, now: datetime) -> bool:
        if self.last_day is None:  # first cycle after start, at any hour
            return True
        local = now.astimezone(VN_TZ)
        return local.time() >= self.at and self.last_day != local.date()

    def record(self, now: datetime) -> None:
        self.last_day = now.astimezone(VN_TZ).date()


def season_key(local: datetime) -> tuple[int, int]:
    return local.year, (local.month - 1) // 3 + 1


@dataclass
class SeasonSchedule:
    """Due on the first cycle after start, then once per Vietnam quarter: from `at` on its first day, any time after that.

    A quarter that was not recorded stays due, so a failed run is retried.
    """

    at: time
    last_season: tuple[int, int] | None = None

    def is_due(self, now: datetime) -> bool:
        local = now.astimezone(VN_TZ)
        if self.last_season is None:  # first cycle after start, at any hour: the run itself checks for an existing plan
            return True
        year, quarter = season_key(local)
        if (year, quarter) == self.last_season:
            return False
        return local.date() > date(year, quarter * 3 - 2, 1) or local.time() >= self.at

    def record(self, now: datetime) -> None:
        self.last_season = season_key(now.astimezone(VN_TZ))
