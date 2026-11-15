# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Time rules of spec 7.2, 7.4 and 7.5. Datetimes are timezone-aware."""
from datetime import datetime, timedelta, timezone

VN_TZ = timezone(timedelta(hours=7))  # UTC+7 without DST since 1975, so no tzdata is needed


def hold_until(created_at: datetime, starts_at: datetime, hold_hours: int, deposit: int) -> datetime | None:
    """Deadline to pay the deposit: capped at the departure; no hold when no deposit is asked."""
    if deposit <= 0:
        return None
    return min(created_at + timedelta(hours=hold_hours), starts_at)


def guest_can_cancel(status: str, starts_at: datetime, cancel_free_hours: int, now: datetime) -> bool:
    return status in ("PENDING", "CONFIRMED") and starts_at - now >= timedelta(hours=cancel_free_hours)


def checkin_window(starts_at: datetime, duration_minutes: int) -> tuple[datetime, datetime]:
    """From 00:00 (Vietnam time) of the departure day to 24 hours after the end."""
    local = starts_at.astimezone(VN_TZ)
    opens = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return opens, starts_at + timedelta(minutes=duration_minutes, hours=24)
