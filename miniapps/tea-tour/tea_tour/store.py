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

from tea_tour.appkit import like_pattern

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
    guide_user_id: str | None
    guide_name: str | None
    status: str
    past: bool
    seats_used: int
    confirmed_guests: int

    @property
    def seats_left(self) -> int:
        return max(self.seats - self.seats_used, 0)


@dataclass(frozen=True)
class Overview:
    upcoming_tours: int
    seats_held: int
    seats_total: int
    pending: int
    guests_this_month: int


@dataclass(frozen=True)
class BookingRow:
    id: UUID
    tour_id: UUID
    code: str
    guest_name: str
    phone: str
    party_size: int
    status: str
    created_at: datetime
    tour_title: str
    tour_starts_at: datetime


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


class EditRefusal(Enum):
    NOT_FOUND = "Không tìm thấy tour."
    CLOSED = "Tour đã huỷ hoặc đã diễn ra nên không sửa được."
    SEATS = "Số chỗ không được ít hơn số chỗ khách đã đặt."

    @property
    def message(self) -> str:
        return self.value


TOUR_SELECT = """
SELECT t.id, t.title, t.starts_at, t.meeting_point, t.seats, t.price_vnd, t.description, t.guide_user_id,
       t.guide_name, t.status,
       t.starts_at <= now() AS past,
       COALESCE(sum(b.party_size) FILTER (WHERE b.status IN ('PENDING', 'CONFIRMED')), 0)::int AS seats_used,
       COALESCE(sum(b.party_size) FILTER (WHERE b.status = 'CONFIRMED'), 0)::int AS confirmed_guests
FROM tours t LEFT JOIN bookings b ON b.tour_id = t.id AND b.htx_code = t.htx_code
WHERE t.htx_code = %(htx)s {where}
GROUP BY t.id
ORDER BY {order} {paging}"""
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


def _tours(conn: psycopg.Connection, htx_code: str, where: str = "", order: str = "t.starts_at", paging: str = "",
           **params) -> list[Tour]:
    # where, order and paging are constants of this module; every value reaches SQL as a parameter.
    with conn.cursor(row_factory=class_row(Tour)) as cur:
        return cur.execute(TOUR_SELECT.format(where=where, order=order, paging=paging),
                           {"htx": htx_code, **params}).fetchall()


SHOW_WHERE = {"upcoming": "AND t.status = 'OPEN' AND t.starts_at > now()",
              "past": "AND t.status = 'OPEN' AND t.starts_at <= now()",
              "cancelled": "AND t.status = 'CANCELLED'", "all": ""}
UPCOMING = "t.status = 'OPEN' AND t.starts_at > now()"


def VN_MONTH(column: str) -> str:
    return f"date_trunc('month', {column} AT TIME ZONE 'Asia/Ho_Chi_Minh')"


def count_tours(conn, htx_code: str, show: str) -> int:
    return conn.execute(f"SELECT count(*) FROM tours t WHERE t.htx_code = %s {SHOW_WHERE[show]}",
                        (htx_code,)).fetchone()[0]


def list_tours_page(conn, htx_code: str, show: str, limit: int, offset: int) -> list[Tour]:
    """Upcoming tours soonest first; every other view newest first."""
    order = "t.starts_at" if show == "upcoming" else "t.starts_at DESC"
    return _tours(conn, htx_code, SHOW_WHERE[show], order, "LIMIT %(limit)s OFFSET %(offset)s",
                  limit=limit, offset=offset)


def overview(conn, htx_code: str) -> Overview:
    tours = conn.execute(f"SELECT count(*), COALESCE(sum(seats), 0)::int FROM tours t "
                         f"WHERE t.htx_code = %s AND {UPCOMING}", (htx_code,)).fetchone()
    held, pending, month = conn.execute(
        f"""SELECT COALESCE(sum(b.party_size) FILTER (WHERE b.status = ANY(%(holding)s) AND {UPCOMING}), 0)::int,
                   count(*) FILTER (WHERE b.status = 'PENDING' AND {UPCOMING}),
                   COALESCE(sum(b.party_size) FILTER (WHERE b.status = 'CONFIRMED' AND t.status = 'OPEN'
                       AND {VN_MONTH('t.starts_at')} = {VN_MONTH('now()')}), 0)::int
            FROM bookings b JOIN tours t ON t.id = b.tour_id AND t.htx_code = b.htx_code
            WHERE b.htx_code = %(htx)s""", {"htx": htx_code, "holding": list(HOLDING)}).fetchone()
    return Overview(tours[0], held, tours[1], pending, month)


