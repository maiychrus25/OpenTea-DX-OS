# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Every booking state change (spec 7). Each public function is one transaction on the given connection.

Refusals are returned, never raised, so a refused call that swept expired holds still keeps that work. Locks are
always taken in the same order: departure rows (by id), then the booking row. Seats are read from the view
departure_load, the single definition of a holding booking, so an expired hold frees its seats before any sweep.
"""
import re
import secrets
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from uuid import UUID

import psycopg
from psycopg.rows import class_row

from tea_tour import appkit
from tea_tour.domain import money, policy
from tea_tour.domain.text import default_display_name
from tea_tour.store import settings as settings_store

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I, O, 0 or 1: read aloud over the phone
CODE_TRIES = 5
GUEST_PARTY_MAX = 20
HOLDING = ("PENDING", "CONFIRMED")
HOLD_EXPIRED = "Quá hạn giữ chỗ"
STALE_PENDING = "Chuyến đã khởi hành mà chưa được xác nhận"
DEPARTURE_CANCELLED = "HTX huỷ chuyến"
GUEST_CANCELLED = "Khách tự huỷ"
METHODS = ("TRANSFER", "CASH")
METHOD_LABELS = {"TRANSFER": "chuyển khoản", "CASH": "tiền mặt"}
PHONE_RE = re.compile(r"0[0-9]{9}")


class Refusal(Enum):
    NOT_FOUND = "Không tìm thấy."
    NOT_BOOKABLE = "Chuyến này không còn nhận đặt chỗ."
    FULL = "Chuyến này không còn đủ chỗ."
    INVALID_INPUT = "Thông tin gửi lên không hợp lệ."
    PARTY_SIZE = "Số người không hợp lệ: cần ít nhất một khách; đặt trên web cần ít nhất một người lớn và tối đa 20 người."
    PRICE_CHANGED = "Giá hoặc số chỗ đã thay đổi. Vui lòng xem lại tổng tiền."
    WRONG_STATE = "Lượt đặt này không ở trạng thái cho phép thao tác này."
    REASON_REQUIRED = "Cần ghi lý do."
    PAYMENT_ABOVE_TOTAL = "Tổng tiền đã thu không được vượt tổng tiền của lượt đặt."
    PAYMENT_BELOW_ZERO = "Khoản hoàn không được làm tổng tiền đã thu xuống dưới 0."
    CANCEL_DEADLINE = "Đã quá hạn huỷ miễn phí. Vui lòng gọi đường dây nóng của HTX."
    DEPARTURE_STARTED = "Chuyến đã khởi hành."
    OTHER_TOUR = "Chỉ đổi được sang chuyến khác của cùng tour."
    SAME_DEPARTURE = "Lượt đặt đã ở chuyến này."
    OUTSIDE_WINDOW = "Chưa tới hoặc đã quá thời gian điểm danh của chuyến này."
    NOT_ELIGIBLE = "Chỉ gửi được đánh giá cho lượt đã đi tour."
    ALREADY_REVIEWED = "Lượt đặt này đã có đánh giá."
    SEATS_BELOW_USED = "Số chỗ không được ít hơn số chỗ khách đã giữ."

    @property
    def message(self) -> str:
        return self.value


@dataclass(frozen=True)
class Actor:
    kind: str  # GUEST | MANAGER | GUIDE | SYSTEM
    name: str
    user_id: str | None = None


@dataclass(frozen=True)
class NewBooking:
    htx_code: str
    departure_id: UUID
    adults: int
    children: int
    guest_name: str
    phone: str  # already normalised: 0 and 9 digits
    email: str | None
    note: str | None
    request_key: str  # one random value per step-2 form; a re-sent form returns the booking it made
    source: str = "WEB"  # WEB | APP | MANAGER
    expected_total_vnd: int | None = None  # the total the guest saw at step 2; a different price creates nothing


@dataclass(frozen=True)
class Booking:
    id: UUID
    htx_code: str
    departure_id: UUID
    tour_id: UUID
    starts_at: datetime  # of the departure
    code: str
    access_key: str
    guest_name: str
    phone: str
    email: str | None
    note: str | None
    internal_note: str | None
    adults: int
    children: int
    party_size: int
    price_adult_vnd: int
    price_child_vnd: int
    total_vnd: int
    deposit_vnd: int
    paid_vnd: int
    hold_until: datetime | None
    status: str
    cancel_reason: str | None
    cancelled_by: str | None
    cancelled_at: datetime | None
    guest_paid_reported_at: datetime | None
    checked_in_at: datetime | None
    checked_in_count: int | None
    checked_in_by: str | None
    source: str
    created_at: datetime

    @property
    def payment_state(self) -> str:
        return money.payment_state(self.status, self.total_vnd, self.paid_vnd)

    @property
    def amount_due_now(self) -> int:
        return 0 if self.status == "CANCELLED" else money.amount_due_now(self.total_vnd, self.deposit_vnd, self.paid_vnd)

    @property
    def refund_due_vnd(self) -> int:
        return money.refund_due(self.status, self.total_vnd, self.paid_vnd)


@dataclass(frozen=True)
class Review:
    id: UUID
    htx_code: str
    booking_id: UUID
    tour_id: UUID
    rating: int
    comment: str
    display_name: str
    status: str
    reply: str | None
    created_at: datetime
    moderated_at: datetime | None


@dataclass(frozen=True)
class _Departure:
    id: UUID
    tour_id: UUID
    starts_at: datetime
    seats: int
    status: str
    price_adult_vnd: int
    price_child_vnd: int
    guide_user_id: str | None
    tour_status: str
    duration_minutes: int


BOOKING_SELECT = """
SELECT b.id, b.htx_code, b.departure_id, d.tour_id, d.starts_at, b.code, b.access_key, b.guest_name, b.phone, b.email,
       b.note, b.internal_note, b.adults, b.children, b.party_size, b.price_adult_vnd, b.price_child_vnd, b.total_vnd,
       b.deposit_vnd, b.paid_vnd, b.hold_until, b.status, b.cancel_reason, b.cancelled_by, b.cancelled_at,
       b.guest_paid_reported_at, b.checked_in_at, b.checked_in_count, b.checked_in_by, b.source, b.created_at
