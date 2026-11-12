# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import re
import threading
import uuid

from conftest import add_product

from tea_shop import store
from tea_shop.store import Order, Refusal, normalize_phone


def order(conn, lines, htx="TC", name="Khách", phone="0912345678", address="1 Đường Chè", note=None):
    return store.place_order(conn, htx, lines, name, phone, address, note)


def stock_of(conn, product_id):
    return conn.execute("SELECT stock FROM products WHERE id = %s", (product_id,)).fetchone()[0]


def test_twenty_concurrent_orders_take_five_packs_exactly(db, pg_url):
    """Twenty customers race for 5 packs; the product row lock lets exactly 5 orders through."""
    product = add_product(db, stock=5)
    start = threading.Barrier(20)
    results = []

    def customer(n):
        # One connection each, so the race is real; as the superuser because the app role allows 10 connections.
        with store.connect(pg_url) as conn:
            start.wait()
            results.append(order(conn, [(product, 1)], name=f"Khách {n}"))

    threads = [threading.Thread(target=customer, args=(n,)) for n in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sum(isinstance(r, Order) for r in results) == 5
    assert sum(isinstance(r, Refusal) for r in results) == 15
    assert stock_of(db, product) == 0
    assert db.execute("SELECT count(*), sum(quantity) FROM order_items").fetchone() == (5, 5)
    assert len({r.code for r in results if isinstance(r, Order)}) == 5


def test_opposite_order_two_products_does_not_deadlock(db, pg_url):
    """10 orders take A then B, 10 take B then A: locks are always taken in ascending id order, so all finish."""
    first, second = add_product(db, name="A", stock=100), add_product(db, name="B", stock=100)
    start = threading.Barrier(20)
    results = []

    def customer(n):
        lines = [(first, 1), (second, 1)] if n % 2 else [(second, 1), (first, 1)]
        with store.connect(pg_url) as conn:
            start.wait()
            try:
                results.append(order(conn, lines))
            except Exception as exc:  # a deadlock would show up here
                results.append(exc)

    threads = [threading.Thread(target=customer, args=(n,), daemon=True) for n in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(10)
    assert not any(thread.is_alive() for thread in threads), "orders are stuck: deadlock"
    assert [r for r in results if not isinstance(r, Order)] == []
    assert stock_of(db, first) == 80 and stock_of(db, second) == 80


def test_order_copies_name_pack_and_price(db):
    product = add_product(db, name="Chè Shan tuyết", pack="Gói 200g", price_vnd=150000, stock=10)
    placed = order(db, [(product, 2)])
    assert isinstance(placed, Order) and placed.total_vnd == 300000 and placed.status == "NEW"
    assert stock_of(db, product) == 8
    db.execute("UPDATE products SET name = 'Tên mới', pack = 'Hộp 1kg', price_vnd = 1 WHERE id = %s", (product,))
    _, items = store.get_order(db, "TC", placed.id)
    assert [(i.product_name, i.pack, i.price_vnd, i.quantity) for i in items] == [("Chè Shan tuyết", "Gói 200g", 150000, 2)]


def test_cancel_restores_stock(db):
    product = add_product(db, stock=10)
    placed = order(db, [(product, 4)])
    assert stock_of(db, product) == 6
    assert store.cancel_order(db, "TC", placed.id) is True
    assert stock_of(db, product) == 10
    assert store.cancel_order(db, "TC", placed.id) is False  # a second cancel restores nothing
    assert stock_of(db, product) == 10


def test_status_moves_only_forward(db):
    placed = order(db, [(add_product(db), 1)])
    seen = []
    for _ in range(3):
        assert store.advance_order(db, "TC", placed.id) is True
        seen.append(store.get_order(db, "TC", placed.id)[0].status)
    assert seen == ["CONFIRMED", "SHIPPING", "DONE"]


def test_done_and_cancelled_orders_do_not_move(db):
    product = add_product(db, stock=10)
    done, cancelled = order(db, [(product, 1)]), order(db, [(product, 1)])
    for _ in range(3):
        store.advance_order(db, "TC", done.id)
    store.cancel_order(db, "TC", cancelled.id)
    stock = stock_of(db, product)
    assert store.advance_order(db, "TC", done.id) is False and store.cancel_order(db, "TC", done.id) is False
    assert store.advance_order(db, "TC", cancelled.id) is False
    assert [store.get_order(db, "TC", o.id)[0].status for o in (done, cancelled)] == ["DONE", "CANCELLED"]
    assert stock_of(db, product) == stock
    assert store.advance_order(db, "TC", uuid.uuid4()) is None and store.cancel_order(db, "TC", uuid.uuid4()) is None


def test_inactive_or_other_htx_product_is_refused(db):
    mine = add_product(db, name="Chè A", stock=3)
    inactive = add_product(db, name="Chè B", stock=3, active=False)
    other = add_product(db, htx="LB", name="Chè C", stock=3)
    for lines in ([(inactive, 1)], [(other, 1)], [(uuid.uuid4(), 1)], [(mine, 1), (inactive, 1)]):
        assert isinstance(order(db, lines), Refusal), lines
    short = order(db, [(mine, 4)])
    assert isinstance(short, Refusal) and short.message == "Sản phẩm Chè A chỉ còn 3."
    assert db.execute("SELECT count(*) FROM orders").fetchone()[0] == 0
    assert stock_of(db, mine) == 3 and stock_of(db, other) == 3


def test_empty_order_is_refused(db):
    product = add_product(db)
    for lines in ([], [(product, 0)]):
        refused = order(db, lines)
        assert isinstance(refused, Refusal) and refused.message == "Chọn ít nhất một sản phẩm."
    assert db.execute("SELECT count(*) FROM orders").fetchone()[0] == 0


def test_lookup_needs_code_and_phone(db):
    placed = order(db, [(add_product(db), 1)], phone="0912345678")
    found = store.lookup(db, "TC", placed.code, "0912345678")
    assert found is not None and found[0].id == placed.id and len(found[1]) == 1
    assert store.lookup(db, "TC", placed.code, "0999999999") is None
    assert store.lookup(db, "TC", "ZZZZ9999", "0912345678") is None
    assert store.lookup(db, "LB", placed.code, "0912345678") is None


def test_phone_is_normalised():
    assert normalize_phone(" 0912.345-678 ") == "0912345678"
    assert normalize_phone("+84 912 345 678") == "0912345678"
    for bad in ("12345", "091234567", "09123456789", "1912345678", "abc", ""):
        assert normalize_phone(bad) is None


def test_order_code_alphabet_and_retry_on_a_taken_code(db, monkeypatch):
    assert re.fullmatch(r"[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}", store.new_code())
    product = add_product(db, stock=5)
    first = order(db, [(product, 1)])
    codes = iter([first.code, first.code, "BBBB3333"])
    monkeypatch.setattr(store, "new_code", lambda: next(codes))
    assert order(db, [(product, 1)]).code == "BBBB3333"
    assert stock_of(db, product) == 3


def edit(conn, product, delta, htx="TC"):
    return store.edit_product(conn, htx, product, "Chè mới", "Gói 100g", 99000, None, True, delta)


def test_stock_adjustment_keeps_concurrent_order(db):
    """An order placed after the edit form was read is not lost when the adjustment is saved."""
    product = add_product(db, stock=10)
    seen = stock_of(db, product)  # what the edit form showed
    assert isinstance(order(db, [(product, 2)]), Order)
    assert edit(db, product, 10) is True
    assert stock_of(db, product) == seen - 2 + 10


def test_stock_adjustment_cannot_go_negative(db):
    product = add_product(db, stock=3)
    refused = edit(db, product, -4)
    assert isinstance(refused, Refusal) and refused.message == "Tồn kho hiện chỉ còn 3, không thể giảm 4."
    assert stock_of(db, product) == 3
    assert db.execute("SELECT name FROM products WHERE id = %s", (product,)).fetchone()[0] == "Chè Shan tuyết"
    assert edit(db, product, -3) is True and stock_of(db, product) == 0
    assert edit(db, uuid.uuid4(), 1) is None and edit(db, product, 1, htx="LB") is None
