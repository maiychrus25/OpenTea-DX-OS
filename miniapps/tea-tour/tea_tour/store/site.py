# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Read queries of the customer site (spec 5). Every query filters on htx_code and shows only PUBLISHED tours.

Seats left always come from the view departure_load. A "bookable" departure is OPEN, in the future and has a seat left.
"""
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from psycopg.rows import class_row

CATEGORIES = {"PICKING": "Hái chè", "CRAFTING": "Sao chè", "TASTING": "Thưởng trà", "SIGHTSEEING": "Ngắm cảnh",
              "EDUCATION": "Trải nghiệm học tập"}
SORTS = ("soon", "price", "rating")
PAGE_SIZE = 12
FEATURED = 6
FAR_FUTURE = datetime(9999, 12, 31, tzinfo=timezone.utc)
MONTH_RE = re.compile(r"20[0-9]{2}-(0[1-9]|1[0-2])")


@dataclass(frozen=True)
class TourCard:
    id: UUID
    slug: str
    title: str
    summary: str
    category: str
    duration_minutes: int
    cover_media_id: UUID | None
    price_from: int
    rating_avg: float | None
    rating_count: int
    next_departure_id: UUID | None
    next_starts_at: datetime | None
    next_seats_left: int | None


@dataclass(frozen=True)
class Tour:
    id: UUID
    slug: str
    title: str
    summary: str
    description: str
    category: str
    duration_minutes: int
    meeting_point: str
    map_url: str | None
    price_adult_vnd: int
    price_child_vnd: int
    itinerary: list
    includes: list
    excludes: list
    bring: list
    faq: list


@dataclass(frozen=True)
class DepartureRow:
    id: UUID
    starts_at: datetime
    seats: int
    status: str
    price_adult_vnd: int
    price_child_vnd: int
    guide_name: str | None
    seats_left: int

    @property
    def bookable(self) -> bool:
        return self.status == "OPEN" and self.seats_left > 0


@dataclass(frozen=True)
class ReviewRow:
    rating: int
    comment: str
    display_name: str
    reply: str | None
    created_at: datetime
    trip_at: datetime
    tour_title: str
    tour_slug: str


CARD_SQL = """
WITH ok AS (
  SELECT d.tour_id, d.id, d.starts_at, d.price_adult_vnd, d.seats - l.seats_used AS seats_left
  FROM departures d JOIN departure_load l ON l.htx_code = d.htx_code AND l.departure_id = d.id
  WHERE d.htx_code = %(htx)s AND d.status = 'OPEN' AND d.starts_at > now() AND d.seats > l.seats_used),
rate AS (
  SELECT tour_id, avg(rating)::float AS average, count(*)::int AS n
  FROM reviews WHERE htx_code = %(htx)s AND status = 'PUBLISHED' GROUP BY tour_id)
SELECT t.id, t.slug, t.title, t.summary, t.category, t.duration_minutes,
       COALESCE(t.cover_media_id, (SELECT tm.media_id FROM tour_media tm
                                   WHERE tm.tour_id = t.id AND tm.htx_code = t.htx_code ORDER BY tm.position LIMIT 1)) AS cover_media_id,
       COALESCE((SELECT min(ok.price_adult_vnd) FROM ok WHERE ok.tour_id = t.id), t.price_adult_vnd) AS price_from,
       r.average AS rating_avg, COALESCE(r.n, 0) AS rating_count,
       nx.id AS next_departure_id, nx.starts_at AS next_starts_at, nx.seats_left AS next_seats_left