FROM bookings b JOIN departures d ON d.id = b.departure_id AND d.htx_code = b.htx_code
WHERE b.htx_code = %s AND """
DEPARTURE_SELECT = """
SELECT d.id, d.tour_id, d.starts_at, d.seats, d.status, d.price_adult_vnd, d.price_child_vnd, d.guide_user_id,
       t.status AS tour_status, t.duration_minutes
FROM departures d JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code
WHERE d.htx_code = %s AND """
REVIEW_COLUMNS = "id, htx_code, booking_id, tour_id, rating, comment, display_name, status, reply, created_at, moderated_at"


# ---------- reads ----------

def _fetch_booking(conn, htx_code: str, where: str, params: tuple, lock: bool = False) -> Booking | None:
    # `where` is a constant of this module; every value is a parameter.
    with conn.cursor(row_factory=class_row(Booking)) as cur:
        return cur.execute(BOOKING_SELECT + where + (" FOR UPDATE OF b" if lock else ""), (htx_code, *params)).fetchone()


def get_booking(conn, htx_code: str, booking_id: UUID) -> Booking | None:
    return _fetch_booking(conn, htx_code, "b.id = %s", (booking_id,))


def find_booking(conn, htx_code: str, code: str, access_key: str) -> Booking | None:
    """A guest's own booking by the pair in the page address; a wrong key is the same answer as no booking."""
    found = _fetch_booking(conn, htx_code, "b.code = %s", (code.strip().upper(),))
    return found if found and access_key and secrets.compare_digest(found.access_key, access_key) else None


def lookup_booking(conn, htx_code: str, code: str, phone: str) -> Booking | None:
    """Lookup by booking code and phone (the guest forgot the link); the phone is normalised here."""
    from tea_tour.domain.text import normalise_phone
    normalised = normalise_phone(phone)
    if normalised is None:
        return None
    return _fetch_booking(conn, htx_code, "b.code = %s AND b.phone = %s", (code.strip().upper(), normalised))


