# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Read queries of the guide pages. Check-in itself goes through store.core; seat counts come from departure_load."""
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from tea_tour.domain import policy
from tea_tour.domain.policy import VN_TZ

PAST_LIMIT = 20
WEEKDAYS = ("Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy", "Chủ nhật")

_DEPARTURE = """
SELECT d.id, d.starts_at, d.status, d.cancel_reason, d.seats, t.title, t.meeting_point, t.duration_minutes,
       l.confirmed_guests, now()
FROM departures d
JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code
JOIN departure_load l ON l.departure_id = d.id AND l.htx_code = d.htx_code
WHERE d.htx_code = %s AND d.guide_user_id = %s"""


@dataclass(frozen=True)
class GuideDeparture:
    id: UUID
    starts_at: datetime
    status: str
    cancel_reason: str | None
    seats: int
    title: str
    meeting_point: str
    duration_minutes: int
    confirmed_guests: int
    now: datetime

    @property
    def local(self) -> datetime:
        return self.starts_at.astimezone(VN_TZ)

    @property
    def weekday(self) -> str:
        return WEEKDAYS[self.local.weekday()]

    @property
    def ends_at(self) -> datetime:
        return self.starts_at + timedelta(minutes=self.duration_minutes)

    @property
    def ended(self) -> bool:
        return self.ends_at <= self.now

    @property
    def window(self) -> str:
        """BEFORE / OPEN / AFTER the check-in window of spec 7.5 (the same rule the core applies)."""
        opens, closes = policy.checkin_window(self.starts_at, self.duration_minutes)
        return "BEFORE" if self.now < opens else "AFTER" if self.now > closes else "OPEN"


@dataclass(frozen=True)
class Guest:
    id: UUID
    code: str
    name: str
    adults: int
    children: int
    note: str | None
    due_vnd: int
    checked_in_at: datetime | None
    checked_in_count: int | None
    checked_in_by: str | None

    @property
    def party_size(self) -> int:
        return self.adults + self.children


def list_departures(conn, htx_code: str, guide_id: str) -> tuple[list[GuideDeparture], list[GuideDeparture]]:
    """(upcoming or running, soonest first; past, latest first). Only departures assigned to this guide."""
    rows = conn.execute(_DEPARTURE + " ORDER BY d.starts_at", (htx_code, guide_id)).fetchall()
    items = [GuideDeparture(*row) for row in rows]
    upcoming = [d for d in items if not d.ended]
    past = [d for d in reversed(items) if d.ended][:PAST_LIMIT]
    return upcoming, past


def get_departure(conn, htx_code: str, guide_id: str, departure_id: UUID) -> GuideDeparture | None:
    row = conn.execute(_DEPARTURE + " AND d.id = %s", (htx_code, guide_id, departure_id)).fetchone()
    return GuideDeparture(*row) if row else None


def list_guests(conn, htx_code: str, departure_id: UUID) -> list[Guest]:
    """CONFIRMED bookings only, and never a phone or an email: this is all a guide may see."""
    rows = conn.execute(
        "SELECT id, code, guest_name, adults, children, note, greatest(total_vnd - paid_vnd, 0), "
        "checked_in_at, checked_in_count, checked_in_by FROM bookings "
        "WHERE htx_code = %s AND departure_id = %s AND status = 'CONFIRMED' ORDER BY lower(guest_name), created_at",
        (htx_code, departure_id)).fetchall()
    return [Guest(*row) for row in rows]


def find_booking_id(conn, htx_code: str, departure_id: UUID, *, booking_id: UUID | None = None,
                    code: str | None = None) -> UUID | None:
    """The booking of this departure with that id or code (any status; the core decides what may happen to it)."""
    row = conn.execute(
        "SELECT id FROM bookings WHERE htx_code = %s AND departure_id = %s AND (id = %s OR code = %s)",
        (htx_code, departure_id, booking_id, code)).fetchone()
    return row[0] if row else None