FROM tours t
LEFT JOIN rate r ON r.tour_id = t.id
LEFT JOIN LATERAL (SELECT id, starts_at, seats_left FROM ok WHERE ok.tour_id = t.id ORDER BY starts_at LIMIT 1) nx ON true
WHERE t.htx_code = %(htx)s AND t.status = 'PUBLISHED'
  AND (%(category)s::text IS NULL OR t.category = %(category)s)
  AND (%(month)s::text IS NULL OR EXISTS (
        SELECT 1 FROM ok WHERE ok.tour_id = t.id
          AND to_char(ok.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') = %(month)s))"""


def _sorted(cards: list[TourCard], sort: str) -> list[TourCard]:
    name = lambda c: c.title.casefold()  # noqa: E731
    if sort == "price":
        return sorted(cards, key=lambda c: (c.price_from, name(c)))
    if sort == "rating":
        return sorted(cards, key=lambda c: (c.rating_avg is None, -(c.rating_avg or 0), name(c)))
    return sorted(cards, key=lambda c: (c.next_starts_at is None, c.next_starts_at or FAR_FUTURE, name(c)))


def tour_cards(conn, htx: str, category: str | None = None, month: str | None = None, sort: str = "soon") -> list[TourCard]:
    """Every matching tour in the order of spec 5 rule 5. shortcut: a cooperative has dozens of tours, so the sort and
    the page cut are done here; move them into SQL if one ever has thousands."""
    category = category if category in CATEGORIES else None
    month = month if month and MONTH_RE.fullmatch(month) else None
    with conn.cursor(row_factory=class_row(TourCard)) as cur:
        cards = cur.execute(CARD_SQL, {"htx": htx, "category": category, "month": month}).fetchall()
    return _sorted(cards, sort if sort in SORTS else "soon")


def featured(conn, htx: str) -> list[TourCard]:
    return tour_cards(conn, htx)[:FEATURED]


def tour_by_slug(conn, htx: str, slug: str) -> Tour | None:
    with conn.cursor(row_factory=class_row(Tour)) as cur:
        return cur.execute(
            """SELECT id, slug, title, summary, description, category, duration_minutes, meeting_point, map_url,
                      price_adult_vnd, price_child_vnd, itinerary, includes, excludes, bring, faq
               FROM tours WHERE htx_code = %s AND slug = %s AND status = 'PUBLISHED'""", (htx, slug)).fetchone()


def card_of(conn, htx: str, tour_id: UUID) -> TourCard | None:
    return next((c for c in tour_cards(conn, htx) if c.id == tour_id), None)


def upcoming_departures(conn, htx: str, tour_id: UUID, limit: int = 20) -> list[DepartureRow]:
    """OPEN and CLOSED departures that have not started, soonest first; cancelled and past ones are not shown."""
    with conn.cursor(row_factory=class_row(DepartureRow)) as cur:
        return cur.execute(
            """SELECT d.id, d.starts_at, d.seats, d.status, d.price_adult_vnd, d.price_child_vnd, d.guide_name,
                      GREATEST(d.seats - l.seats_used, 0) AS seats_left
               FROM departures d JOIN departure_load l ON l.htx_code = d.htx_code AND l.departure_id = d.id
               WHERE d.htx_code = %s AND d.tour_id = %s AND d.status IN ('OPEN', 'CLOSED') AND d.starts_at > now()
               ORDER BY d.starts_at LIMIT %s""", (htx, tour_id, limit)).fetchall()


def departure_of_tour(conn, htx: str, tour_id: UUID, departure_id: UUID) -> DepartureRow | None:
    """Any non-cancelled upcoming departure of the tour, whether or not it can still be booked."""
    return next((d for d in upcoming_departures(conn, htx, tour_id, 200) if d.id == departure_id), None)


def reviews(conn, htx: str, tour_id: UUID | None = None, limit: int = 6) -> list[ReviewRow]:
    with conn.cursor(row_factory=class_row(ReviewRow)) as cur:
        return cur.execute(
            """SELECT r.rating, r.comment, r.display_name, r.reply, r.created_at, d.starts_at AS trip_at,
                      t.title AS tour_title, t.slug AS tour_slug
               FROM reviews r
               JOIN bookings b ON b.id = r.booking_id AND b.htx_code = r.htx_code
               JOIN departures d ON d.id = b.departure_id AND d.htx_code = b.htx_code
               JOIN tours t ON t.id = r.tour_id AND t.htx_code = r.htx_code
               WHERE r.htx_code = %s AND r.status = 'PUBLISHED' AND t.status = 'PUBLISHED'
                 AND (%s::uuid IS NULL OR r.tour_id = %s::uuid)
               ORDER BY r.created_at DESC LIMIT %s""", (htx, tour_id, tour_id, limit)).fetchall()


def rating_of(conn, htx: str, tour_id: UUID) -> tuple[float | None, int]:
    row = conn.execute("SELECT avg(rating)::float, count(*) FROM reviews WHERE htx_code = %s AND tour_id = %s AND status = 'PUBLISHED'",
                       (htx, tour_id)).fetchone()
    return row[0], row[1]


def months_open(conn, htx: str) -> list[str]:
    """YYYY-MM of every month that has a bookable departure of a published tour (the month filter's choices)."""
    rows = conn.execute(
        """SELECT DISTINCT to_char(d.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS month
           FROM departures d JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code
           JOIN departure_load l ON l.htx_code = d.htx_code AND l.departure_id = d.id
           WHERE d.htx_code = %s AND t.status = 'PUBLISHED' AND d.status = 'OPEN' AND d.starts_at > now()
             AND d.seats > l.seats_used ORDER BY 1""", (htx,)).fetchall()
    return [row[0] for row in rows]


def departure_by_id(conn, htx: str, departure_id: UUID) -> DepartureRow | None:
    """One departure of the cooperative in any state (the price check of a confirmation needs it)."""
    with conn.cursor(row_factory=class_row(DepartureRow)) as cur:
        return cur.execute(
            """SELECT d.id, d.starts_at, d.seats, d.status, d.price_adult_vnd, d.price_child_vnd, d.guide_name,
                      GREATEST(d.seats - l.seats_used, 0) AS seats_left
               FROM departures d JOIN departure_load l ON l.htx_code = d.htx_code AND l.departure_id = d.id
               WHERE d.htx_code = %s AND d.id = %s""", (htx, departure_id)).fetchone()


def tour_of_departure(conn, htx: str, departure_id: UUID) -> Tour | None:
    """The PUBLISHED tour a departure belongs to; None for any other tour, so a draft cannot be booked."""
    with conn.cursor(row_factory=class_row(Tour)) as cur:
        return cur.execute(
            """SELECT t.id, t.slug, t.title, t.summary, t.description, t.category, t.duration_minutes, t.meeting_point,
                      t.map_url, t.price_adult_vnd, t.price_child_vnd, t.itinerary, t.includes, t.excludes, t.bring, t.faq
               FROM departures d JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code
               WHERE d.htx_code = %s AND d.id = %s AND t.status = 'PUBLISHED'""", (htx, departure_id)).fetchone()
