# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Back office reads and plain CRUD for tours and departures (spec 3, 7.1, 7.9, 8).

Booking state changes, seat counts of a cancelled or resized departure and payments stay in core. Seat counts are read
from the view departure_load. Every query filters on htx_code.
"""
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from itertools import zip_longest
from uuid import UUID

from psycopg.errors import UniqueViolation
from psycopg.rows import class_row
from psycopg.types.json import Jsonb

from tea_tour.domain.policy import VN_TZ
from tea_tour.domain.text import slugify
from tea_tour.store import core

CATEGORIES = (("PICKING", "Hái chè"), ("CRAFTING", "Sao chè"), ("TASTING", "Thưởng trà"),
              ("SIGHTSEEING", "Ngắm cảnh"), ("EDUCATION", "Học tập"))
TOUR_STATUSES = (("DRAFT", "Bản nháp"), ("PUBLISHED", "Đang bán"), ("ARCHIVED", "Ngừng bán"))
DEPARTURE_STATUSES = (("OPEN", "Nhận khách"), ("CLOSED", "Đã đóng"), ("CANCELLED", "Đã huỷ"))
CATEGORY_LABELS, TOUR_STATUS_LABELS = dict(CATEGORIES), dict(TOUR_STATUSES)
PRICE_MAX = 10_000_000  # 200 guests at this price still fit the int4 total of a booking
BULK_MAX = 60
BULK_SPAN_DAYS = 180
BOOKING_STATUS_LABELS = {"PENDING": "Chờ xác nhận", "CONFIRMED": "Đã xác nhận", "CANCELLED": "Đã huỷ"}
PAYMENT_LABELS = {"UNPAID": "Chưa trả", "DEPOSITED": "Đã trả một phần", "PAID": "Đã trả đủ", "REFUND_DUE": "Cần hoàn tiền"}
WEEKDAYS = (("0", "T2"), ("1", "T3"), ("2", "T4"), ("3", "T5"), ("4", "T6"), ("5", "T7"), ("6", "CN"))

# ---------- tours ----------

TOUR_COLUMNS = ("id, title, slug, summary, description, category, duration_minutes, meeting_point, map_url, "
                "price_adult_vnd, price_child_vnd, default_seats, itinerary, includes, excludes, bring, faq, "
                "cover_media_id, status, created_at, updated_at")


@dataclass(frozen=True)
class Tour:
    id: UUID
    title: str
    slug: str
    summary: str
    description: str
    category: str
    duration_minutes: int
    meeting_point: str
    map_url: str
    price_adult_vnd: int
    price_child_vnd: int
    default_seats: int
    itinerary: list
    includes: list
    excludes: list
    bring: list
    faq: list
    cover_media_id: UUID | None
    status: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class TourRow:
    id: UUID
    title: str
    category: str
    status: str
    price_adult_vnd: int
    price_child_vnd: int
    cover_media_id: UUID | None
    upcoming: int
    photos: int


def status_counts(conn, htx_code: str) -> dict[str, int]:
    rows = conn.execute("SELECT status, count(*) FROM tours WHERE htx_code = %s GROUP BY status", (htx_code,)).fetchall()
    return dict(rows)


def count_tours(conn, htx_code: str, status: str | None) -> int:
    return conn.execute("SELECT count(*) FROM tours WHERE htx_code = %s AND (%s::text IS NULL OR status = %s)",
                        (htx_code, status, status)).fetchone()[0]


def list_tours(conn, htx_code: str, status: str | None, limit: int, offset: int) -> list[TourRow]:
    with conn.cursor(row_factory=class_row(TourRow)) as cur:
        return cur.execute(
            """SELECT t.id, t.title, t.category, t.status, t.price_adult_vnd, t.price_child_vnd, t.cover_media_id,
                      (SELECT count(*) FROM departures d WHERE d.tour_id = t.id AND d.htx_code = t.htx_code
                         AND d.status <> 'CANCELLED' AND d.starts_at > now())::int AS upcoming,
                      (SELECT count(*) FROM tour_media m WHERE m.tour_id = t.id AND m.htx_code = t.htx_code)::int AS photos
               FROM tours t WHERE t.htx_code = %s AND (%s::text IS NULL OR t.status = %s)
               ORDER BY t.updated_at DESC, t.id LIMIT %s OFFSET %s""",
            (htx_code, status, status, limit, offset)).fetchall()


def get_tour(conn, htx_code: str, tour_id: UUID) -> Tour | None:
    with conn.cursor(row_factory=class_row(Tour)) as cur:
        return cur.execute(f"SELECT {TOUR_COLUMNS} FROM tours WHERE htx_code = %s AND id = %s",
                           (htx_code, tour_id)).fetchone()


def tour_choices(conn, htx_code: str, include_archived: bool = False) -> list[tuple[UUID, str, str]]:
    """(id, title, status) of the tours a departure can be added to, newest first."""
    rows = conn.execute("SELECT id, title, status FROM tours WHERE htx_code = %s AND (%s OR status <> 'ARCHIVED') "
                        "ORDER BY title, id", (htx_code, include_archived)).fetchall()
    return [tuple(r) for r in rows]


def _limited(errors: dict, name: str, text: str, low: int, high: int, message: str) -> str:
    text = text.strip()
    if not low <= len(text) <= high:
        errors[name] = message
    return text


def _int(raw: str, low: int, high: int) -> int | None:
    raw = raw.strip()
    return int(raw) if raw.isascii() and raw.isdigit() and len(raw) <= 9 and low <= int(raw) <= high else None


def _rows(form, names: tuple[str, ...]) -> list[tuple[str, ...]]:
    """Parallel input lists as rows; a row with every cell empty is a spare row and is dropped."""
    columns = [form.getlist(name) for name in names]
    rows = [tuple(str(cell).strip() for cell in row) for row in zip_longest(*columns, fillvalue="")]
    return [row for row in rows if any(row)]


def read_tour_form(form) -> tuple[dict, dict[str, str], dict]:
    """(column values, {field: Vietnamese error}, what to show again). `form` has .get and .getlist (a multipart form)."""
    errors: dict[str, str] = {}
    raw = {name: str(form.get(name, "")) for name in ("title", "summary", "description", "category", "duration_minutes",
                                                      "meeting_point", "map_url", "price_adult_vnd", "price_child_vnd",
                                                      "default_seats")}
    values: dict = {"title": _limited(errors, "title", raw["title"], 1, 120, "Tên tour cần từ 1 đến 120 ký tự."),
                    "summary": _limited(errors, "summary", raw["summary"], 0, 200, "Tóm tắt tối đa 200 ký tự."),
                    "description": _limited(errors, "description", raw["description"], 0, 4000, "Mô tả tối đa 4000 ký tự."),
                    "meeting_point": _limited(errors, "meeting_point", raw["meeting_point"], 1, 200,
                                              "Điểm hẹn cần từ 1 đến 200 ký tự.")}
    values["category"] = raw["category"] if raw["category"] in CATEGORY_LABELS else None
    if values["category"] is None:
        errors["category"] = "Hãy chọn loại tour trong danh sách."
    map_url = raw["map_url"].strip()
    if map_url and not (map_url.startswith("https://") and len(map_url) <= 300 and not re.search(r"\s", map_url)):
        errors["map_url"] = "Liên kết bản đồ phải bắt đầu bằng https:// và tối đa 300 ký tự."
    values["map_url"] = map_url
    for name, low, high, message in (("duration_minutes", 30, 2880, "Thời lượng từ 30 đến 2880 phút."),
                                     ("price_adult_vnd", 0, PRICE_MAX, "Giá người lớn từ 0 đến 10.000.000 ₫."),
                                     ("price_child_vnd", 0, PRICE_MAX, "Giá trẻ em từ 0 đến 10.000.000 ₫."),
                                     ("default_seats", 1, 200, "Số chỗ mặc định từ 1 đến 200.")):
        values[name] = _int(raw[name], low, high)
        if values[name] is None:
            errors[name] = message

    itinerary = _rows(form, ("itinerary_time", "itinerary_title", "itinerary_detail"))
    if len(itinerary) > 12:
        errors["itinerary"] = "Lịch trình tối đa 12 mục."
    elif any(not title or len(time_) > 20 or len(title) > 80 or len(detail) > 300 for time_, title, detail in itinerary):
        errors["itinerary"] = "Mỗi mục lịch trình cần tên (tối đa 80 ký tự); giờ tối đa 20 ký tự, mô tả tối đa 300 ký tự."
    values["itinerary"] = [{"time": a, "title": b, "detail": c} for a, b, c in itinerary]
    shown_lists = {"itinerary": values["itinerary"]}
    for name, label in (("includes", "Bao gồm"), ("excludes", "Không bao gồm"), ("bring", "Cần mang theo")):
        lines = [line for (line,) in _rows(form, (name,))]
        if len(lines) > 10 or any(len(line) > 120 for line in lines):
            errors[name] = f"{label}: tối đa 10 dòng, mỗi dòng tối đa 120 ký tự."
        values[name] = shown_lists[name] = lines
    faq = _rows(form, ("faq_q", "faq_a"))
    if len(faq) > 8:
        errors["faq"] = "Hỏi đáp tối đa 8 mục."
    elif any(not q or not a or len(q) > 160 or len(a) > 500 for q, a in faq):
        errors["faq"] = "Mỗi mục hỏi đáp cần cả câu hỏi (tối đa 160 ký tự) và câu trả lời (tối đa 500 ký tự)."
    values["faq"] = [{"q": q, "a": a} for q, a in faq]
    shown = {**raw, **shown_lists, "faq": values["faq"]}
    return values, errors, shown


def _free_slug(conn, htx_code: str, title: str) -> str:
    base = slugify(title)
    taken = {r[0] for r in conn.execute("SELECT slug FROM tours WHERE htx_code = %s AND (slug = %s OR slug LIKE %s)",
                                        (htx_code, base, base + "-%")).fetchall()}
    if base not in taken:
        return base
    for n in range(2, 10_000):
        suffix = f"-{n}"
        candidate = base[:80 - len(suffix)].rstrip("-") + suffix
        if candidate not in taken:
            return candidate
    raise RuntimeError("no free slug")


def _json(values: dict) -> dict:
    return {k: Jsonb(v) if isinstance(v, list) else v for k, v in values.items()}


def create_tour(conn, htx_code: str, values: dict) -> UUID:
    """A new DRAFT tour; the slug comes from the title once and never changes."""
    columns = list(values)
    for attempt in range(5):
        try:
            with conn.transaction():
                slug = _free_slug(conn, htx_code, values["title"])
                return conn.execute(
                    f"INSERT INTO tours (htx_code, slug, status, {', '.join(columns)}) "
                    f"VALUES (%s, %s, 'DRAFT', {', '.join(['%s'] * len(columns))}) RETURNING id",
                    [htx_code, slug, *_json(values).values()]).fetchone()[0]
        except UniqueViolation:  # another request took the slug between the check and the insert
            if attempt == 4:
                raise
    raise RuntimeError("unreachable")


def update_tour(conn, htx_code: str, tour_id: UUID, values: dict) -> bool:
    names = list(values)
    cur = conn.execute(f"UPDATE tours SET {', '.join(f'{n} = %s' for n in names)}, updated_at = now() "
                       "WHERE htx_code = %s AND id = %s", [*_json(values).values(), htx_code, tour_id])
    return cur.rowcount == 1


def set_tour_status(conn, htx_code: str, tour_id: UUID, status: str) -> bool:
    if status not in TOUR_STATUS_LABELS:
        return False
    cur = conn.execute("UPDATE tours SET status = %s, updated_at = now() WHERE htx_code = %s AND id = %s",
                       (status, htx_code, tour_id))
    return cur.rowcount == 1


def holding_departures(conn, htx_code: str, tour_id: UUID) -> int:
    """Upcoming departures of the tour that still hold booked seats (what the confirmation page warns about)."""
    return conn.execute(
        "SELECT count(*) FROM departures d JOIN departure_load l ON l.departure_id = d.id AND l.htx_code = d.htx_code "
        "WHERE d.htx_code = %s AND d.tour_id = %s AND d.status <> 'CANCELLED' AND d.starts_at > now() AND l.seats_used > 0",
        (htx_code, tour_id)).fetchone()[0]


def tour_departures(conn, htx_code: str, tour_id: UUID, limit: int = 8) -> list["DepartureRow"]:
    return list_departures(conn, htx_code, "upcoming", tour_id, limit, 0)


# ---------- departures ----------

@dataclass(frozen=True)
class DepartureRow:
    id: UUID
    tour_id: UUID
    tour_title: str
    starts_at: datetime
    seats: int
    status: str
    guide_name: str | None
    seats_used: int
    confirmed_guests: int


@dataclass(frozen=True)
class Departure:
    id: UUID
    tour_id: UUID
    tour_title: str
    tour_status: str
    meeting_point: str
    duration_minutes: int
    starts_at: datetime
    seats: int
    price_adult_vnd: int
    price_child_vnd: int
    guide_user_id: str | None
    guide_name: str | None
    status: str
    cancel_reason: str | None
    seats_used: int
    confirmed_guests: int
    created_at: datetime

    @property
    def seats_left(self) -> int:
        return max(self.seats - self.seats_used, 0)


SHOW_WHERE = {"upcoming": "d.status <> 'CANCELLED' AND d.starts_at > now()",
              "past": "d.status <> 'CANCELLED' AND d.starts_at <= now()",
              "cancelled": "d.status = 'CANCELLED'",
              "all": "true"}
SHOW_ORDER = {"upcoming": "d.starts_at, d.id", "past": "d.starts_at DESC, d.id", "cancelled": "d.starts_at DESC, d.id",
              "all": "d.starts_at DESC, d.id"}
DEPARTURE_ROW_SQL = """
SELECT d.id, d.tour_id, t.title AS tour_title, d.starts_at, d.seats, d.status, d.guide_name,
       l.seats_used, l.confirmed_guests
