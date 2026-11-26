# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Nhập, xuất phân bón trong schema app_gen_fertiliser_stock. Mọi truy vấn lọc theo htx_code."""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

import psycopg
from psycopg.rows import class_row


@dataclass(frozen=True)
class StockLine:
    product: str
    in_kg: Decimal
    out_kg: Decimal
    stock_kg: Decimal


@dataclass(frozen=True)
class Movement:
    id: int
    product: str
    kind: str
    quantity_kg: Decimal
    note: str
    created_at: datetime


def connect(url: str) -> psycopg.Connection:
    return psycopg.connect(url, autocommit=True, options="-c search_path=app_gen_fertiliser_stock")


def stock(conn, htx_code: str) -> list[StockLine]:
    with conn.cursor(row_factory=class_row(StockLine)) as cur:
        return cur.execute(
            """SELECT product,
                      COALESCE(sum(quantity_kg) FILTER (WHERE kind = 'in'), 0) AS in_kg,
                      COALESCE(sum(quantity_kg) FILTER (WHERE kind = 'out'), 0) AS out_kg,
                      COALESCE(sum(CASE kind WHEN 'in' THEN quantity_kg ELSE -quantity_kg END), 0) AS stock_kg
               FROM movements WHERE htx_code = %s GROUP BY product ORDER BY product""", (htx_code,)).fetchall()


def stock_of(conn, htx_code: str, product: str) -> Decimal:
    row = conn.execute("SELECT COALESCE(sum(CASE kind WHEN 'in' THEN quantity_kg ELSE -quantity_kg END), 0) "
                       "FROM movements WHERE htx_code = %s AND product = %s", (htx_code, product)).fetchone()
    return row[0]


def count_movements(conn, htx_code: str) -> int:
    return conn.execute("SELECT count(*) FROM movements WHERE htx_code = %s", (htx_code,)).fetchone()[0]


def list_movements(conn, htx_code: str, limit: int, offset: int) -> list[Movement]:
    with conn.cursor(row_factory=class_row(Movement)) as cur:
        return cur.execute(
            """SELECT id, product, kind, quantity_kg, note, created_at FROM movements WHERE htx_code = %s
               ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s""", (htx_code, limit, offset)).fetchall()


def add_movement(conn, htx_code: str, product: str, kind: str, quantity_kg: Decimal, note: str, created_by: str) -> None:
    conn.execute("INSERT INTO movements (htx_code, product, kind, quantity_kg, note, created_by) VALUES (%s, %s, %s, %s, %s, %s)",
                 (htx_code, product, kind, quantity_kg, note, created_by))
