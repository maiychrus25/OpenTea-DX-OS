# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Sản phẩm và đơn hàng trong schema app_tea_shop. Mọi truy vấn lọc theo htx_code lấy từ token hoặc URL (spec §6.4)."""
import re
import secrets
from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID

import psycopg
from psycopg.rows import class_row

from tea_shop.appkit import Page, like_pattern, page_of

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I, O, 0 or 1: read aloud over the phone
CODE_TRIES = 5
NEXT_STATUS = {"NEW": "CONFIRMED", "CONFIRMED": "SHIPPING", "SHIPPING": "DONE"}
CANCELLABLE = ("NEW", "CONFIRMED", "SHIPPING")
LOW_STOCK = 5  # an active product with this many packs or fewer is "sắp hết"
VN_DAY = "(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date"
# Start of the current month in Vietnam time, as a timestamptz.
VN_TODAY = "(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date"
SUGGEST_MIN_STOCK = 20  # suggest a promotion for an active product with at least this many packs...
SUGGEST_QUIET_DAYS = 21  # ...and no order line (cancelled orders left out) in this many days
SUGGEST_LIMIT = 10
PRODUCT_MISSING = "Không tìm thấy sản phẩm."
PROMOTION_OVERLAP = "Sản phẩm đang có khuyến mãi."
MONTH_START = "date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'"


@dataclass(frozen=True)
class Product:
    id: UUID
    name: str
    pack: str
    price_vnd: int
    stock: int
    lot_code: str | None
    active: bool
    discount_pct: int  # of the promotion that applies today, else 0

    @property
    def sale_price_vnd(self) -> int:
        return (self.price_vnd * (100 - self.discount_pct) + 50) // 100  # half up, whole đồng


@dataclass(frozen=True)
class Promotion:
    id: UUID
    product_id: UUID
    discount_pct: int
    starts_on: date
    ends_on: date


@dataclass(frozen=True)
class PromotionRow:
    id: UUID
    product_name: str
    discount_pct: int
    starts_on: date
    ends_on: date
    state: str  # active, ended (by a manager) or over (ends_on has passed)


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


ORDER_STATUSES = ("NEW", "CONFIRMED", "SHIPPING", "DONE", "CANCELLED")
# The percent of the promotion running today (at most one, see create_promotion), 0 when there is none.
PRODUCT_COLUMNS = (
    "id, name, pack, price_vnd, stock, lot_code, active, COALESCE((SELECT max(pr.discount_pct) FROM promotions pr "
    "WHERE pr.product_id = products.id AND pr.htx_code = products.htx_code AND pr.ended_at IS NULL "
    f"AND {VN_TODAY} BETWEEN pr.starts_on AND pr.ends_on), 0) AS discount_pct")
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


def _paged(conn, cls, columns: str, table: str, clause: str, params: list, page_raw: str | None, size: int | None):
    """(rows, Page) newest first; the page number is clamped to a page that exists; size None = every row."""
    total = conn.execute(f"SELECT count(*) FROM {table} WHERE {clause}", params).fetchone()[0]
    page = page_of(page_raw, total, size) if size else Page(1, max(total, 1), total)
    rows = _all(conn, cls, f"SELECT {columns} FROM {table} WHERE {clause} ORDER BY created_at DESC, id LIMIT %s OFFSET %s",
                (*params, size, page.offset))
    return rows, page


def search_products(conn, htx_code: str, q: str = "", show: str = "all", page_raw: str | None = None,
                    size: int | None = 25) -> tuple[list[Product], Page]:
    """show: all, active, hidden or low (active with LOW_STOCK packs or fewer)."""
    where, params = ["htx_code = %s"], [htx_code]
    if q:
        where.append("name ILIKE %s ESCAPE '\\'")
        params.append(like_pattern(q))
    where.extend({"active": ["active"], "hidden": ["NOT active"], "low": ["active", "stock <= %s"]}.get(show, []))
    if show == "low":
        params.append(LOW_STOCK)
    return _paged(conn, Product, PRODUCT_COLUMNS, "products", " AND ".join(where), params, page_raw, size)


def search_orders(conn, htx_code: str, status: str = "all", date_from: date | None = None, date_to: date | None = None,
                  q: str = "", page_raw: str | None = None, size: int | None = 25) -> tuple[list[Order], Page]:
    """q matches code, customer name or phone as text."""
    where, params = ["htx_code = %s"], [htx_code]
    if status in ORDER_STATUSES:
        where.append("status = %s")
        params.append(status)
    if date_from:
        where.append(f"{VN_DAY} >= %s")
        params.append(date_from)
    if date_to:
        where.append(f"{VN_DAY} <= %s")
        params.append(date_to)
    if q:
        where.append("(code ILIKE %s ESCAPE '\\' OR customer_name ILIKE %s ESCAPE '\\' OR phone ILIKE %s ESCAPE '\\')")
        params.extend([like_pattern(q)] * 3)
    return _paged(conn, Order, ORDER_COLUMNS, "orders", " AND ".join(where), params, page_raw, size)


@dataclass(frozen=True)
class Overview:
    waiting: int
    shipping: int
    month_revenue: int
    low_stock: int
    daily_revenue: list[tuple[date, int]]  # the last 14 days, oldest first, completed orders by day placed
    top_products: list[tuple[str, int]]  # this month, by packs sold, cancelled orders left out