FROM departures d
JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code
JOIN departure_load l ON l.departure_id = d.id AND l.htx_code = d.htx_code
WHERE d.htx_code = %s AND (%s::uuid IS NULL OR d.tour_id = %s::uuid) AND """


def count_departures(conn, htx_code: str, show: str, tour_id: UUID | None) -> int:
    return conn.execute(f"SELECT count(*) FROM departures d WHERE d.htx_code = %s AND (%s::uuid IS NULL OR d.tour_id = %s::uuid) "
                        f"AND {SHOW_WHERE[show]}", (htx_code, tour_id, tour_id)).fetchone()[0]


def list_departures(conn, htx_code: str, show: str, tour_id: UUID | None, limit: int, offset: int) -> list[DepartureRow]:
    # `show` is a key of the two constant dicts above, never user text.
    with conn.cursor(row_factory=class_row(DepartureRow)) as cur:
        return cur.execute(DEPARTURE_ROW_SQL + SHOW_WHERE[show] + f" ORDER BY {SHOW_ORDER[show]} LIMIT %s OFFSET %s",
                           (htx_code, tour_id, tour_id, limit, offset)).fetchall()


def month_departures(conn, htx_code: str, first: date, after: date, tour_id: UUID | None) -> list[DepartureRow]:
    """Departures starting on a Vietnam-time day in [first, after)."""
    start, end = (datetime.combine(d, time.min, tzinfo=VN_TZ) for d in (first, after))
    with conn.cursor(row_factory=class_row(DepartureRow)) as cur:
        return cur.execute(DEPARTURE_ROW_SQL + "d.starts_at >= %s AND d.starts_at < %s ORDER BY d.starts_at, d.id",
                           (htx_code, tour_id, tour_id, start, end)).fetchall()


def get_departure(conn, htx_code: str, departure_id: UUID) -> Departure | None:
    with conn.cursor(row_factory=class_row(Departure)) as cur:
        return cur.execute(
            """SELECT d.id, d.tour_id, t.title AS tour_title, t.status AS tour_status, t.meeting_point, t.duration_minutes,
                      d.starts_at, d.seats, d.price_adult_vnd, d.price_child_vnd, d.guide_user_id, d.guide_name, d.status,
                      d.cancel_reason, l.seats_used, l.confirmed_guests, d.created_at
               FROM departures d
               JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code
               JOIN departure_load l ON l.departure_id = d.id AND l.htx_code = d.htx_code
               WHERE d.htx_code = %s AND d.id = %s""", (htx_code, departure_id)).fetchone()


def create_departure(conn, htx_code: str, tour_id: UUID, starts_at: datetime, seats: int, price_adult_vnd: int,
                     price_child_vnd: int, guide: tuple[str | None, str | None]) -> UUID:
    return conn.execute(
        "INSERT INTO departures (htx_code, tour_id, starts_at, seats, price_adult_vnd, price_child_vnd, guide_user_id, "
        "guide_name) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (htx_code, tour_id, starts_at, seats, price_adult_vnd, price_child_vnd, *guide)).fetchone()[0]


def update_departure(conn, htx_code: str, departure_id: UUID, price_adult_vnd: int, price_child_vnd: int,
                     guide: tuple[str | None, str | None] | None) -> bool:
    """Prices of a departure (bookings keep their own copy) and, when `guide` is given, its guide."""
    cur = conn.execute(
        "UPDATE departures SET price_adult_vnd = %s, price_child_vnd = %s"
        + (", guide_user_id = %s, guide_name = %s" if guide else "") + " WHERE htx_code = %s AND id = %s AND status <> 'CANCELLED'",
        [price_adult_vnd, price_child_vnd, *(guide or ()), htx_code, departure_id])
    return cur.rowcount == 1


def set_open_closed(conn, htx_code: str, departure_id: UUID, status: str) -> core.Refusal | None:
    """Close (stop taking guests, the trip still runs) or reopen a departure; a cancelled one stays cancelled and a
    departure that has started cannot be reopened. Asking for the state it already has is not an error."""
    if status not in ("OPEN", "CLOSED"):
        return core.Refusal.INVALID_INPUT
    with conn.transaction():
        row = conn.execute("SELECT status, starts_at <= now() FROM departures WHERE htx_code = %s AND id = %s FOR UPDATE",
                           (htx_code, departure_id)).fetchone()
        if row is None:
            return core.Refusal.NOT_FOUND
        if row[0] == "CANCELLED":
            return core.Refusal.WRONG_STATE
        if row[0] == status:
            return None
        if status == "OPEN" and row[1]:
            return core.Refusal.DEPARTURE_STARTED
        conn.execute("UPDATE departures SET status = %s WHERE htx_code = %s AND id = %s", (status, htx_code, departure_id))
    return None


def holding_bookings(conn, htx_code: str, departure_id: UUID) -> tuple[int, int]:
    """(bookings, people) that a cancellation of the departure would cancel."""
    row = conn.execute("SELECT count(*), COALESCE(sum(party_size), 0) FROM bookings WHERE htx_code = %s AND departure_id = %s "
                       "AND status = ANY(%s)", (htx_code, departure_id, list(core.HOLDING))).fetchone()
    return row[0], int(row[1])


def departure_bookings(conn, htx_code: str, departure_id: UUID) -> list[core.Booking]:
    """Every booking of the departure, holding ones first, then by name."""
    with conn.cursor(row_factory=class_row(core.Booking)) as cur:
        return cur.execute(core.BOOKING_SELECT + "b.departure_id = %s ORDER BY (b.status = 'CANCELLED'), b.guest_name, b.created_at",
                           (htx_code, departure_id)).fetchall()


def booking_id_by_code(conn, htx_code: str, departure_id: UUID, code: str) -> UUID | None:
    row = conn.execute("SELECT id FROM bookings WHERE htx_code = %s AND departure_id = %s AND code = %s",
                       (htx_code, departure_id, code.strip().upper())).fetchone()
    return row[0] if row else None


# ---------- creating departures ----------

def clock(raw: str) -> time | None:
    """HH:MM, 24 hours."""
    m = re.fullmatch(r"([01][0-9]|2[0-3]):([0-5][0-9])", raw.strip())
    return time(int(m[1]), int(m[2])) if m else None


def bulk_plan(weekdays: set[int], at: time, first: date, last: date, existing: set[datetime], now: datetime) -> tuple[list[datetime], int, int]:
    """(starts to create, days skipped because the tour already runs then, days skipped because they are past)."""
    starts, taken, past = [], 0, 0
    day = first
    while day <= last:
        if day.weekday() in weekdays:
            start = datetime.combine(day, at, tzinfo=VN_TZ)
            if start <= now:
                past += 1
            elif start in existing:
                taken += 1
            else:
                starts.append(start)
        day += timedelta(days=1)
    return starts, taken, past


def existing_starts(conn, htx_code: str, tour_id: UUID, first: date, last: date) -> set[datetime]:
    start = datetime.combine(first, time.min, tzinfo=VN_TZ)
    end = datetime.combine(last + timedelta(days=1), time.min, tzinfo=VN_TZ)
    rows = conn.execute("SELECT starts_at FROM departures WHERE htx_code = %s AND tour_id = %s AND status <> 'CANCELLED' "
                        "AND starts_at >= %s AND starts_at < %s", (htx_code, tour_id, start, end)).fetchall()
    return {r[0] for r in rows}


def create_bulk(conn, htx_code: str, tour: Tour, weekdays: set[int], at: time, first: date, last: date, seats: int,
                price_adult_vnd: int, price_child_vnd: int, guide: tuple[str | None, str | None]) -> tuple[int, int, int] | str:
    """Create every missing departure of the rule in one transaction. Returns (created, already there, past) or the
    Vietnamese reason for refusing the whole batch (more than 60 would be created, or none)."""
    with conn.transaction():
        conn.execute("SELECT 1 FROM tours WHERE id = %s AND htx_code = %s FOR UPDATE", (tour.id, htx_code))  # two clicks, one batch
        now = conn.execute("SELECT now()").fetchone()[0]
        starts, taken, past = bulk_plan(weekdays, at, first, last, existing_starts(conn, htx_code, tour.id, first, last), now)
        if len(starts) > BULK_MAX:
            return f"Quy tắc này sẽ tạo {len(starts)} chuyến, vượt giới hạn {BULK_MAX} chuyến một lần. Chưa tạo chuyến nào; hãy thu hẹp khoảng ngày hoặc bớt thứ trong tuần."
        if not starts:
            return "Không có ngày nào để tạo: các ngày đó đã có chuyến vào đúng giờ này hoặc đã qua."
        for start in starts:
            create_departure(conn, htx_code, tour.id, start, seats, price_adult_vnd, price_child_vnd, guide)
        return len(starts), taken, past


def month_start(raw: str | None, today: date) -> date:
    """First day of the month named by YYYY-MM, else of today's month."""
    m = re.fullmatch(r"([0-9]{4})-(0[1-9]|1[0-2])", raw or "")
    year, month = (int(m[1]), int(m[2])) if m else (today.year, today.month)
    if not 2000 <= year <= 2100:
        year, month = today.year, today.month
    return date(year, month, 1)


def add_months(first: date, n: int) -> date:
    index = first.year * 12 + first.month - 1 + n
    return date(index // 12, index % 12 + 1, 1)