# ---------- helpers ----------

def _now(conn) -> datetime:
    return conn.execute("SELECT now()").fetchone()[0]


def _event(conn, htx_code: str, booking_id: UUID, actor: Actor, kind: str, detail: str = "") -> None:
    conn.execute("INSERT INTO booking_events (htx_code, booking_id, actor_kind, actor_name, kind, detail) "
                 "VALUES (%s, %s, %s, %s, %s, %s)", (htx_code, booking_id, actor.kind, actor.name[:80], kind, detail[:300]))


def _lock_departures(conn, htx_code: str, ids: list[UUID]) -> dict[UUID, _Departure]:
    """Lock departure rows in id order (so two moves in opposite directions cannot deadlock)."""
    with conn.cursor(row_factory=class_row(_Departure)) as cur:
        rows = cur.execute(DEPARTURE_SELECT + "d.id = ANY(%s) ORDER BY d.id FOR UPDATE OF d",
                           (htx_code, list(ids))).fetchall()
    return {row.id: row for row in rows}


def _seats_used(conn, departure_id: UUID) -> int:
    return conn.execute("SELECT seats_used FROM departure_load WHERE departure_id = %s", (departure_id,)).fetchone()[0]


def _sweep(conn, htx_code: str, departure_id: UUID | None) -> int:
    """Cancel PENDING bookings whose hold ran out unpaid, and every PENDING one of a departure that has started."""
    row = conn.execute(
        """WITH due AS (
             SELECT b.id, b.htx_code,
                    CASE WHEN d.starts_at <= now() THEN %(stale)s ELSE %(expired)s END AS reason
             FROM bookings b JOIN departures d ON d.id = b.departure_id AND d.htx_code = b.htx_code
             WHERE b.htx_code = %(htx)s AND b.status = 'PENDING'
               AND (%(departure)s::uuid IS NULL OR b.departure_id = %(departure)s::uuid)
               AND (d.starts_at <= now()
                    OR (b.hold_until <= now() AND b.guest_paid_reported_at IS NULL AND b.paid_vnd < b.deposit_vnd))
             FOR UPDATE OF b),
           changed AS (
             UPDATE bookings b SET status = 'CANCELLED', cancel_reason = due.reason, cancelled_by = 'SYSTEM',
                                   cancelled_at = now()
             FROM due WHERE b.id = due.id AND b.htx_code = due.htx_code
             RETURNING b.id, b.htx_code, due.reason),
           logged AS (
             INSERT INTO booking_events (htx_code, booking_id, actor_kind, actor_name, kind, detail)
             SELECT htx_code, id, 'SYSTEM', 'Hệ thống', 'CANCELLED', reason FROM changed RETURNING 1)
           SELECT count(*) FROM logged""",
        {"htx": htx_code, "departure": departure_id, "stale": STALE_PENDING, "expired": HOLD_EXPIRED}).fetchone()
    return row[0]


def sweep(conn, htx_code: str, departure_id: UUID | None = None) -> int:
    """Cancel expired holds and stale PENDING bookings of one departure, or of the whole cooperative. Returns the count."""
    with conn.transaction():
        return _sweep(conn, htx_code, departure_id)


def _locked(conn, htx_code: str, booking_id: UUID) -> tuple[Booking, _Departure] | None:
    """Lock the booking's departure, sweep it, then lock the booking. None when the booking is not in this cooperative."""
    for _ in range(3):  # the booking can be moved while we wait for the departure lock
        row = conn.execute("SELECT departure_id FROM bookings WHERE id = %s AND htx_code = %s",
                           (booking_id, htx_code)).fetchone()
        if row is None:
            return None
        departure = _lock_departures(conn, htx_code, [row[0]]).get(row[0])
        _sweep(conn, htx_code, row[0])
        booking = _fetch_booking(conn, htx_code, "b.id = %s", (booking_id,), lock=True)
        if booking is None:
            return None
        if booking.departure_id == row[0] and departure is not None:
            return booking, departure
    return None


