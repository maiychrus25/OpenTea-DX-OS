# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Selling from core lots: the core's internal API is mocked at urllib.request.urlopen (contract: S8 plan, API table)."""
import io
import json
import urllib.error
import urllib.request

import pytest
from conftest import add_product, bearer
from fastapi.testclient import TestClient
from test_pages import place

from tea_shop import core, main

MANAGER = bearer()
LOT = {"lot_id": "lot-1", "lot_code": "LO-2026-01", "dry_grade": "A", "quality_grade": None,
       "capacity_g": 50000, "remaining_g": 12500}
ORDER_VIEW = {"order_no": "TC-DH-20261128-001", "status": "CONFIRMED"}


class FakeCore:
    """Replaces urlopen: answers are queued per call; every request is recorded."""

    def __init__(self):
        self.calls, self.answers = [], []

    def __call__(self, request, timeout=None):
        self.calls.append({"url": request.full_url, "method": request.get_method(), "timeout": timeout,
                           "auth": request.get_header("Authorization"),
                           "body": json.loads(request.data) if request.data else None})
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        status, payload = answer
        raw = json.dumps(payload).encode()
        if status >= 400:
            raise urllib.error.HTTPError(request.full_url, status, "err", {}, io.BytesIO(raw))
        return io.BytesIO(raw)


@pytest.fixture
def fake(monkeypatch):
    fake_core = FakeCore()
    monkeypatch.setattr(urllib.request, "urlopen", fake_core)
    return fake_core


@pytest.fixture
def client(db):
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as test_client:
        yield test_client


def lot_order(client, db, quantity=4, pack_net_g=250):
    """A NEW order of one lot-linked product; returns the order id."""
    product = add_product(db, price_vnd=90000, stock=20, lot_code="LO-2026-01")
    db.execute("UPDATE products SET lot_id = 'lot-1', pack_net_g = %s WHERE id = %s", (pack_net_g, product))
    place(client, [(product, quantity)])
    return db.execute("SELECT id FROM orders").fetchone()[0]


def status(db):
    return db.execute("SELECT status, core_order_no FROM orders").fetchone()


def test_confirm_sends_packs_in_grams_with_the_users_token(client, db, fake):
    order_id = lot_order(client, db)
    fake.answers = [(201, ORDER_VIEW)]
    moved = client.post(f"/orders/{order_id}/advance", headers=MANAGER)
    assert moved.status_code == 303
    call = fake.calls[0]
    assert call["url"] == "http://apisix:9081/api/internal/apps/sales/retail-orders" and call["method"] == "POST"
    assert call["auth"] == MANAGER["Authorization"] and call["timeout"] == 5
    # 4 packs of 250 g are 1,000 g: the core multiplies pack_count by pack_net_g.
    assert call["body"] == {"external_ref": str(order_id), "customer_name": "Nguyễn Văn Khách",
                            "lines": [{"lot_id": "lot-1", "pack_count": 4, "pack_net_g": 250, "amount_vnd": 360000}]}
    assert status(db) == ("CONFIRMED", "TC-DH-20261128-001")
    assert "TC-DH-20261128-001" in client.get(f"/orders/{order_id}", headers=MANAGER).text


def test_second_click_after_success_does_not_call_the_core_again(client, db, fake):
    order_id = lot_order(client, db)
    fake.answers = [(201, ORDER_VIEW)]
    client.post(f"/orders/{order_id}/advance", headers=MANAGER)
    client.post(f"/orders/{order_id}/advance", headers=MANAGER)  # the normal next step: CONFIRMED -> SHIPPING
    assert len(fake.calls) == 1 and status(db)[0] == "SHIPPING"


def test_stock_short_shows_the_lot_and_keeps_the_order_new(client, db, fake):
    order_id = lot_order(client, db)
    fake.answers = [(409, {"error": {"code": "LOT_STOCK_SHORT", "message": "x",
                                     "stock": [{"lot_id": "lot-1", "remaining_g": 1550}]}})]
    refused = client.post(f"/orders/{order_id}/advance", headers=MANAGER)
    assert refused.status_code == 409 and 'role="alert"' in refused.text
    assert "Lô LO-2026-01 chỉ còn 1,5 kg, không đủ cho đơn này." in refused.text
    assert status(db) == ("NEW", None)


def test_stock_short_with_top_level_stock_field(client, db, fake):
    order_id = lot_order(client, db)
    fake.answers = [(409, {"error": {"code": "LOT_STOCK_SHORT"}, "stock": [{"lot_id": "lot-1", "remaining_g": 0}]})]
    assert "chỉ còn 0,0 kg" in client.post(f"/orders/{order_id}/advance", headers=MANAGER).text


@pytest.mark.parametrize("answer", [(500, {}), (503, {"error": {"code": "CORE_UNAVAILABLE"}}),
                                    urllib.error.URLError("refused"), TimeoutError("slow"),
                                    (200, "not an object")])
def test_core_down_keeps_the_order_new_and_a_retry_works(client, db, fake, answer):
    order_id = lot_order(client, db)
    fake.answers = [answer, (200, ORDER_VIEW)]  # the retry is a replay of the same external_ref
    down = client.post(f"/orders/{order_id}/advance", headers=MANAGER)
    assert down.status_code == 503 and "Chưa ghi được vào sổ bán hàng của HTX. Thử lại sau." in down.text
    assert status(db) == ("NEW", None)
    assert client.post(f"/orders/{order_id}/advance", headers=MANAGER).status_code == 303
    assert status(db) == ("CONFIRMED", "TC-DH-20261128-001")
    assert fake.calls[0]["body"]["external_ref"] == fake.calls[1]["body"]["external_ref"] == str(order_id)