def overview(conn, htx_code: str) -> Overview:
    waiting, shipping, revenue = conn.execute(
        f"SELECT count(*) FILTER (WHERE status = 'NEW'), count(*) FILTER (WHERE status = 'SHIPPING'), "
        f"COALESCE(sum(total_vnd) FILTER (WHERE status = 'DONE' AND created_at >= {MONTH_START}), 0) "
        "FROM orders WHERE htx_code = %s", (htx_code,)).fetchone()
    low = conn.execute("SELECT count(*) FROM products WHERE htx_code = %s AND active AND stock <= %s",
                       (htx_code, LOW_STOCK)).fetchone()[0]
    daily = conn.execute(
        f"SELECT d, COALESCE(sum(o.total_vnd), 0) FROM (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - g AS d "
        f"FROM generate_series(0, 13) g) days LEFT JOIN orders o ON o.htx_code = %s AND o.status = 'DONE' "
        f"AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = days.d GROUP BY d ORDER BY d", (htx_code,)).fetchall()
    top = conn.execute(
        f"SELECT i.product_name, sum(i.quantity) AS sold FROM order_items i JOIN orders o "
        f"ON o.id = i.order_id AND o.htx_code = i.htx_code WHERE i.htx_code = %s AND o.status <> 'CANCELLED' "
        f"AND o.created_at >= {MONTH_START} GROUP BY i.product_name ORDER BY sold DESC, i.product_name LIMIT 5",
        (htx_code,)).fetchall()
    return Overview(waiting, shipping, int(revenue), low, [(d, int(v)) for d, v in daily], [(n, int(q)) for n, q in top])


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
        total = sum(products[i].sale_price_vnd * q for i, q in wanted.items())
        placed = _insert_order(conn, htx_code, customer_name, phone, address, note, total)
        for product_id in sorted(wanted):
            product = products[product_id]
            conn.execute("UPDATE products SET stock = stock - %s WHERE id = %s AND htx_code = %s",
                         (wanted[product_id], product_id, htx_code))
            conn.execute("INSERT INTO order_items (htx_code, order_id, product_id, product_name, pack, price_vnd, "
                         "quantity) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                         (htx_code, placed.id, product_id, product.name, product.pack, product.sale_price_vnd,
                          wanted[product_id]))
        return placed


def create_promotion(conn, htx_code: str, product_id: UUID, discount_pct: int, days: int,
                     created_by: str) -> Promotion | Refusal:
    """A promotion from today for `days` days, both ends included. Refused when the product is not in this HTX or a
    promotion is already running on it. The product row lock makes two creations on one product take turns."""
    with conn.transaction():
        if conn.execute("SELECT 1 FROM products WHERE id = %s AND htx_code = %s FOR UPDATE",
                        (product_id, htx_code)).fetchone() is None:
            return Refusal(PRODUCT_MISSING)
        if conn.execute(f"SELECT 1 FROM promotions WHERE product_id = %s AND htx_code = %s AND ended_at IS NULL "
                        f"AND ends_on >= {VN_TODAY}", (product_id, htx_code)).fetchone():
            return Refusal(PROMOTION_OVERLAP)
        with conn.cursor(row_factory=class_row(Promotion)) as cur:
            return cur.execute(
                f"INSERT INTO promotions (htx_code, product_id, discount_pct, starts_on, ends_on, created_by) "
                f"VALUES (%s, %s, %s, {VN_TODAY}, {VN_TODAY} + %s, %s) "
                "RETURNING id, product_id, discount_pct, starts_on, ends_on",
                (htx_code, product_id, discount_pct, days - 1, created_by)).fetchone()


def end_promotion(conn, htx_code: str, promotion_id: UUID) -> bool | None:
    """True if ended now, False if it was already over, None if not in this HTX."""
    if conn.execute(f"UPDATE promotions SET ended_at = now() WHERE id = %s AND htx_code = %s AND ended_at IS NULL "
                    f"AND ends_on >= {VN_TODAY} RETURNING id", (promotion_id, htx_code)).fetchone():
        return True
    return False if conn.execute("SELECT 1 FROM promotions WHERE id = %s AND htx_code = %s",
                                 (promotion_id, htx_code)).fetchone() else None


def list_promotions(conn, htx_code: str) -> list[PromotionRow]:
    """Newest first, at most 100 rows (shortcut: no paging, the page links to nothing older)."""
    return _all(conn, PromotionRow,
                f"SELECT pr.id, p.name AS product_name, pr.discount_pct, pr.starts_on, pr.ends_on, "
                f"CASE WHEN pr.ended_at IS NOT NULL THEN 'ended' WHEN pr.ends_on < {VN_TODAY} THEN 'over' "
                f"ELSE 'active' END AS state FROM promotions pr JOIN products p "
                f"ON p.id = pr.product_id AND p.htx_code = pr.htx_code WHERE pr.htx_code = %s "
                f"ORDER BY pr.created_at DESC, pr.id LIMIT 100", (htx_code,))


def stale_stock_products(conn, htx_code: str) -> list[Product]:
    """Active products with plenty of stock, no order line lately and no promotion today: the agent suggests a sale."""
    return _all(conn, Product,
                f"SELECT {PRODUCT_COLUMNS} FROM products WHERE htx_code = %s AND active AND stock >= %s "
                f"AND NOT EXISTS (SELECT 1 FROM order_items i JOIN orders o ON o.id = i.order_id AND o.htx_code = i.htx_code "
                f"WHERE i.product_id = products.id AND i.htx_code = products.htx_code AND o.status <> 'CANCELLED' "
                f"AND o.created_at >= now() - make_interval(days => %s)) "
                f"AND NOT EXISTS (SELECT 1 FROM promotions pr WHERE pr.product_id = products.id "
                f"AND pr.htx_code = products.htx_code AND pr.ended_at IS NULL AND pr.ends_on >= {VN_TODAY}) "
                f"ORDER BY stock DESC, id LIMIT %s", (htx_code, SUGGEST_MIN_STOCK, SUGGEST_QUIET_DAYS, SUGGEST_LIMIT))


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