def _booking_filter(status: str, q: str) -> tuple[str, dict]:
    where, params = "", {}
    if status in ("PENDING", "CONFIRMED", "CANCELLED"):
        where, params = " AND b.status = %(status)s", {"status": status}
    if q:
        where += (" AND (b.code ILIKE %(like)s ESCAPE '\\' OR b.guest_name ILIKE %(like)s ESCAPE '\\'"
                  " OR b.phone ILIKE %(like)s ESCAPE '\\')")
        params["like"] = like_pattern(q)
    return where, params


def count_bookings(conn, htx_code: str, status: str, q: str) -> int:
    where, params = _booking_filter(status, q)
    return conn.execute(f"SELECT count(*) FROM bookings b WHERE b.htx_code = %(htx)s{where}",
                        {"htx": htx_code, **params}).fetchone()[0]


def list_bookings(conn, htx_code: str, status: str, q: str, limit: int, offset: int) -> list[BookingRow]:
    where, params = _booking_filter(status, q)
    with conn.cursor(row_factory=class_row(BookingRow)) as cur:
        return cur.execute(
            f"""SELECT b.id, b.tour_id, b.code, b.guest_name, b.phone, b.party_size, b.status, b.created_at,
                       t.title AS tour_title, t.starts_at AS tour_starts_at
                FROM bookings b JOIN tours t ON t.id = b.tour_id AND t.htx_code = b.htx_code
                WHERE b.htx_code = %(htx)s{where}
                ORDER BY b.created_at DESC, b.id LIMIT %(limit)s OFFSET %(offset)s""",
            {"htx": htx_code, "limit": limit, "offset": offset, **params}).fetchall()


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


def set_booking_status(conn, htx_code: str, booking_id: UUID, status: str, from_statuses: tuple[str, ...],
                       open_tour: bool = False) -> tuple[UUID, bool] | None:
    """Move a booking to `status` if it is in one of `from_statuses` (and, with open_tour, its tour is OPEN).

    Returns (tour id, whether it changed), or None when the booking is not in that HTX.
    """
    # FOR SHARE on this booking's tour only: a tour cancel committing meanwhile is waited for and its new status
    # rechecked, while other tours of the HTX stay free to edit and book.
    tour_check = ("AND EXISTS (SELECT 1 FROM tours t WHERE t.id = bookings.tour_id AND t.htx_code = %(htx)s "
                  "AND t.status = 'OPEN' FOR SHARE)" if open_tour else "")
    with conn.transaction():
        changed = conn.execute(
            f"UPDATE bookings SET status = %(status)s WHERE id = %(id)s AND htx_code = %(htx)s "
            f"AND status = ANY(%(from)s) {tour_check} RETURNING id",
            {"status": status, "id": booking_id, "htx": htx_code, "from": list(from_statuses)}).fetchone()
        row = conn.execute("SELECT tour_id FROM bookings WHERE id = %s AND htx_code = %s",
                           (booking_id, htx_code)).fetchone()
    return (row[0], changed is not None) if row else None


def _seats_used(conn, htx_code: str, tour_id: UUID) -> int:
    return conn.execute("SELECT COALESCE(sum(party_size), 0) FROM bookings "
                        "WHERE tour_id = %s AND htx_code = %s AND status = ANY(%s)",
                        (tour_id, htx_code, list(HOLDING))).fetchone()[0]


def edit_tour(conn, htx_code: str, tour_id: UUID, title: str, starts_at: datetime, meeting_point: str, seats: int,
              price_vnd: int, description: str | None, guide_user_id: str | None, guide_name: str) -> EditRefusal | None:
    """Same row lock as book(), so seats can never drop below what a concurrent booking just took."""
    with conn.transaction():
        row = conn.execute("SELECT status = 'OPEN' AND starts_at > now() FROM tours "
                           "WHERE id = %s AND htx_code = %s FOR UPDATE", (tour_id, htx_code)).fetchone()
        if row is None:
            return EditRefusal.NOT_FOUND
        if not row[0]:
            return EditRefusal.CLOSED
        if seats < _seats_used(conn, htx_code, tour_id):
            return EditRefusal.SEATS
        conn.execute(
            """UPDATE tours SET title = %s, starts_at = %s, meeting_point = %s, seats = %s, price_vnd = %s,
                                description = %s, guide_user_id = %s, guide_name = %s
               WHERE id = %s AND htx_code = %s""",
            (title, starts_at, meeting_point, seats, price_vnd, description, guide_user_id, guide_name,
             tour_id, htx_code))
    return None


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
        if _seats_used(conn, htx_code, tour_id) + party_size > seats:
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
