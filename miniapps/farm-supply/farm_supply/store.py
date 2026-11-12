# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Đợt mua chung, mặt hàng, đăng ký và đối soát trong schema app_farm_supply. Mọi truy vấn lọc theo htx_code."""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

import psycopg
from psycopg.rows import class_row


class Refusal(Enum):
    NOT_FOUND = "Không tìm thấy."
    CLOSED = "Đợt đăng ký đã đóng."
    HAS_REQUESTS = "Mặt hàng đã có hộ đăng ký nên không sửa được."
    NOT_CLOSED = "Chỉ đánh dấu giao hàng và thanh toán sau khi đóng đợt."
    NO_REGISTRATION = "Hộ này không có đăng ký trong đợt."

    @property
    def message(self) -> str:
        return self.value


@dataclass(frozen=True)
class Round:
    id: UUID
    title: str
    deadline: datetime
    status: str
    accepting: bool  # OPEN and before the deadline: the only time a household may write


@dataclass(frozen=True)
class ItemLine:
    id: UUID
    name: str
    unit: str
    price_vnd: int
    request_count: int
    total_quantity: Decimal
    amount_vnd: int


@dataclass(frozen=True)
class HouseholdLine:
    household_id: str
    household_name: str
    amount_vnd: int
    delivered_at: datetime | None
    paid_at: datetime | None


@dataclass(frozen=True)
class MyItem:
    round_id: UUID
    item_id: UUID
    name: str
    unit: str
    price_vnd: int
    quantity: Decimal | None


@dataclass(frozen=True)
class MyHistory:
    round_id: UUID
    title: str
    status: str
    amount_vnd: int
    delivered_at: datetime | None
    paid_at: datetime | None


ROUND_COLUMNS = "id, title, deadline, status, (status = 'OPEN' AND deadline > now()) AS accepting"
MARKS = {"delivered": "delivered_at", "paid": "paid_at"}


def connect(url: str) -> psycopg.Connection:
    # Autocommit: each `with conn.transaction()` below is the whole transaction, and reads take no lock.
    return psycopg.connect(url, autocommit=True, options="-c search_path=app_farm_supply")


def _all(conn, cls, sql: str, params) -> list:
    with conn.cursor(row_factory=class_row(cls)) as cur:
        return cur.execute(sql, params).fetchall()


def list_rounds(conn, htx_code: str) -> list[Round]:
    return _all(conn, Round, f"SELECT {ROUND_COLUMNS} FROM rounds WHERE htx_code = %s ORDER BY created_at DESC", (htx_code,))


def get_round(conn, htx_code: str, round_id: UUID) -> Round | None:
    found = _all(conn, Round, f"SELECT {ROUND_COLUMNS} FROM rounds WHERE htx_code = %s AND id = %s", (htx_code, round_id))
    return found[0] if found else None


def create_round(conn, htx_code: str, title: str, deadline: datetime) -> UUID:
    return conn.execute("INSERT INTO rounds (htx_code, title, deadline) VALUES (%s, %s, %s) RETURNING id",
                        (htx_code, title, deadline)).fetchone()[0]


def item_lines(conn, htx_code: str, round_id: UUID) -> list[ItemLine]:
    """Items with what households asked for; the amount of a request is round(quantity * price), in whole VND."""
    return _all(conn, ItemLine, """
        SELECT i.id, i.name, i.unit, i.price_vnd, count(r.id)::int AS request_count,
               COALESCE(sum(r.quantity), 0) AS total_quantity,
               COALESCE(sum(round(r.quantity * i.price_vnd)), 0)::bigint AS amount_vnd
        FROM items i LEFT JOIN requests r ON r.item_id = i.id AND r.htx_code = i.htx_code
        WHERE i.htx_code = %s AND i.round_id = %s
        GROUP BY i.id ORDER BY i.name, i.id""", (htx_code, round_id))


def household_summary(conn, htx_code: str, round_id: UUID) -> list[HouseholdLine]:
    return _all(conn, HouseholdLine, """
        SELECT r.household_id, max(r.household_name) AS household_name,
               sum(round(r.quantity * i.price_vnd))::bigint AS amount_vnd, s.delivered_at, s.paid_at
        FROM requests r JOIN items i ON i.id = r.item_id AND i.htx_code = r.htx_code
        LEFT JOIN settlements s ON s.round_id = r.round_id AND s.household_id = r.household_id AND s.htx_code = r.htx_code
        WHERE r.htx_code = %s AND r.round_id = %s
        GROUP BY r.household_id, s.delivered_at, s.paid_at ORDER BY household_name, r.household_id""",
                (htx_code, round_id))


def add_item(conn, htx_code: str, round_id: UUID, name: str, unit: str, price_vnd: int) -> Refusal | None:
    # FOR SHARE: a close committing meanwhile is waited for and its status rechecked.
    with conn.transaction():
        row = conn.execute("SELECT status = 'OPEN' FROM rounds WHERE id = %s AND htx_code = %s FOR SHARE",
                           (round_id, htx_code)).fetchone()
        if row is None:
            return Refusal.NOT_FOUND
        if not row[0]:
            return Refusal.CLOSED
        conn.execute("INSERT INTO items (htx_code, round_id, name, unit, price_vnd) VALUES (%s, %s, %s, %s, %s)",
                     (htx_code, round_id, name, unit, price_vnd))
    return None


