# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Read queries and plain CRUD of the sales desk (spec 6): overview, bookings, payments, customers, reviews, reports.

Nothing here changes a booking's status, seats or money: those go through store.core. Seat counts come from the
view departure_load. Every query filters on htx_code. Dates the manager types are Vietnam days.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from psycopg.rows import class_row

from tea_tour import appkit
from tea_tour.domain import money
from tea_tour.domain.policy import VN_TZ

SOON_DAYS = 7
TODO_ROWS = 5


def _now(now: datetime | None) -> datetime:
    return now or datetime.now(timezone.utc)


def month_start(moment: datetime) -> datetime:
    """00:00 on the first day of the Vietnam month that contains the moment."""
    local = moment.astimezone(VN_TZ)
    return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def add_months(start: datetime, months: int) -> datetime:
    index = start.year * 12 + start.month - 1 + months
    return start.replace(year=index // 12, month=index % 12 + 1)


def _scalar(conn, sql: str, params: tuple):
    return conn.execute(sql, params).fetchone()[0]


# ---------- overview ----------

@dataclass(frozen=True)
class SoonDeparture:
    departure_id: UUID
    starts_at: datetime
    status: str
    guide_name: str | None
    tour_title: str
    seats: int
    seats_used: int


@dataclass(frozen=True)
class TodoBooking:
    id: UUID
    code: str
    guest_name: str
    party_size: int
    total_vnd: int
    paid_vnd: int
    deposit_vnd: int
    status: str
    starts_at: datetime
    created_at: datetime


@dataclass(frozen=True)
class Overview:
    upcoming_departures: int
    guests_month: int
    collected_month: int
    pending: int
    reported: int
    refund_count: int
    refund_vnd: int
    reviews_pending: int
    inquiries_new: int
    soon: list[SoonDeparture]
    pending_rows: list[TodoBooking]
    reported_rows: list[TodoBooking]
    refund_rows: list[TodoBooking]


REFUND_WHERE = "((b.status = 'CANCELLED' AND b.paid_vnd > 0) OR (b.status <> 'CANCELLED' AND b.paid_vnd > b.total_vnd))"
_TODO_SELECT = ("SELECT b.id, b.code, b.guest_name, b.party_size, b.total_vnd, b.paid_vnd, b.deposit_vnd, b.status, "
                "d.starts_at, b.created_at FROM bookings b JOIN departures d ON d.id = b.departure_id AND d.htx_code = b.htx_code "
                "WHERE b.htx_code = %s AND ")


def _todo(conn, htx: str, where: str) -> list[TodoBooking]:
    with conn.cursor(row_factory=class_row(TodoBooking)) as cur:
        return cur.execute(f"{_TODO_SELECT}{where} ORDER BY b.created_at LIMIT {TODO_ROWS}", (htx,)).fetchall()


def overview(conn, htx: str, now: datetime | None = None) -> Overview:
    now = _now(now)
    start = month_start(now)
    end = add_months(start, 1)
    pending_sql = "b.status = 'PENDING'"
    reported_sql = "b.status = 'PENDING' AND b.guest_paid_reported_at IS NOT NULL"
    count = "SELECT count(*) FROM bookings b WHERE b.htx_code = %s AND "
    refund_count, refund_vnd = conn.execute(
        "SELECT count(*), COALESCE(sum(CASE WHEN b.status = 'CANCELLED' THEN b.paid_vnd ELSE b.paid_vnd - b.total_vnd END), 0)"
        f"::bigint FROM bookings b WHERE b.htx_code = %s AND {REFUND_WHERE}", (htx,)).fetchone()
    with conn.cursor(row_factory=class_row(SoonDeparture)) as cur:
        soon = cur.execute(
            "SELECT d.id AS departure_id, d.starts_at, d.status, d.guide_name, t.title AS tour_title, d.seats, l.seats_used "
            "FROM departures d JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code "
            "JOIN departure_load l ON l.departure_id = d.id AND l.htx_code = d.htx_code "
            "WHERE d.htx_code = %s AND d.status <> 'CANCELLED' AND d.starts_at > %s AND d.starts_at <= %s "
            "ORDER BY d.starts_at", (htx, now, now + timedelta(days=SOON_DAYS))).fetchall()
    return Overview(
        upcoming_departures=_scalar(conn, "SELECT count(*) FROM departures WHERE htx_code = %s AND status <> 'CANCELLED' "
                                          "AND starts_at > %s", (htx, now)),
        guests_month=_scalar(conn, "SELECT COALESCE(sum(b.party_size), 0)::int FROM bookings b JOIN departures d "
                                   "ON d.id = b.departure_id AND d.htx_code = b.htx_code WHERE b.htx_code = %s "
                                   "AND b.status = 'CONFIRMED' AND d.starts_at >= %s AND d.starts_at < %s", (htx, start, end)),
        collected_month=_scalar(conn, "SELECT COALESCE(sum(amount_vnd), 0)::bigint FROM payments WHERE htx_code = %s "
                                      "AND recorded_at >= %s AND recorded_at < %s", (htx, start, end)),
        pending=_scalar(conn, count + pending_sql, (htx,)),
        reported=_scalar(conn, count + reported_sql, (htx,)),
        refund_count=refund_count, refund_vnd=refund_vnd,
        reviews_pending=_scalar(conn, "SELECT count(*) FROM reviews WHERE htx_code = %s AND status = 'PENDING'", (htx,)),
        inquiries_new=_scalar(conn, "SELECT count(*) FROM inquiries WHERE htx_code = %s AND status = 'NEW'", (htx,)),
        soon=soon,
        pending_rows=_todo(conn, htx, pending_sql),
        reported_rows=_todo(conn, htx, reported_sql),
        refund_rows=_todo(conn, htx, REFUND_WHERE),
    )


# ---------- bookings: list, filters, export ----------

STATUSES = ("PENDING", "CONFIRMED", "CANCELLED")
PAYMENT_STATES = ("UNPAID", "DEPOSITED", "PAID", "REFUND_DUE")
# The SQL twin of domain.money.payment_state; a test keeps the two in step.
PAYMENT_SQL = {
    "REFUND_DUE": REFUND_WHERE,
    "PAID": "(b.status <> 'CANCELLED' AND b.paid_vnd = b.total_vnd)",
    "DEPOSITED": "(b.status <> 'CANCELLED' AND b.paid_vnd > 0 AND b.paid_vnd < b.total_vnd)",
    "UNPAID": "(b.paid_vnd <= 0 AND (b.status = 'CANCELLED' OR b.total_vnd > 0))",
}


@dataclass(frozen=True)
class BookingFilters:
    q: str = ""
    status: str = ""
    payment: str = ""
    departure: UUID | None = None
    date_from: date | None = None
    date_to: date | None = None
    reported: bool = False

    def params(self) -> dict:
        """The active filters as query parameters, for links that keep them."""
        values = {"q": self.q, "status": self.status, "payment": self.payment, "departure": self.departure,
                  "from": self.date_from, "to": self.date_to, "reported": 1 if self.reported else ""}
        return {key: value for key, value in values.items() if value}


@dataclass(frozen=True)
class BookingRow:
    id: UUID
    departure_id: UUID
    code: str
    guest_name: str
    phone: str
    email: str | None
    note: str | None
    internal_note: str | None
    adults: int
    children: int
    party_size: int
    total_vnd: int
    deposit_vnd: int
    paid_vnd: int
    status: str
    source: str
    cancel_reason: str | None
    hold_until: datetime | None
    guest_paid_reported_at: datetime | None
    created_at: datetime
    starts_at: datetime
    tour_title: str

    @property
    def payment_state(self) -> str:
        return money.payment_state(self.status, self.total_vnd, self.paid_vnd)


_BOOKING_FROM = ("FROM bookings b JOIN departures d ON d.id = b.departure_id AND d.htx_code = b.htx_code "
                 "JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code WHERE b.htx_code = %s")
_BOOKING_COLUMNS = ("b.id, b.departure_id, b.code, b.guest_name, b.phone, b.email, b.note, b.internal_note, b.adults, "
                    "b.children, b.party_size, b.total_vnd, b.deposit_vnd, b.paid_vnd, b.status, b.source, b.cancel_reason, "
                    "b.hold_until, b.guest_paid_reported_at, b.created_at, d.starts_at, t.title AS tour_title")


def _booking_where(htx: str, f: BookingFilters) -> tuple[str, list]:
    sql, params = "", [htx]
    if f.q:
        sql += " AND (b.code ILIKE %s ESCAPE '\\' OR b.guest_name ILIKE %s ESCAPE '\\' OR b.phone ILIKE %s ESCAPE '\\')"
        params += [appkit.like_pattern(f.q)] * 3
    if f.status:
        sql += " AND b.status = %s"
        params.append(f.status)
    if f.payment:
        sql += f" AND {PAYMENT_SQL[f.payment]}"
    if f.departure:
        sql += " AND b.departure_id = %s"
        params.append(f.departure)
    if f.date_from:
        sql += " AND (d.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %s"
        params.append(f.date_from)
    if f.date_to:
        sql += " AND (d.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= %s"
        params.append(f.date_to)
    if f.reported:
        sql += " AND b.status = 'PENDING' AND b.guest_paid_reported_at IS NOT NULL"
    return sql, params


def _booking_rows(conn, htx: str, f: BookingFilters, tail: str = "", extra: tuple = ()) -> list[BookingRow]:
    where, params = _booking_where(htx, f)
    with conn.cursor(row_factory=class_row(BookingRow)) as cur:
        return cur.execute(f"SELECT {_BOOKING_COLUMNS} {_BOOKING_FROM}{where} ORDER BY b.created_at DESC, b.id{tail}",
                           params + list(extra)).fetchall()


def list_bookings(conn, htx: str, f: BookingFilters, page_raw: str | None) -> tuple[list[BookingRow], appkit.Page]:
    where, params = _booking_where(htx, f)
    total = _scalar(conn, f"SELECT count(*) {_BOOKING_FROM}{where}", tuple(params))
    page = appkit.page_of(page_raw, total)
    return _booking_rows(conn, htx, f, " LIMIT %s OFFSET %s", (page.size, page.offset)), page


def export_bookings(conn, htx: str, f: BookingFilters) -> list[BookingRow]:
    return _booking_rows(conn, htx, f)


@dataclass(frozen=True)
class DepartureOption:
    id: UUID
    starts_at: datetime
    status: str
    tour_id: UUID
    tour_title: str
    seats: int
    seats_left: int


def _options(conn, htx: str, where: str, params: tuple, order: str = "d.starts_at") -> list[DepartureOption]:
    with conn.cursor(row_factory=class_row(DepartureOption)) as cur:
        return cur.execute(
            "SELECT d.id, d.starts_at, d.status, d.tour_id, t.title AS tour_title, d.seats, "
            "greatest(d.seats - l.seats_used, 0) AS seats_left FROM departures d "
            "JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code "
            f"JOIN departure_load l ON l.departure_id = d.id AND l.htx_code = d.htx_code WHERE d.htx_code = %s AND {where} "
            f"ORDER BY {order} LIMIT 300", (htx, *params)).fetchall()


def bookable_departures(conn, htx: str) -> list[DepartureOption]:
    """Where the manager may book a caller: not cancelled, not started yet (OPEN or CLOSED, any tour status)."""
    return _options(conn, htx, "d.status <> 'CANCELLED' AND d.starts_at > now()", ())


def filter_departures(conn, htx: str) -> list[DepartureOption]:
    """The departure choices of the bookings filter: the latest 300, newest first."""
    return _options(conn, htx, "true", (), "d.starts_at DESC")


# ---------- one booking ----------

@dataclass(frozen=True)
class Event:
    at: datetime
    actor_kind: str
    actor_name: str
    kind: str
    detail: str


@dataclass(frozen=True)
class Payment:
    amount_vnd: int
    method: str
    note: str | None
    recorded_by_name: str | None
    recorded_at: datetime


@dataclass(frozen=True)
class BookingDetail:
    tour_id: UUID
    tour_title: str
    departure_status: str
    departure_seats: int
    events: list[Event]
    payments: list[Payment]
    move_targets: list[DepartureOption]


def booking_detail(conn, htx: str, booking) -> BookingDetail:
    """Everything the booking page shows besides the booking itself (a core.Booking of this cooperative)."""
    tour_id, tour_title, status, seats = conn.execute(
        "SELECT t.id, t.title, d.status, d.seats FROM departures d JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code "
        "WHERE d.id = %s AND d.htx_code = %s", (booking.departure_id, htx)).fetchone()
    with conn.cursor(row_factory=class_row(Event)) as cur:
        events = cur.execute("SELECT at, actor_kind, actor_name, kind, detail FROM booking_events "
                             "WHERE booking_id = %s AND htx_code = %s ORDER BY at, id", (booking.id, htx)).fetchall()
    with conn.cursor(row_factory=class_row(Payment)) as cur:
        payments = cur.execute("SELECT amount_vnd, method, note, recorded_by_name, recorded_at FROM payments "
                               "WHERE booking_id = %s AND htx_code = %s ORDER BY recorded_at, id", (booking.id, htx)).fetchall()
    targets = [] if booking.status == "CANCELLED" else [
        option for option in _options(conn, htx, "d.tour_id = %s AND d.status <> 'CANCELLED' AND d.starts_at > now()", (tour_id,))
        if option.id != booking.departure_id and option.seats_left >= booking.party_size]
    return BookingDetail(tour_id, tour_title, status, seats, events, payments, targets)


def set_internal_note(conn, htx: str, booking_id: UUID, note: str | None) -> bool:
    """The manager's private note: plain text on the booking, no state change."""
    return conn.execute("UPDATE bookings SET internal_note = %s WHERE id = %s AND htx_code = %s",
                        (note, booking_id, htx)).rowcount == 1


# ---------- payments ledger ----------

METHODS = ("TRANSFER", "CASH")


@dataclass(frozen=True)
class PaymentFilters:
    method: str = ""
    date_from: date | None = None
    date_to: date | None = None
    q: str = ""

    def params(self) -> dict:
        values = {"method": self.method, "from": self.date_from, "to": self.date_to, "q": self.q}
        return {key: value for key, value in values.items() if value}


@dataclass(frozen=True)
class LedgerRow:
    recorded_at: datetime
    amount_vnd: int
    method: str
    note: str | None
    recorded_by_name: str | None
    booking_id: UUID
    code: str
    guest_name: str


@dataclass(frozen=True)
class LedgerTotals:
    money_in: int
    money_out: int  # a positive number: how much was paid back

    @property
    def net(self) -> int:
        return self.money_in - self.money_out


_LEDGER_FROM = "FROM payments p JOIN bookings b ON b.id = p.booking_id AND b.htx_code = p.htx_code WHERE p.htx_code = %s"


def _ledger_where(htx: str, f: PaymentFilters) -> tuple[str, list]:
    sql, params = "", [htx]
    if f.method:
        sql += " AND p.method = %s"
        params.append(f.method)
    if f.date_from:
        sql += " AND (p.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %s"
        params.append(f.date_from)
    if f.date_to:
        sql += " AND (p.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= %s"
        params.append(f.date_to)
    if f.q:
        sql += " AND b.code ILIKE %s ESCAPE '\\'"
        params.append(appkit.like_pattern(f.q))
    return sql, params


def _ledger_rows(conn, htx: str, f: PaymentFilters, tail: str = "", extra: tuple = ()) -> list[LedgerRow]:
    where, params = _ledger_where(htx, f)
    with conn.cursor(row_factory=class_row(LedgerRow)) as cur:
        return cur.execute("SELECT p.recorded_at, p.amount_vnd, p.method, p.note, p.recorded_by_name, p.booking_id, b.code, "
                           f"b.guest_name {_LEDGER_FROM}{where} ORDER BY p.recorded_at DESC, p.id DESC{tail}",
                           params + list(extra)).fetchall()


def list_payments(conn, htx: str, f: PaymentFilters, page_raw: str | None) -> tuple[list[LedgerRow], appkit.Page, LedgerTotals]:
    """One page of the ledger and the totals of the whole filtered set."""
    where, params = _ledger_where(htx, f)
    total, money_in, money_out = conn.execute(
        "SELECT count(*), COALESCE(sum(p.amount_vnd) FILTER (WHERE p.amount_vnd > 0), 0)::bigint, "
        f"COALESCE(-sum(p.amount_vnd) FILTER (WHERE p.amount_vnd < 0), 0)::bigint {_LEDGER_FROM}{where}", params).fetchone()
    page = appkit.page_of(page_raw, total)
    return _ledger_rows(conn, htx, f, " LIMIT %s OFFSET %s", (page.size, page.offset)), page, LedgerTotals(money_in, money_out)


def export_payments(conn, htx: str, f: PaymentFilters) -> list[LedgerRow]:
    return _ledger_rows(conn, htx, f)


# ---------- customers ----------

@dataclass(frozen=True)
class Customer:
    phone: str
    guest_name: str
    bookings: int  # not counting cancelled ones
    went: int  # bookings with at least one guest checked in
    paid_vnd: int
    last_at: datetime


_CUSTOMERS = ("SELECT b.phone, (array_agg(b.guest_name ORDER BY b.created_at DESC))[1] AS guest_name, "
              "count(*) FILTER (WHERE b.status <> 'CANCELLED')::int AS bookings, "
              "count(*) FILTER (WHERE b.checked_in_count >= 1)::int AS went, COALESCE(sum(b.paid_vnd), 0)::bigint AS paid_vnd, "
              "max(b.created_at) AS last_at FROM bookings b WHERE b.htx_code = %s GROUP BY b.phone")
_CUSTOMER_MATCH = " HAVING bool_or(b.guest_name ILIKE %s ESCAPE '\\') OR bool_or(b.phone ILIKE %s ESCAPE '\\')"


def _customer_query(htx: str, q: str) -> tuple[str, list]:
    if not q:
        return _CUSTOMERS, [htx]
    return _CUSTOMERS + _CUSTOMER_MATCH, [htx, appkit.like_pattern(q), appkit.like_pattern(q)]


def list_customers(conn, htx: str, q: str, page_raw: str | None, everything: bool = False) -> tuple[list[Customer], appkit.Page]:
    sql, params = _customer_query(htx, q)
    total = _scalar(conn, f"SELECT count(*) FROM ({sql}) c", tuple(params))
    page = appkit.page_of(page_raw, total)
    tail = "" if everything else " LIMIT %s OFFSET %s"
    tail_params = [] if everything else [page.size, page.offset]
    with conn.cursor(row_factory=class_row(Customer)) as cur:
        rows = cur.execute(f"{sql} ORDER BY max(b.created_at) DESC, b.phone{tail}", params + tail_params).fetchall()
    return rows, page


# ---------- reviews and inquiries (moderation is plain CRUD on these two tables) ----------

REVIEW_STATUSES = ("PENDING", "PUBLISHED", "HIDDEN")
INQUIRY_STATUSES = ("NEW", "CONTACTED", "CLOSED")


@dataclass(frozen=True)
class ReviewRow:
    id: UUID
    rating: int
    comment: str
    display_name: str
    status: str
    reply: str | None
    created_at: datetime
    moderated_at: datetime | None
    tour_title: str
    booking_id: UUID
    code: str
    guest_name: str
    starts_at: datetime


def list_reviews(conn, htx: str, status: str, page_raw: str | None) -> tuple[list[ReviewRow], appkit.Page, dict[str, int]]:
    """Reviews to moderate first, then the newest; with the count of every status for the filter."""
    counts = dict(conn.execute("SELECT status, count(*) FROM reviews WHERE htx_code = %s GROUP BY status", (htx,)).fetchall())
    where, params = (" AND r.status = %s", [htx, status]) if status else ("", [htx])
    total = _scalar(conn, f"SELECT count(*) FROM reviews r WHERE r.htx_code = %s{where}", tuple(params))
    page = appkit.page_of(page_raw, total)
    with conn.cursor(row_factory=class_row(ReviewRow)) as cur:
        rows = cur.execute(
            "SELECT r.id, r.rating, r.comment, r.display_name, r.status, r.reply, r.created_at, r.moderated_at, "
            "t.title AS tour_title, r.booking_id, b.code, b.guest_name, d.starts_at FROM reviews r "
            "JOIN tours t ON t.id = r.tour_id AND t.htx_code = r.htx_code "
            "JOIN bookings b ON b.id = r.booking_id AND b.htx_code = r.htx_code "
            "JOIN departures d ON d.id = b.departure_id AND d.htx_code = b.htx_code "
            f"WHERE r.htx_code = %s{where} ORDER BY (r.status = 'PENDING') DESC, r.created_at DESC, r.id LIMIT %s OFFSET %s",
            params + [page.size, page.offset]).fetchall()
    return rows, page, counts


def set_review_status(conn, htx: str, review_id: UUID, status: str) -> bool:
    return conn.execute("UPDATE reviews SET status = %s, moderated_at = now() WHERE id = %s AND htx_code = %s",
                        (status, review_id, htx)).rowcount == 1


def set_review_reply(conn, htx: str, review_id: UUID, reply: str | None) -> bool:
    return conn.execute("UPDATE reviews SET reply = %s, moderated_at = now() WHERE id = %s AND htx_code = %s",
                        (reply, review_id, htx)).rowcount == 1


@dataclass(frozen=True)
class InquiryRow:
    id: UUID
    name: str
    phone: str
    group_size: int
    desired_date: date | None
    message: str
    status: str
    internal_note: str | None
    created_at: datetime


def list_inquiries(conn, htx: str, status: str, page_raw: str | None) -> tuple[list[InquiryRow], appkit.Page, dict[str, int]]:
    counts = dict(conn.execute("SELECT status, count(*) FROM inquiries WHERE htx_code = %s GROUP BY status", (htx,)).fetchall())
    where, params = (" AND status = %s", [htx, status]) if status else ("", [htx])
    total = _scalar(conn, f"SELECT count(*) FROM inquiries WHERE htx_code = %s{where}", tuple(params))
    page = appkit.page_of(page_raw, total)
    with conn.cursor(row_factory=class_row(InquiryRow)) as cur:
        rows = cur.execute(
            "SELECT id, name, phone, group_size, desired_date, message, status, internal_note, created_at FROM inquiries "
            f"WHERE htx_code = %s{where} ORDER BY array_position(ARRAY['NEW', 'CONTACTED', 'CLOSED'], status), created_at DESC, id "
            "LIMIT %s OFFSET %s", params + [page.size, page.offset]).fetchall()
    return rows, page, counts


def update_inquiry(conn, htx: str, inquiry_id: UUID, status: str, note: str | None) -> bool:
    return conn.execute("UPDATE inquiries SET status = %s, internal_note = %s WHERE id = %s AND htx_code = %s",
                        (status, note, inquiry_id, htx)).rowcount == 1


# ---------- reports ----------

REPORT_MONTHS = 12


@dataclass(frozen=True)
class MonthRow:
    label: str  # "11/2026"
    guests: int
    bookings: int
    collected: int


@dataclass(frozen=True)
class TourRow:
    tour_title: str
    departures: int  # that took place (started, not cancelled)
    guests: int
    bookings: int
    collected: int
    occupancy: float | None  # confirmed guests / seats of the departures that took place, percent


@dataclass(frozen=True)
class Reports:
    months: list[MonthRow]
    tours: list[TourRow]
    past_departures: int
    past_seats: int
    past_guests: int
    created: int  # bookings made in the window
    cancelled: int
    cancelled_by: dict[str, int]

    @property
    def occupancy(self) -> float | None:
        return round(100 * self.past_guests / self.past_seats, 1) if self.past_seats else None

    @property
    def cancel_rate(self) -> float | None:
        return round(100 * self.cancelled / self.created, 1) if self.created else None


def _percent(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def reports(conn, htx: str, now: datetime | None = None) -> Reports:
    """The last 12 Vietnam months up to and including the current one. Guests and bookings are the CONFIRMED ones, counted in
    the month of the departure; money is the ledger (refunds subtracted) in the month it was recorded."""
    now = _now(now)
    end = add_months(month_start(now), 1)
    start = add_months(end, -REPORT_MONTHS)
    window = (htx, start, end)
    month = "date_trunc('month', {} AT TIME ZONE 'Asia/Ho_Chi_Minh')"
    guests = {row[0]: row[1:] for row in conn.execute(
        f"SELECT {month.format('d.starts_at')}, sum(b.party_size)::int, count(*)::int FROM bookings b JOIN departures d "
        "ON d.id = b.departure_id AND d.htx_code = b.htx_code WHERE b.htx_code = %s AND b.status = 'CONFIRMED' "
        "AND d.starts_at >= %s AND d.starts_at < %s GROUP BY 1", window)}
    money_by_month = dict(conn.execute(
        f"SELECT {month.format('recorded_at')}, sum(amount_vnd)::bigint FROM payments WHERE htx_code = %s "
        "AND recorded_at >= %s AND recorded_at < %s GROUP BY 1", window))
    months = []
    for index in range(REPORT_MONTHS):
        first = add_months(start, index).replace(tzinfo=None)
        taken = guests.get(first, (0, 0))
        months.append(MonthRow(f"{first.month:02d}/{first.year}", taken[0], taken[1], money_by_month.get(first, 0)))
    tours: dict[UUID, dict] = {}

    def row(tour_id, title):
        return tours.setdefault(tour_id, {"title": title, "departures": 0, "seats": 0, "present": 0, "guests": 0, "bookings": 0,
                                          "collected": 0})

    for tour_id, title, departures_n, seats, present in conn.execute(
            "SELECT t.id, t.title, count(*), sum(d.seats), sum(l.confirmed_guests) FROM departures d "
            "JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code "
            "JOIN departure_load l ON l.departure_id = d.id AND l.htx_code = d.htx_code WHERE d.htx_code = %s "
            "AND d.status <> 'CANCELLED' AND d.starts_at >= %s AND d.starts_at < %s AND d.starts_at <= %s GROUP BY t.id, t.title",
            (*window, now)):
        row(tour_id, title).update(departures=departures_n, seats=int(seats), present=int(present))
    for tour_id, title, guests_n, bookings_n in conn.execute(
            "SELECT t.id, t.title, sum(b.party_size), count(*) FROM bookings b "
            "JOIN departures d ON d.id = b.departure_id AND d.htx_code = b.htx_code "
            "JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code WHERE b.htx_code = %s AND b.status = 'CONFIRMED' "
            "AND d.starts_at >= %s AND d.starts_at < %s GROUP BY t.id, t.title", window):
        row(tour_id, title).update(guests=int(guests_n), bookings=bookings_n)
    for tour_id, title, collected in conn.execute(
            "SELECT t.id, t.title, sum(p.amount_vnd) FROM payments p "
            "JOIN bookings b ON b.id = p.booking_id AND b.htx_code = p.htx_code "
            "JOIN departures d ON d.id = b.departure_id AND d.htx_code = b.htx_code "
            "JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code WHERE p.htx_code = %s "
            "AND p.recorded_at >= %s AND p.recorded_at < %s GROUP BY t.id, t.title", window):
        row(tour_id, title)["collected"] = int(collected)
    tour_rows = sorted((TourRow(v["title"], v["departures"], v["guests"], v["bookings"], v["collected"],
                                _percent(v["present"], v["seats"])) for v in tours.values()),
                       key=lambda t: (-t.guests, -t.collected, t.tour_title))
    created, cancelled = conn.execute(
        "SELECT count(*), count(*) FILTER (WHERE status = 'CANCELLED') FROM bookings WHERE htx_code = %s "
        "AND created_at >= %s AND created_at < %s", window).fetchone()
    by_whom = dict(conn.execute("SELECT cancelled_by, count(*) FROM bookings WHERE htx_code = %s AND status = 'CANCELLED' "
                                "AND created_at >= %s AND created_at < %s GROUP BY 1", window).fetchall())
    past = [r for r in tours.values() if r["departures"]]
    return Reports(months, tour_rows, sum(r["departures"] for r in past), sum(r["seats"] for r in past),
                   sum(r["present"] for r in past), created, cancelled,
                   {kind: by_whom.get(kind, 0) for kind in ("GUEST", "MANAGER", "SYSTEM")})
