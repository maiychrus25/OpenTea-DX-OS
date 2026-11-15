# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Reads and plain inserts behind a guest's own pages: the trip of a booking, its review, the inquiry form.

State changes of a booking (create, pay, cancel, review) are in store.core; nothing here changes a booking.
"""
from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID

from psycopg.rows import class_row


@dataclass(frozen=True)
class Trip:
    """What a booking page and a ticket show about the tour and the departure of a booking."""
    tour_title: str
    tour_slug: str
    tour_status: str
    category: str
    meeting_point: str
    map_url: str | None
    duration_minutes: int
    cover_media_id: UUID | None
    guide_name: str | None
    departure_status: str
    departure_cancel_reason: str | None
    starts_at: datetime


@dataclass(frozen=True)
class MyReview:
    rating: int
    comment: str
    display_name: str
    status: str
    reply: str | None


def trip_of(conn, htx: str, departure_id: UUID) -> Trip | None:
    with conn.cursor(row_factory=class_row(Trip)) as cur:
        return cur.execute(
            """SELECT t.title AS tour_title, t.slug AS tour_slug, t.status AS tour_status, t.category, t.meeting_point,
                      t.map_url, t.duration_minutes,
                      COALESCE(t.cover_media_id, (SELECT tm.media_id FROM tour_media tm
                               WHERE tm.tour_id = t.id AND tm.htx_code = t.htx_code ORDER BY tm.position LIMIT 1)) AS cover_media_id,
                      d.guide_name, d.status AS departure_status, d.cancel_reason AS departure_cancel_reason, d.starts_at
               FROM departures d JOIN tours t ON t.id = d.tour_id AND t.htx_code = d.htx_code
               WHERE d.htx_code = %s AND d.id = %s""", (htx, departure_id)).fetchone()


def review_of(conn, htx: str, booking_id: UUID) -> MyReview | None:
    with conn.cursor(row_factory=class_row(MyReview)) as cur:
        return cur.execute("SELECT rating, comment, display_name, status, reply FROM reviews WHERE htx_code = %s AND booking_id = %s",
                           (htx, booking_id)).fetchone()


def add_inquiry(conn, htx: str, name: str, phone: str, group_size: int, desired_date: date | None, message: str) -> None:
    conn.execute("INSERT INTO inquiries (htx_code, name, phone, group_size, desired_date, message) VALUES (%s, %s, %s, %s, %s, %s)",
                 (htx, name, phone, group_size, desired_date, message))