def _reload(conn, htx_code: str, booking_id: UUID) -> Booking:
    return get_booking(conn, htx_code, booking_id)


def _mark_cancelled(conn, htx_code: str, booking_id: UUID, reason: str, by: str, actor: Actor, detail: str) -> None:
    conn.execute("UPDATE bookings SET status = 'CANCELLED', cancel_reason = %s, cancelled_by = %s, cancelled_at = now() "
                 "WHERE id = %s AND htx_code = %s", (reason, by, booking_id, htx_code))
    _event(conn, htx_code, booking_id, actor, "CANCELLED", detail)


def _confirm(conn, htx_code: str, booking_id: UUID, actor: Actor, detail: str = "") -> None:
    conn.execute("UPDATE bookings SET status = 'CONFIRMED' WHERE id = %s AND htx_code = %s", (booking_id, htx_code))
    _event(conn, htx_code, booking_id, actor, "CONFIRMED", detail)


def _party(adults: int, children: int, is_guest: bool) -> Refusal | None:
    if not isinstance(adults, int) or not isinstance(children, int) or adults < 0 or children < 0:
        return Refusal.INVALID_INPUT
    party = adults + children
    if party < 1 or party > 200 or (is_guest and (party > GUEST_PARTY_MAX or adults < 1)):
        return Refusal.PARTY_SIZE
    return None


def _clean_reason(reason: str) -> str | Refusal:
    reason = reason.strip()
    if not reason:
        return Refusal.REASON_REQUIRED
    return reason if len(reason) <= 200 else Refusal.INVALID_INPUT


# ---------- creating ----------

def _valid_new(new: NewBooking) -> Refusal | None:
    if not (1 <= len(new.guest_name.strip()) <= 80 and PHONE_RE.fullmatch(new.phone)
            and 8 <= len(new.request_key) <= 64 and new.source in ("WEB", "APP", "MANAGER")
            and (new.email is None or len(new.email) <= 120) and (new.note is None or len(new.note) <= 500)):
        return Refusal.INVALID_INPUT
    return None


def create_booking(conn, new: NewBooking, actor: Actor) -> Booking | Refusal:
    """Take seats under the departure lock and price the booking at the departure's current prices.

    A guest (actor GUEST) books only an OPEN departure of a PUBLISHED tour, 1 to 20 people with an adult; the manager
    books up to the seats left, also on a CLOSED departure. A request_key seen before returns its booking.
    """
    htx_code, is_guest = new.htx_code, actor.kind != "MANAGER"
    with conn.transaction():
        existing = _fetch_booking(conn, htx_code, "b.request_key = %s", (new.request_key,))
        if existing:
            return existing
        refusal = _party(new.adults, new.children, is_guest) or _valid_new(new)
        if refusal:
            return refusal
        departure = _lock_departures(conn, htx_code, [new.departure_id]).get(new.departure_id)
        if departure is None or (is_guest and departure.tour_status != "PUBLISHED"):
            return Refusal.NOT_FOUND
        existing = _fetch_booking(conn, htx_code, "b.request_key = %s", (new.request_key,))
        if existing:  # a twin request committed while we waited for the lock
            return existing
        now = _now(conn)
        if departure.status == "CANCELLED" or departure.starts_at <= now or (is_guest and departure.status != "OPEN"):
            return Refusal.NOT_BOOKABLE
        _sweep(conn, htx_code, departure.id)
        party = new.adults + new.children
        if _seats_used(conn, departure.id) + party > departure.seats:
            return Refusal.FULL
        total = money.total_vnd(new.adults, new.children, departure.price_adult_vnd, departure.price_child_vnd)
        if new.expected_total_vnd is not None and new.expected_total_vnd != total:
            return Refusal.PRICE_CHANGED
        rules = settings_store.get(conn, htx_code)
        deposit = money.deposit_vnd(total, rules.deposit_percent)
        hold = policy.hold_until(now, departure.starts_at, rules.hold_hours, deposit)
        status = "CONFIRMED" if rules.auto_confirm and deposit == 0 else "PENDING"
        booking_id = _insert_booking(conn, new, departure, total, deposit, hold, status)
        detail = f"Đặt chỗ: {new.adults} người lớn, {new.children} trẻ em, tổng {appkit.money(total)}"
        _event(conn, htx_code, booking_id, actor, "CREATED", detail)
        if status == "CONFIRMED":
            _event(conn, htx_code, booking_id, Actor("SYSTEM", "Hệ thống"), "CONFIRMED", "Tự động xác nhận")
        return _reload(conn, htx_code, booking_id)


