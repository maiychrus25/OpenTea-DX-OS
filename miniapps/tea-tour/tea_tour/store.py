# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Tour và lượt đặt trong schema app_tea_tour. Mọi truy vấn lọc theo htx_code lấy từ token hoặc URL (spec §6.4)."""
import re
import secrets
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from uuid import UUID

import psycopg
from psycopg.rows import class_row

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I, O, 0 or 1: read aloud over the phone
CODE_TRIES = 5
HOLDING = ("PENDING", "CONFIRMED")  # bookings that take seats


@dataclass(frozen=True)
class Tour:
    id: UUID
    title: str
    starts_at: datetime
    meeting_point: str
    seats: int
    price_vnd: int
    description: str | None
    guide_name: str | None
    status: str
    past: bool
    seats_used: int
    confirmed_guests: int

    @property
    def seats_left(self) -> int:
        return max(self.seats - self.seats_used, 0)


@dataclass(frozen=True)
class Booking:
    id: UUID
    tour_id: UUID
    code: str
    guest_name: str
    phone: str
    party_size: int
    note: str | None
    status: str
    created_at: datetime


class BookingRefusal(Enum):
    FULL = "Tour đã hết chỗ."
    CLOSED = "Tour đã đóng hoặc đã diễn ra."
    NOT_FOUND = "Không tìm thấy tour."

    @property
    def message(self) -> str:
        return self.value


TOUR_SELECT = """
SELECT t.id, t.title, t.starts_at, t.meeting_point, t.seats, t.price_vnd, t.description, t.guide_name, t.status,
       t.starts_at <= now() AS past,
       COALESCE(sum(b.party_size) FILTER (WHERE b.status IN ('PENDING', 'CONFIRMED')), 0)::int AS seats_used,
       COALESCE(sum(b.party_size) FILTER (WHERE b.status = 'CONFIRMED'), 0)::int AS confirmed_guests
FROM tours t LEFT JOIN bookings b ON b.tour_id = t.id AND b.htx_code = t.htx_code
WHERE t.htx_code = %(htx)s {where}
GROUP BY t.id
ORDER BY t.starts_at"""
BOOKING_COLUMNS = "id, tour_id, code, guest_name, phone, party_size, note, status, created_at"


def connect(url: str) -> psycopg.Connection:
    # Autocommit: each `with conn.transaction()` below is the whole transaction, and reads take no lock.
    return psycopg.connect(url, autocommit=True, options="-c search_path=app_tea_tour")


def normalize_phone(raw: str) -> str | None:
    phone = re.sub(r"[ .\-]", "", raw.strip())
    if phone.startswith("+84"):
        phone = "0" + phone[3:]
    return phone if re.fullmatch(r"0[0-9]{9}", phone) else None


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _tours(conn: psycopg.Connection, htx_code: str, where: str = "", **params) -> list[Tour]:
    with conn.cursor(row_factory=class_row(Tour)) as cur:
        return cur.execute(TOUR_SELECT.format(where=where), {"htx": htx_code, **params}).fetchall()


def list_tours(conn, htx_code: str) -> list[Tour]:
    return _tours(conn, htx_code)


def get_tour(conn, htx_code: str, tour_id: UUID) -> Tour | None:
    found = _tours(conn, htx_code, "AND t.id = %(id)s", id=tour_id)
    return found[0] if found else None


def guide_tours(conn, htx_code: str, guide_user_id: str) -> list[Tour]:
    return _tours(conn, htx_code, "AND t.guide_user_id = %(guide)s", guide=guide_user_id)


def public_tours(conn, htx_code: str) -> list[Tour]:
    return _tours(conn, htx_code, "AND t.status = 'OPEN' AND t.starts_at > now()")


def create_tour(conn, htx_code: str, title: str, starts_at: datetime, meeting_point: str, seats: int, price_vnd: int,
                description: str | None, guide_user_id: str | None, guide_name: str) -> UUID:
    return conn.execute(
        """INSERT INTO tours (htx_code, title, starts_at, meeting_point, seats, price_vnd, description,
                              guide_user_id, guide_name)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
        (htx_code, title, starts_at, meeting_point, seats, price_vnd, description, guide_user_id, guide_name),
    ).fetchone()[0]


def cancel_tour(conn, htx_code: str, tour_id: UUID) -> bool:
    return conn.execute("UPDATE tours SET status = 'CANCELLED' WHERE id = %s AND htx_code = %s RETURNING id",
                        (tour_id, htx_code)).fetchone() is not None


def tour_bookings(conn, htx_code: str, tour_id: UUID) -> list[Booking]:
    with conn.cursor(row_factory=class_row(Booking)) as cur:
        return cur.execute(f"SELECT {BOOKING_COLUMNS} FROM bookings WHERE htx_code = %s AND tour_id = %s "
                           "ORDER BY created_at", (htx_code, tour_id)).fetchall()


def set_booking_status(conn, htx_code: str, booking_id: UUID, status: str, from_statuses: tuple[str, ...]) -> UUID | None:
    """Move a booking to `status` if it is in one of `from_statuses`; the booking's tour id, or None if not found."""
    with conn.transaction():
        conn.execute("UPDATE bookings SET status = %s WHERE id = %s AND htx_code = %s AND status = ANY(%s)",
                     (status, booking_id, htx_code, list(from_statuses)))
        row = conn.execute("SELECT tour_id FROM bookings WHERE id = %s AND htx_code = %s",
                           (booking_id, htx_code)).fetchone()
    return row[0] if row else None


def lookup(conn, htx_code: str, code: str, phone: str) -> tuple[Booking, Tour] | None:
    """A guest's own booking: both the code and the phone must match, in that HTX."""
    with conn.cursor(row_factory=class_row(Booking)) as cur:
        booking = cur.execute(f"SELECT {BOOKING_COLUMNS} FROM bookings WHERE htx_code = %s AND code = %s AND phone = %s",
                              (htx_code, code, phone)).fetchone()
    tour = booking and get_tour(conn, htx_code, booking.tour_id)
    return (booking, tour) if tour else None


def book(conn, htx_code: str, tour_id: UUID, guest_name: str, phone: str, party_size: int,
         note: str | None) -> Booking | BookingRefusal:
    """Take seats in one transaction; the tour row lock makes concurrent bookings wait, so a tour is never oversold."""
    with conn.transaction():
        tour = conn.execute("SELECT seats, status = 'OPEN' AND starts_at > now() FROM tours "
                            "WHERE id = %s AND htx_code = %s FOR UPDATE", (tour_id, htx_code)).fetchone()
        if tour is None:
            return BookingRefusal.NOT_FOUND
        seats, bookable = tour
        if not bookable:
            return BookingRefusal.CLOSED
        used = conn.execute("SELECT COALESCE(sum(party_size), 0) FROM bookings WHERE tour_id = %s AND status = ANY(%s)",
                            (tour_id, list(HOLDING))).fetchone()[0]
        if used + party_size > seats:
            return BookingRefusal.FULL
        for attempt in range(CODE_TRIES):
            try:
                with conn.transaction(), conn.cursor(row_factory=class_row(Booking)) as cur:  # a savepoint
                    return cur.execute(
                        f"""INSERT INTO bookings (htx_code, tour_id, code, guest_name, phone, party_size, note)
                            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING {BOOKING_COLUMNS}""",
                        (htx_code, tour_id, new_code(), guest_name, phone, party_size, note)).fetchone()
            except psycopg.errors.UniqueViolation:
                if attempt == CODE_TRIES - 1:
                    raise
    raise AssertionError("unreachable")
