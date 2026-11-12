# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Sản phẩm và đơn hàng trong schema app_tea_shop. Mọi truy vấn lọc theo htx_code lấy từ token hoặc URL (spec §6.4)."""
import re
import secrets
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import psycopg
from psycopg.rows import class_row

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I, O, 0 or 1: read aloud over the phone
CODE_TRIES = 5
NEXT_STATUS = {"NEW": "CONFIRMED", "CONFIRMED": "SHIPPING", "SHIPPING": "DONE"}
CANCELLABLE = ("NEW", "CONFIRMED", "SHIPPING")


@dataclass(frozen=True)
class Product:
    id: UUID
    name: str
    pack: str
    price_vnd: int
    stock: int
    lot_code: str | None
    active: bool


@dataclass(frozen=True)
class Order:
    id: UUID
    code: str
    customer_name: str
    phone: str
    address: str
    note: str | None
    status: str
    total_vnd: int
    created_at: datetime


@dataclass(frozen=True)
class Item:
    product_name: str
    pack: str
    price_vnd: int
    quantity: int


@dataclass(frozen=True)
class Refusal:
    message: str


PRODUCT_COLUMNS = "id, name, pack, price_vnd, stock, lot_code, active"
ORDER_COLUMNS = "id, code, customer_name, phone, address, note, status, total_vnd, created_at"


def connect(url: str) -> psycopg.Connection:
    # Autocommit: each `with conn.transaction()` below is the whole transaction, and reads take no lock.
    return psycopg.connect(url, autocommit=True, options="-c search_path=app_tea_shop")


def normalize_phone(raw: str) -> str | None:
    phone = re.sub(r"[ .\-]", "", raw.strip())
    if phone.startswith("+84"):
        phone = "0" + phone[3:]
    return phone if re.fullmatch(r"0[0-9]{9}", phone) else None


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _all(conn, cls, sql: str, params: tuple) -> list:
    with conn.cursor(row_factory=class_row(cls)) as cur:
        return cur.execute(sql, params).fetchall()


def list_products(conn, htx_code: str, active_only: bool = False) -> list[Product]:
    return _all(conn, Product, f"SELECT {PRODUCT_COLUMNS} FROM products WHERE htx_code = %s "
                f"{'AND active' if active_only else ''} ORDER BY created_at, id", (htx_code,))


def get_product(conn, htx_code: str, product_id: UUID) -> Product | None:
    found = _all(conn, Product, f"SELECT {PRODUCT_COLUMNS} FROM products WHERE htx_code = %s AND id = %s",
                 (htx_code, product_id))
    return found[0] if found else None


def create_product(conn, htx_code: str, name: str, pack: str, price_vnd: int, stock: int, lot_code: str | None,
                   active: bool) -> UUID:
    return conn.execute("INSERT INTO products (htx_code, name, pack, price_vnd, stock, lot_code, active) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
                        (htx_code, name, pack, price_vnd, stock, lot_code, active)).fetchone()[0]


def edit_product(conn, htx_code: str, product_id: UUID, name: str, pack: str, price_vnd: int, lot_code: str | None,
                 active: bool, stock_delta: int) -> bool | Refusal | None:
    """True if saved, a Refusal if the delta would take stock below 0, None if the product is not in this HTX.

    Stock moves by a delta in the same UPDATE, so an order placed meanwhile is never overwritten.
    """
    params = {"name": name, "pack": pack, "price": price_vnd, "lot": lot_code, "active": active, "delta": stock_delta,
              "id": product_id, "htx": htx_code}
    with conn.transaction():
        if conn.execute("UPDATE products SET name = %(name)s, pack = %(pack)s, price_vnd = %(price)s, "
                        "lot_code = %(lot)s, active = %(active)s, stock = stock + %(delta)s "
                        "WHERE id = %(id)s AND htx_code = %(htx)s AND stock + %(delta)s >= 0 RETURNING id",
                        params).fetchone():
            return True
        row = conn.execute("SELECT stock FROM products WHERE id = %s AND htx_code = %s", (product_id, htx_code)).fetchone()
    return None if row is None else Refusal(f"Tồn kho hiện chỉ còn {row[0]}, không thể giảm {-stock_delta}.")


def list_orders(conn, htx_code: str) -> list[Order]:
    return _all(conn, Order, f"SELECT {ORDER_COLUMNS} FROM orders WHERE htx_code = %s "
                "ORDER BY created_at DESC LIMIT 200", (htx_code,))


def _items(conn, htx_code: str, order_id: UUID) -> list[Item]:
    return _all(conn, Item, "SELECT product_name, pack, price_vnd, quantity FROM order_items "
                "WHERE htx_code = %s AND order_id = %s ORDER BY product_name, id", (htx_code, order_id))


def get_order(conn, htx_code: str, order_id: UUID) -> tuple[Order, list[Item]] | None:
    found = _all(conn, Order, f"SELECT {ORDER_COLUMNS} FROM orders WHERE htx_code = %s AND id = %s",
                 (htx_code, order_id))
    return (found[0], _items(conn, htx_code, order_id)) if found else None


