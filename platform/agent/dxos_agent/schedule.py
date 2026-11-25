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