def test_other_refusal_does_not_advance(client, db, fake):
    order_id = lot_order(client, db)
    fake.answers = [(422, {"error": {"code": "LOT_NOT_SELLABLE", "message": "x"}})]
    refused = client.post(f"/orders/{order_id}/advance", headers=MANAGER)
    assert refused.status_code == 409 and "không còn bán được" in refused.text and status(db)[0] == "NEW"


def test_order_without_lot_advances_without_calling_the_core(client, db, fake):
    place(client, [(add_product(db, stock=5), 1)])
    order_id = db.execute("SELECT id FROM orders").fetchone()[0]
    assert client.post(f"/orders/{order_id}/advance", headers=MANAGER).status_code == 303
    assert status(db) == ("CONFIRMED", None) and fake.calls == []
    assert client.post(f"/orders/{order_id}/cancel", headers=MANAGER).status_code == 303
    assert status(db)[0] == "CANCELLED" and fake.calls == []


def test_cancel_releases_the_core_order_first(client, db, fake):
    order_id = lot_order(client, db)
    fake.answers = [(201, ORDER_VIEW), (200, ORDER_VIEW)]
    client.post(f"/orders/{order_id}/advance", headers=MANAGER)
    assert client.post(f"/orders/{order_id}/cancel", headers=MANAGER).status_code == 303
    call = fake.calls[1]
    assert call["url"] == f"http://apisix:9081/api/internal/apps/sales/retail-orders/{order_id}/cancel"
    assert call["method"] == "POST" and call["auth"] == MANAGER["Authorization"] and call["timeout"] == 5
    assert status(db)[0] == "CANCELLED"
    assert db.execute("SELECT stock FROM products").fetchone()[0] == 20


def test_cancel_with_core_down_keeps_the_order(client, db, fake):
    order_id = lot_order(client, db)
    fake.answers = [(201, ORDER_VIEW), (502, {})]
    client.post(f"/orders/{order_id}/advance", headers=MANAGER)
    down = client.post(f"/orders/{order_id}/cancel", headers=MANAGER)
    assert down.status_code == 503 and "Chưa ghi được vào sổ bán hàng của HTX" in down.text
    assert status(db)[0] == "CONFIRMED" and db.execute("SELECT stock FROM products").fetchone()[0] == 16


def test_cancel_when_the_core_has_no_such_order_goes_through(client, db, fake):
    order_id = lot_order(client, db)
    fake.answers = [(201, ORDER_VIEW), (404, {"error": {"code": "NOT_FOUND"}})]
    client.post(f"/orders/{order_id}/advance", headers=MANAGER)
    assert client.post(f"/orders/{order_id}/cancel", headers=MANAGER).status_code == 303
    assert status(db)[0] == "CANCELLED"


def test_edit_page_lists_sellable_lots_and_saves_the_pick(client, db, fake):
    product = add_product(db)
    fake.answers = [(200, [LOT]), (200, [LOT])]
    page = client.get(f"/products/{product}/edit", headers=MANAGER)
    assert "LO-2026-01" in page.text and "12,5 kg" in page.text and "Trọng lượng tịnh mỗi gói (g)" in page.text
    assert fake.calls[0]["url"] == "http://apisix:9081/api/internal/apps/sales/sellable-lots"
    form = {"name": "Chè", "pack": "Gói 250g", "price_vnd": "90000", "stock_delta": "0", "active": "on",
            "lot_id": "lot-1", "pack_net_g": "250"}
    assert client.post(f"/products/{product}/edit", headers=MANAGER, data=form).status_code == 303
    row = db.execute("SELECT lot_id, pack_net_g, lot_code FROM products").fetchone()
    assert row == ("lot-1", 250, "LO-2026-01")  # the empty traceability code is filled from the picked lot


@pytest.mark.parametrize("lot_id, pack_net_g", [("lot-1", ""), ("", "250"), ("lot-1", "0"), ("lot-1", "100001"),
                                                ("lot-1", "2.5"), ("bad id!", "250")])
def test_lot_and_pack_weight_go_together(client, db, fake, lot_id, pack_net_g):
    product = add_product(db)
    fake.answers = [(200, [LOT])]
    form = {"name": "Chè", "pack": "Gói", "price_vnd": "1", "stock_delta": "0", "lot_id": lot_id,
            "pack_net_g": pack_net_g}
    assert client.post(f"/products/{product}/edit", headers=MANAGER, data=form).status_code == 400
    assert db.execute("SELECT lot_id, pack_net_g FROM products").fetchone() == (None, None)


def test_edit_page_still_works_when_the_core_is_down(client, db, fake):
    product = add_product(db)
    fake.answers = [urllib.error.URLError("down")]
    page = client.get(f"/products/{product}/edit", headers=MANAGER)
    assert page.status_code == 200 and "Chưa lấy được danh sách lô" in page.text


def test_core_url_comes_from_the_environment(monkeypatch, fake):
    monkeypatch.setattr(core, "CORE_URL", "http://core.test:1")
    fake.answers = [(200, [])]
    assert core.sellable_lots("Bearer t") == [] and fake.calls[0]["url"].startswith("http://core.test:1/")