def _insert_booking(conn, new: NewBooking, departure: _Departure, total: int, deposit: int, hold, status: str) -> UUID:
    for attempt in range(CODE_TRIES):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        try:
            with conn.transaction():  # a savepoint: a duplicate code does not poison the booking transaction
                return conn.execute(
                    """INSERT INTO bookings (htx_code, departure_id, code, guest_name, phone, email, note, adults,
                                             children, price_adult_vnd, price_child_vnd, total_vnd, deposit_vnd,
                                             hold_until, status, request_key, access_key, source)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (new.htx_code, departure.id, code, new.guest_name.strip(), new.phone, new.email or None,
                     (new.note or "").strip() or None, new.adults, new.children, departure.price_adult_vnd,
                     departure.price_child_vnd, total, deposit, hold, status, new.request_key,
                     secrets.token_urlsafe(16), new.source)).fetchone()[0]
        except psycopg.errors.UniqueViolation:
            if attempt == CODE_TRIES - 1:
                raise
    raise AssertionError("unreachable")


# ---------- confirming, paying, cancelling ----------

def confirm_booking(conn, htx_code: str, booking_id: UUID, actor: Actor) -> Booking | Refusal:
    with conn.transaction():
        found = _locked(conn, htx_code, booking_id)
        if found is None:
            return Refusal.NOT_FOUND
        booking, _ = found
        if booking.status != "PENDING":
            return Refusal.WRONG_STATE
        _confirm(conn, htx_code, booking_id, actor)
        return _reload(conn, htx_code, booking_id)


def record_payment(conn, htx_code: str, booking_id: UUID, amount_vnd: int, method: str, note: str | None,
                   actor: Actor) -> Booking | Refusal:
    """One ledger line: positive is money in, negative a refund. paid_vnd is updated in the same transaction."""
    if not isinstance(amount_vnd, int) or amount_vnd == 0 or method not in METHODS or len(note or "") > 200:
        return Refusal.INVALID_INPUT
    with conn.transaction():
        found = _locked(conn, htx_code, booking_id)
        if found is None:
            return Refusal.NOT_FOUND
        booking, _ = found
        paid = booking.paid_vnd + amount_vnd
        if paid < 0:
            return Refusal.PAYMENT_BELOW_ZERO
        if paid > booking.total_vnd:
            return Refusal.PAYMENT_ABOVE_TOTAL
        conn.execute("INSERT INTO payments (htx_code, booking_id, amount_vnd, method, note, recorded_by_id, "
                     "recorded_by_name) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                     (htx_code, booking_id, amount_vnd, method, (note or "").strip() or None, actor.user_id, actor.name))
        conn.execute("UPDATE bookings SET paid_vnd = %s WHERE id = %s AND htx_code = %s", (paid, booking_id, htx_code))
        verb = "Thu" if amount_vnd > 0 else "Hoàn"
        detail = f"{verb} {appkit.money(abs(amount_vnd))} ({METHOD_LABELS[method]})" + (f": {note.strip()}" if note and note.strip() else "")
        _event(conn, htx_code, booking_id, actor, "PAYMENT", detail)
        if booking.status == "PENDING" and booking.deposit_vnd > 0 and paid >= booking.deposit_vnd:
            _confirm(conn, htx_code, booking_id, actor, "Đã đủ tiền cọc")
        return _reload(conn, htx_code, booking_id)


def report_paid(conn, htx_code: str, booking_id: UUID) -> Booking | Refusal:
    """The guest says "Tôi đã chuyển khoản": only a timestamp, the manager still records the money."""
    with conn.transaction():
        found = _locked(conn, htx_code, booking_id)
        if found is None:
            return Refusal.NOT_FOUND
        booking, _ = found
        if booking.status not in HOLDING:
            return Refusal.WRONG_STATE
        if booking.guest_paid_reported_at is None:
            conn.execute("UPDATE bookings SET guest_paid_reported_at = now() WHERE id = %s AND htx_code = %s",
                         (booking_id, htx_code))
            _event(conn, htx_code, booking_id, Actor("GUEST", booking.guest_name), "PAID_REPORTED",
                   "Khách báo đã chuyển khoản")
        return _reload(conn, htx_code, booking_id)


def cancel_booking(conn, htx_code: str, booking_id: UUID, reason: str, actor: Actor) -> Booking | Refusal:
    """A guest cancels in time (free until cancel_free_hours before the start); the manager, with a reason, before the start."""
    with conn.transaction():
        found = _locked(conn, htx_code, booking_id)
        if found is None:
            return Refusal.NOT_FOUND
        booking, departure = found
        if booking.status not in HOLDING:
            return Refusal.WRONG_STATE
        now = _now(conn)
        if actor.kind == "GUEST":
            if not policy.guest_can_cancel(booking.status, departure.starts_at, settings_store.get(conn, htx_code).cancel_free_hours, now):
                return Refusal.CANCEL_DEADLINE
            reason = reason.strip() or GUEST_CANCELLED
        elif actor.kind == "MANAGER":
            if departure.starts_at <= now:
                return Refusal.DEPARTURE_STARTED
            reason = _clean_reason(reason)
        else:
            reason = reason.strip() or HOLD_EXPIRED
        if isinstance(reason, Refusal):
            return reason
        if len(reason) > 200:
            return Refusal.INVALID_INPUT
        _mark_cancelled(conn, htx_code, booking_id, reason, actor.kind if actor.kind != "GUIDE" else "MANAGER", actor, reason)
        return _reload(conn, htx_code, booking_id)


# ---------- moving and resizing ----------

def move_booking(conn, htx_code: str, booking_id: UUID, departure_id: UUID, actor: Actor) -> Booking | Refusal:
    """Same tour only, to a departure that has not started, is OPEN or CLOSED and has the seats. Prices and money stay."""
    with conn.transaction():
        row = conn.execute("SELECT departure_id FROM bookings WHERE id = %s AND htx_code = %s",
                           (booking_id, htx_code)).fetchone()
        if row is None:
            return Refusal.NOT_FOUND
        source_id = row[0]
        locked = _lock_departures(conn, htx_code, [source_id, departure_id])
        if departure_id not in locked:
            return Refusal.NOT_FOUND
        _sweep(conn, htx_code, source_id)
        _sweep(conn, htx_code, departure_id)
        booking = _fetch_booking(conn, htx_code, "b.id = %s", (booking_id,), lock=True)
        if booking is None or booking.departure_id != source_id:
            return Refusal.WRONG_STATE
        if booking.status not in HOLDING:
            return Refusal.WRONG_STATE
        source, target = locked[source_id], locked[departure_id]
        if source_id == departure_id:
            return Refusal.SAME_DEPARTURE
        if target.tour_id != source.tour_id:
            return Refusal.OTHER_TOUR
        if target.status not in ("OPEN", "CLOSED") or target.starts_at <= _now(conn):
            return Refusal.NOT_BOOKABLE
        if _seats_used(conn, departure_id) + booking.party_size > target.seats:
            return Refusal.FULL
        conn.execute("UPDATE bookings SET departure_id = %s WHERE id = %s AND htx_code = %s",
                     (departure_id, booking_id, htx_code))
        _event(conn, htx_code, booking_id, actor, "MOVED",
               f"Đổi chuyến: {appkit.vn_datetime(source.starts_at)} sang {appkit.vn_datetime(target.starts_at)}")
        return _reload(conn, htx_code, booking_id)


def resize_booking(conn, htx_code: str, booking_id: UUID, adults: int, children: int, actor: Actor) -> Booking | Refusal:
    """New party size at the booking's own unit prices; the deposit follows the current deposit rate."""
    refusal = _party(adults, children, is_guest=False)
    if refusal:
        return refusal
    with conn.transaction():
        found = _locked(conn, htx_code, booking_id)
        if found is None:
            return Refusal.NOT_FOUND
        booking, departure = found
        if booking.status not in HOLDING:
            return Refusal.WRONG_STATE
        if departure.starts_at <= _now(conn):
            return Refusal.DEPARTURE_STARTED
        if _seats_used(conn, departure.id) - booking.party_size + adults + children > departure.seats:
            return Refusal.FULL
        total = money.total_vnd(adults, children, booking.price_adult_vnd, booking.price_child_vnd)
        deposit = money.deposit_vnd(total, settings_store.get(conn, htx_code).deposit_percent)
        conn.execute("UPDATE bookings SET adults = %s, children = %s, total_vnd = %s, deposit_vnd = %s "
                     "WHERE id = %s AND htx_code = %s", (adults, children, total, deposit, booking_id, htx_code))
        _event(conn, htx_code, booking_id, actor, "RESIZED",
               f"Sửa số người: {adults} người lớn, {children} trẻ em, tổng {appkit.money(total)}")
        if booking.status == "PENDING" and deposit > 0 and booking.paid_vnd >= deposit:
            _confirm(conn, htx_code, booking_id, actor, "Đã đủ tiền cọc")
        return _reload(conn, htx_code, booking_id)


# ---------- check-in ----------

def _checkin_target(conn, htx_code: str, booking_id: UUID, guide_user_id: str | None) -> tuple[Booking, _Departure] | Refusal:
    found = _locked(conn, htx_code, booking_id)
    if found is None:
        return Refusal.NOT_FOUND
    booking, departure = found
    if guide_user_id is not None and departure.guide_user_id != guide_user_id:
        return Refusal.NOT_FOUND  # a guide never learns that another guide's booking exists
    return booking, departure


def _in_window(conn, departure: _Departure) -> bool:
    opens, closes = policy.checkin_window(departure.starts_at, departure.duration_minutes)
    return opens <= _now(conn) <= closes


def check_in(conn, htx_code: str, booking_id: UUID, count: int | None, actor: Actor,
             guide_user_id: str | None = None) -> Booking | Refusal:
    """Record who is present (1 to the whole party; None means everyone). A guide passes their own user id."""
    with conn.transaction():
        target = _checkin_target(conn, htx_code, booking_id, guide_user_id)
        if isinstance(target, Refusal):
            return target
        booking, departure = target
        if booking.status != "CONFIRMED" or departure.status == "CANCELLED":
            return Refusal.WRONG_STATE
        if not _in_window(conn, departure):
            return Refusal.OUTSIDE_WINDOW
        count = booking.party_size if count is None else count
        if not isinstance(count, int) or not 1 <= count <= booking.party_size:
            return Refusal.INVALID_INPUT
        conn.execute("UPDATE bookings SET checked_in_at = now(), checked_in_count = %s, checked_in_by = %s "
                     "WHERE id = %s AND htx_code = %s", (count, actor.name[:80], booking_id, htx_code))
        _event(conn, htx_code, booking_id, actor, "CHECKED_IN", f"Có mặt {count}/{booking.party_size} người")
        return _reload(conn, htx_code, booking_id)


def undo_check_in(conn, htx_code: str, booking_id: UUID, actor: Actor, guide_user_id: str | None = None) -> Booking | Refusal:
    with conn.transaction():
        target = _checkin_target(conn, htx_code, booking_id, guide_user_id)
        if isinstance(target, Refusal):
            return target
        booking, departure = target
        if booking.checked_in_at is None or departure.status == "CANCELLED":
            return Refusal.WRONG_STATE
        if not _in_window(conn, departure):
            return Refusal.OUTSIDE_WINDOW
        conn.execute("UPDATE bookings SET checked_in_at = NULL, checked_in_count = NULL, checked_in_by = NULL "
                     "WHERE id = %s AND htx_code = %s", (booking_id, htx_code))
        _event(conn, htx_code, booking_id, actor, "CHECK_IN_UNDONE", "Bỏ điểm danh")
        return _reload(conn, htx_code, booking_id)


# ---------- departures ----------

def cancel_departure(conn, htx_code: str, departure_id: UUID, reason: str, actor: Actor) -> int | Refusal:
    """Cancel a departure that has not started and every booking holding seats on it. Returns how many bookings."""
    reason = _clean_reason(reason)
    if isinstance(reason, Refusal):
        return reason
    with conn.transaction():
        departure = _lock_departures(conn, htx_code, [departure_id]).get(departure_id)
        if departure is None:
            return Refusal.NOT_FOUND
        if departure.status == "CANCELLED":
            return Refusal.WRONG_STATE
        if departure.starts_at <= _now(conn):
            return Refusal.DEPARTURE_STARTED
        _sweep(conn, htx_code, departure_id)
        conn.execute("UPDATE departures SET status = 'CANCELLED', cancel_reason = %s WHERE id = %s AND htx_code = %s",
                     (reason, departure_id, htx_code))
        ids = [r[0] for r in conn.execute(
            "SELECT id FROM bookings WHERE departure_id = %s AND htx_code = %s AND status = ANY(%s) FOR UPDATE",
            (departure_id, htx_code, list(HOLDING))).fetchall()]
        for booking_id in ids:
            _mark_cancelled(conn, htx_code, booking_id, DEPARTURE_CANCELLED, actor.kind, actor,
                            f"{DEPARTURE_CANCELLED}: {reason}")
        return len(ids)


def set_departure_seats(conn, htx_code: str, departure_id: UUID, seats: int) -> Refusal | None:
    """Same departure lock as booking, so seats can never drop below what a concurrent booking just took."""
    if not isinstance(seats, int) or not 1 <= seats <= 200:
        return Refusal.INVALID_INPUT
    with conn.transaction():
        departure = _lock_departures(conn, htx_code, [departure_id]).get(departure_id)
        if departure is None:
            return Refusal.NOT_FOUND
        if departure.status == "CANCELLED":
            return Refusal.WRONG_STATE
        _sweep(conn, htx_code, departure_id)
        if seats < _seats_used(conn, departure_id):
            return Refusal.SEATS_BELOW_USED
        conn.execute("UPDATE departures SET seats = %s WHERE id = %s AND htx_code = %s", (seats, departure_id, htx_code))
    return None


# ---------- reviews ----------

def add_review(conn, htx_code: str, booking_id: UUID, rating: int, comment: str, display_name: str) -> Review | Refusal:
    """One review per checked-in booking, after the departure; it waits for the manager (status PENDING)."""
    comment, display_name = comment.strip(), display_name.strip()
    if not isinstance(rating, int) or not 1 <= rating <= 5 or len(comment) > 1000 or len(display_name) > 40:
        return Refusal.INVALID_INPUT
    with conn.transaction():
        booking = _fetch_booking(conn, htx_code, "b.id = %s", (booking_id,), lock=True)
        if booking is None:
            return Refusal.NOT_FOUND
        if booking.status != "CONFIRMED" or not booking.checked_in_count or booking.starts_at > _now(conn):
            return Refusal.NOT_ELIGIBLE
        with conn.cursor(row_factory=class_row(Review)) as cur:
            review = cur.execute(
                f"""INSERT INTO reviews (htx_code, booking_id, tour_id, rating, comment, display_name)
                    VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (booking_id) DO NOTHING RETURNING {REVIEW_COLUMNS}""",
                (htx_code, booking_id, booking.tour_id, rating, comment,
                 display_name or default_display_name(booking.guest_name))).fetchone()
        return review or Refusal.ALREADY_REVIEWED
