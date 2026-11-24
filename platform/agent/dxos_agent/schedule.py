# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""When agent A1 runs for one cooperative: first cycle, a changed queue, or hourly during working hours."""
from dataclasses import dataclass
from datetime import datetime, timedelta
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
