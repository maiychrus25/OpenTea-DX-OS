# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Row factories for every table. Each takes a connection first, inserts one valid row and returns its id.

Pass any column as a keyword to override a default (columns are written as given, so a test can build a row the
core would never create, such as an expired hold). Every factory defaults to cooperative TC.
"""
import base64
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from tea_tour.domain.text import slugify

HTX = "TC"
NOW = datetime.now(timezone.utc)
LATER = NOW + timedelta(days=7)
EARLIER = NOW - timedelta(days=7)
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def bearer(sub="kc-manager-tc", htx="TC", roles=("manager",), name="Quản trị TC") -> dict:
    claims = {"sub": sub, "name": name, "htx_code": htx, "realm_access": {"roles": list(roles)}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return {"Authorization": f"Bearer h.{payload}.s"}


def _insert(conn, table: str, values: dict, returning: str = "id"):
    columns = ", ".join(values)
    marks = ", ".join(["%s"] * len(values))
    row = conn.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks}) RETURNING {returning}",
                       [_adapt(v) for v in values.values()]).fetchone()
    return row[0]


def _adapt(value):
    from psycopg.types.json import Jsonb
    return Jsonb(value) if isinstance(value, (list, dict)) else value


def random_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


@lru_cache(maxsize=1)
def sample_image() -> tuple[bytes, bytes, int, int]:
    """(large, thumb, width, height) of a small gradient JPEG, made once with the production image code."""
    from PIL import Image

    from tea_tour import media
    image = Image.linear_gradient("L").resize((320, 240)).convert("RGB")
    import io
    buffer = io.BytesIO()
    image.save(buffer, "JPEG")
    processed = media.process_image(buffer.getvalue())
    return processed.large, processed.thumb, processed.width, processed.height


def add_settings(conn, htx=HTX, **fields):
    values = {"htx_code": htx, **fields}
    conn.execute(f"INSERT INTO settings ({', '.join(values)}) VALUES ({', '.join(['%s'] * len(values))}) "
                 f"ON CONFLICT (htx_code) DO UPDATE SET " + ", ".join(f"{k} = EXCLUDED.{k}" for k in values),
                 list(values.values()))
    return htx


def add_media(conn, htx=HTX, **fields):
    large, thumb, width, height = sample_image()
    return _insert(conn, "media", {"htx_code": htx, "width": width, "height": height, "large": large, "thumb": thumb,
                                   "created_by": "Quản trị", **fields})


def add_tour(conn, htx=HTX, title="Một ngày làm người hái chè", status="PUBLISHED", **fields):
    values = {"htx_code": htx, "title": title, "slug": f"{slugify(title)}-{uuid.uuid4().hex[:6]}", "status": status,
              "meeting_point": "Nhà văn hoá xóm Hồng Thái", "description": "Hái chè và thưởng trà trên đồi.",
              "summary": "Một buổi sáng trên đồi chè.", "category": "PICKING", "duration_minutes": 180,
              "price_adult_vnd": 250_000, "price_child_vnd": 150_000, "default_seats": 10, **fields}
    return _insert(conn, "tours", values)


def add_tour_media(conn, tour_id, media_id, position=0, htx=HTX):
    conn.execute("INSERT INTO tour_media (htx_code, tour_id, media_id, position) VALUES (%s, %s, %s, %s)",
                 (htx, tour_id, media_id, position))
    return media_id


def add_departure(conn, tour_id, htx=HTX, starts_at=LATER, seats=10, **fields):
    values = {"htx_code": htx, "tour_id": tour_id, "starts_at": starts_at, "seats": seats,
              "price_adult_vnd": 250_000, "price_child_vnd": 150_000, "status": "OPEN", **fields}
    return _insert(conn, "departures", values)


def add_booking(conn, departure_id, htx=HTX, adults=1, children=0, status="PENDING", **fields):
    values = {"htx_code": htx, "departure_id": departure_id, "code": random_code(), "guest_name": "Nguyễn Văn Khách",
              "phone": "0912345678", "adults": adults, "children": children, "price_adult_vnd": 250_000,
              "price_child_vnd": 150_000, "deposit_vnd": 0, "paid_vnd": 0, "status": status, "source": "WEB",
              "request_key": secrets.token_urlsafe(16), "access_key": secrets.token_urlsafe(16), **fields}
    values.setdefault("total_vnd", adults * values["price_adult_vnd"] + children * values["price_child_vnd"])
    return _insert(conn, "bookings", values)


def add_payment(conn, booking_id, amount_vnd=100_000, htx=HTX, method="TRANSFER", sync=True, **fields):
    """A ledger line; with sync (default) bookings.paid_vnd follows, as the core keeps it."""
    values = {"htx_code": htx, "booking_id": booking_id, "amount_vnd": amount_vnd, "method": method,
              "recorded_by_id": "kc-manager-tc", "recorded_by_name": "Quản trị TC", **fields}
    payment_id = _insert(conn, "payments", values)
    if sync:
        conn.execute("UPDATE bookings SET paid_vnd = paid_vnd + %s WHERE id = %s AND htx_code = %s",
                     (amount_vnd, booking_id, htx))
    return payment_id


def add_event(conn, booking_id, htx=HTX, kind="CREATED", actor_kind="GUEST", **fields):
    values = {"htx_code": htx, "booking_id": booking_id, "kind": kind, "actor_kind": actor_kind,
              "actor_name": "Khách", "detail": "", **fields}
    return _insert(conn, "booking_events", values)


def add_review(conn, booking_id, tour_id, htx=HTX, rating=5, status="PUBLISHED", **fields):
    values = {"htx_code": htx, "booking_id": booking_id, "tour_id": tour_id, "rating": rating, "status": status,
              "comment": "Đồi chè rất đẹp.", "display_name": "Khách", **fields}
    return _insert(conn, "reviews", values)


def add_inquiry(conn, htx=HTX, **fields):
    values = {"htx_code": htx, "name": "Cô giáo Lan", "phone": "0987654321", "group_size": 30,
              "message": "Đoàn học sinh lớp 5.", **fields}
    return _insert(conn, "inquiries", values)