def edit_item(conn, htx_code: str, item_id: UUID, name: str, unit: str, price_vnd: int) -> tuple[UUID | None, Refusal | None]:
    """Returns (round id, refusal). The round row lock makes a concurrent register wait, so no request slips in unseen."""
    with conn.transaction():
        row = conn.execute("SELECT round_id FROM items WHERE id = %s AND htx_code = %s", (item_id, htx_code)).fetchone()
        if row is None:
            return None, Refusal.NOT_FOUND
        round_id = row[0]
        conn.execute("SELECT 1 FROM rounds WHERE id = %s AND htx_code = %s FOR UPDATE", (round_id, htx_code))
        if conn.execute("SELECT 1 FROM requests WHERE item_id = %s AND htx_code = %s", (item_id, htx_code)).fetchone():
            return round_id, Refusal.HAS_REQUESTS
        conn.execute("UPDATE items SET name = %s, unit = %s, price_vnd = %s WHERE id = %s AND htx_code = %s",
                     (name, unit, price_vnd, item_id, htx_code))
    return round_id, None


def register(conn, htx_code: str, round_id: UUID, household_id: str, household_name: str,
             quantities: dict[UUID, Decimal]) -> Refusal | None:
    """Set a household's quantity per item (0 removes it); the status check and the writes share one transaction."""
    with conn.transaction():
        row = conn.execute("SELECT status = 'OPEN' AND deadline > now() FROM rounds WHERE id = %s AND htx_code = %s "
                           "FOR SHARE", (round_id, htx_code)).fetchone()
        if row is None:
            return Refusal.NOT_FOUND
        if not row[0]:
            return Refusal.CLOSED
        valid = {r[0] for r in conn.execute("SELECT id FROM items WHERE round_id = %s AND htx_code = %s",
                                            (round_id, htx_code))}
        for item_id, quantity in quantities.items():
            if item_id not in valid:
                continue  # an item of another round or HTX is ignored, never written
            if quantity > 0:
                conn.execute(
                    """INSERT INTO requests (htx_code, round_id, item_id, household_id, household_name, quantity)
                       VALUES (%s, %s, %s, %s, %s, %s)
                       ON CONFLICT (item_id, household_id)
                       DO UPDATE SET quantity = EXCLUDED.quantity, household_name = EXCLUDED.household_name""",
                    (htx_code, round_id, item_id, household_id, household_name, quantity))
            else:
                conn.execute("DELETE FROM requests WHERE item_id = %s AND household_id = %s AND htx_code = %s",
                             (item_id, household_id, htx_code))
    return None


def close_round(conn, htx_code: str, round_id: UUID) -> bool:
    """One-way. Creates the settlement row of every household that registered; False when the round is not in this HTX."""
    with conn.transaction():
        # The row update waits for in-flight registers (FOR SHARE) and later ones see CLOSED.
        closed = conn.execute("UPDATE rounds SET status = 'CLOSED' WHERE id = %s AND htx_code = %s AND status = 'OPEN' "
                              "RETURNING id", (round_id, htx_code)).fetchone()
        if closed:
            conn.execute("INSERT INTO settlements (htx_code, round_id, household_id) "
                         "SELECT DISTINCT htx_code, round_id, household_id FROM requests "
                         "WHERE round_id = %s AND htx_code = %s", (round_id, htx_code))
        return bool(closed) or conn.execute("SELECT 1 FROM rounds WHERE id = %s AND htx_code = %s",
                                            (round_id, htx_code)).fetchone() is not None


def mark(conn, htx_code: str, round_id: UUID, household_id: str, kind: str) -> Refusal | None:
    column = MARKS[kind]
    with conn.transaction():
        row = conn.execute("SELECT status FROM rounds WHERE id = %s AND htx_code = %s FOR SHARE",
                           (round_id, htx_code)).fetchone()
        if row is None:
            return Refusal.NOT_FOUND
        if row[0] != "CLOSED":
            return Refusal.NOT_CLOSED
        done = conn.execute(f"UPDATE settlements SET {column} = COALESCE({column}, now()) "
                            "WHERE round_id = %s AND htx_code = %s AND household_id = %s RETURNING id",
                            (round_id, htx_code, household_id)).fetchone()
    return None if done else Refusal.NO_REGISTRATION


def open_rounds(conn, htx_code: str) -> list[Round]:
    return _all(conn, Round, f"SELECT {ROUND_COLUMNS} FROM rounds WHERE htx_code = %s AND status = 'OPEN' "
                             "AND deadline > now() ORDER BY deadline", (htx_code,))


def my_items(conn, htx_code: str, household_id: str) -> list[MyItem]:
    """Items of the rounds still taking registrations, with this household's quantity."""
    return _all(conn, MyItem, """
        SELECT i.round_id, i.id AS item_id, i.name, i.unit, i.price_vnd, r.quantity
        FROM rounds o JOIN items i ON i.round_id = o.id AND i.htx_code = o.htx_code
        LEFT JOIN requests r ON r.item_id = i.id AND r.htx_code = i.htx_code AND r.household_id = %s
        WHERE o.htx_code = %s AND o.status = 'OPEN' AND o.deadline > now() ORDER BY i.name, i.id""",
                (household_id, htx_code))


def my_history(conn, htx_code: str, household_id: str) -> list[MyHistory]:
    """Rounds no longer taking registrations in which this household asked for something."""
    return _all(conn, MyHistory, """
        SELECT o.id AS round_id, o.title, o.status, sum(round(r.quantity * i.price_vnd))::bigint AS amount_vnd,
               s.delivered_at, s.paid_at
        FROM rounds o JOIN requests r ON r.round_id = o.id AND r.htx_code = o.htx_code AND r.household_id = %s
        JOIN items i ON i.id = r.item_id AND i.htx_code = r.htx_code
        LEFT JOIN settlements s ON s.round_id = o.id AND s.household_id = r.household_id AND s.htx_code = o.htx_code
        WHERE o.htx_code = %s AND NOT (o.status = 'OPEN' AND o.deadline > now())
        GROUP BY o.id, s.delivered_at, s.paid_at ORDER BY o.deadline DESC""", (household_id, htx_code))