def lookup(conn, htx_code: str, code: str, phone: str) -> tuple[Order, list[Item]] | None:
    """A customer's own order: both the code and the phone must match, in that HTX."""
    found = _all(conn, Order, f"SELECT {ORDER_COLUMNS} FROM orders WHERE htx_code = %s AND code = %s AND phone = %s",
                 (htx_code, code, phone))
    return (found[0], _items(conn, htx_code, found[0].id)) if found else None


def advance_order(conn, htx_code: str, order_id: UUID) -> bool | None:
    """NEW → CONFIRMED → SHIPPING → DONE. True if moved, False if the order cannot move, None if not in this HTX."""
    with conn.transaction():
        row = conn.execute("SELECT status FROM orders WHERE id = %s AND htx_code = %s FOR UPDATE",
                           (order_id, htx_code)).fetchone()
        if row is None:
            return None
        if row[0] not in NEXT_STATUS:
            return False
        conn.execute("UPDATE orders SET status = %s WHERE id = %s AND htx_code = %s",
                     (NEXT_STATUS[row[0]], order_id, htx_code))
        return True


def cancel_order(conn, htx_code: str, order_id: UUID) -> bool | None:
    """Cancel an order that is not DONE or CANCELLED and give its packs back; same return values as advance_order."""
    with conn.transaction():
        row = conn.execute("SELECT status FROM orders WHERE id = %s AND htx_code = %s FOR UPDATE",
                           (order_id, htx_code)).fetchone()
        if row is None:
            return None
        if row[0] not in CANCELLABLE:
            return False
        # Same ascending id order as place_order, so a cancel and an order never wait on each other in a circle.
        conn.execute("SELECT 1 FROM products WHERE htx_code = %(htx)s AND id IN "
                     "(SELECT product_id FROM order_items WHERE order_id = %(id)s) ORDER BY id FOR UPDATE",
                     {"htx": htx_code, "id": order_id}).fetchall()
        conn.execute("UPDATE products p SET stock = p.stock + i.quantity FROM order_items i "
                     "WHERE i.order_id = %s AND i.htx_code = %s AND p.id = i.product_id AND p.htx_code = i.htx_code",
                     (order_id, htx_code))
        conn.execute("UPDATE orders SET status = 'CANCELLED' WHERE id = %s AND htx_code = %s", (order_id, htx_code))
        return True


def place_order(conn, htx_code: str, lines: list[tuple[UUID, int]], customer_name: str, phone: str, address: str,
                note: str | None) -> Order | Refusal:
    """Take the packs and store the order in one transaction.

    Products are locked FOR UPDATE in ascending id order whatever order the customer listed them in, so two
    orders for the same products never wait on each other in a circle, and stock is never oversold.
    """
    wanted: dict[UUID, int] = {}
    for product_id, quantity in lines:
        if quantity > 0:
            wanted[product_id] = wanted.get(product_id, 0) + quantity
    if not wanted:
        return Refusal("Chọn ít nhất một sản phẩm.")
    with conn.transaction():
        with conn.cursor(row_factory=class_row(Product)) as cur:
            products = {p.id: p for p in cur.execute(
                f"SELECT {PRODUCT_COLUMNS} FROM products WHERE htx_code = %s AND id = ANY(%s) ORDER BY id FOR UPDATE",
                (htx_code, list(wanted))).fetchall()}
        if len(products) != len(wanted) or not all(p.active for p in products.values()):
            return Refusal("Có sản phẩm không còn bán. Vui lòng tải lại trang và chọn lại.")
        for product_id in sorted(wanted):
            product = products[product_id]
            if wanted[product_id] > product.stock:
                return Refusal(f"Sản phẩm {product.name} chỉ còn {product.stock}.")
        total = sum(products[i].price_vnd * q for i, q in wanted.items())
        placed = _insert_order(conn, htx_code, customer_name, phone, address, note, total)
        for product_id in sorted(wanted):
            product = products[product_id]
            conn.execute("UPDATE products SET stock = stock - %s WHERE id = %s AND htx_code = %s",
                         (wanted[product_id], product_id, htx_code))
            conn.execute("INSERT INTO order_items (htx_code, order_id, product_id, product_name, pack, price_vnd, "
                         "quantity) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                         (htx_code, placed.id, product_id, product.name, product.pack, product.price_vnd,
                          wanted[product_id]))
        return placed


def _insert_order(conn, htx_code, customer_name, phone, address, note, total) -> Order:
    for attempt in range(CODE_TRIES):
        try:
            with conn.transaction(), conn.cursor(row_factory=class_row(Order)) as cur:  # a savepoint
                return cur.execute(
                    f"""INSERT INTO orders (htx_code, code, customer_name, phone, address, note, total_vnd)
                        VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING {ORDER_COLUMNS}""",
                    (htx_code, new_code(), customer_name, phone, address, note, total)).fetchone()
        except psycopg.errors.UniqueViolation:
            if attempt == CODE_TRIES - 1:
                raise
    raise AssertionError("unreachable")
