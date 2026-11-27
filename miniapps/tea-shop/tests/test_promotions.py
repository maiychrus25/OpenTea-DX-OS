# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import uuid

import pytest
from conftest import acting, add_product, bearer
from fastapi.testclient import TestClient

from tea_shop import main, store

AGENT = bearer(sub="kc-agent", roles=("agent",), name="")
CREATE = "/agent/actions/promotion-create"


@pytest.fixture
def client(db):
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as test_client:
        yield test_client


def promote(conn, product, htx="TC", pct=10, days=7):
    return store.create_promotion(conn, htx, product, pct, days, "kc-manager-tc")


def test_create_promotion_runs_from_today_for_the_days_given(db):
    product = add_product(db)
    promotion = promote(db, product, pct=20, days=3)
    assert isinstance(promotion, store.Promotion)
    today = db.execute("SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date").fetchone()[0]
    assert (promotion.starts_on, (promotion.ends_on - today).days, promotion.discount_pct) == (today, 2, 20)


def test_create_promotion_refuses_overlap_and_foreign_products(db):
    product = add_product(db)
    assert isinstance(promote(db, product), store.Promotion)
    assert promote(db, product).message == store.PROMOTION_OVERLAP
    assert promote(db, uuid.uuid4()).message == store.PRODUCT_MISSING
    other = add_product(db, htx="LB")
    assert promote(db, other, htx="TC").message == store.PRODUCT_MISSING
    assert db.execute("SELECT count(*) FROM promotions").fetchone()[0] == 1


def test_a_new_promotion_is_allowed_once_the_old_one_ended(db):
    product = add_product(db)
    first = promote(db, product)
    assert store.end_promotion(db, "TC", first.id) is True
    assert store.end_promotion(db, "TC", first.id) is False
    assert isinstance(promote(db, product), store.Promotion)
    assert store.end_promotion(db, "LB", first.id) is None


def test_public_price_and_order_total_use_the_active_promotion(db):
    product = add_product(db, price_vnd=150000, stock=10)
    plain = add_product(db, name="Chè khác", price_vnd=100000)
    promote(db, product, pct=10)
    prices = {p.id: (p.price_vnd, p.sale_price_vnd, p.discount_pct) for p in store.list_products(db, "TC", active_only=True)}
    assert prices[product] == (150000, 135000, 10)
    assert prices[plain] == (100000, 100000, 0)
    placed = store.place_order(db, "TC", [(product, 2)], "Khách", "0912345678", "1 Đường Chè", None)
    assert placed.total_vnd == 270000
    assert db.execute("SELECT price_vnd FROM order_items WHERE order_id = %s", (placed.id,)).fetchone()[0] == 135000


def test_an_ended_or_past_promotion_no_longer_applies(db):
    product = add_product(db, price_vnd=150000)
    promotion = promote(db, product)
    store.end_promotion(db, "TC", promotion.id)
    assert store.get_product(db, "TC", product).sale_price_vnd == 150000
    db.execute("INSERT INTO promotions (htx_code, product_id, discount_pct, starts_on, ends_on, created_by) "
               "VALUES ('TC', %s, 30, current_date - 20, current_date - 10, 'x')", (product,))
    assert store.get_product(db, "TC", product).discount_pct == 0


def test_list_promotions_states(db):
    product = add_product(db, name="Chè A")
    promotion = promote(db, product)
    assert [(p.product_name, p.state) for p in store.list_promotions(db, "TC")] == [("Chè A", "active")]
    store.end_promotion(db, "TC", promotion.id)
    assert store.list_promotions(db, "TC")[0].state == "ended"
    assert store.list_promotions(db, "LB") == []


def test_suggestion_rule(db):
    stale = add_product(db, name="Chè tồn", stock=40)
    add_product(db, name="Chè ít", stock=19)
    add_product(db, name="Chè ngừng", stock=40, active=False)
    sold = add_product(db, name="Chè bán chạy", stock=40)
    promoted = add_product(db, name="Chè đã giảm", stock=40)
    add_product(db, htx="LB", name="Chè HTX khác", stock=40)
    promote(db, promoted)
    db.execute("INSERT INTO orders (htx_code, code, customer_name, phone, address, total_vnd) "
               "VALUES ('TC', 'ABCDEFGH', 'K', '0912345678', 'a', 1)")
    order_id = db.execute("SELECT id FROM orders").fetchone()[0]
    db.execute("INSERT INTO order_items (htx_code, order_id, product_id, product_name, pack, price_vnd, quantity) "
               "VALUES ('TC', %s, %s, 'x', 'y', 1, 1)", (order_id, sold))
    found = store.stale_stock_products(db, "TC")
    assert [(p.id, p.stock) for p in found] == [(stale, 40)]


def test_suggestions_endpoint_needs_the_agent_role(client, db):
    product = add_product(db, name="Chè Tân Cương 200 g", stock=40)
    assert client.get("/agent/suggestions").status_code == 401
    assert client.get("/agent/suggestions", headers=bearer()).status_code == 403
    body = client.get("/agent/suggestions", headers=AGENT).json()
    assert body == {"suggestions": [{
        "action": "promotion.create",
        "payload": {"product_id": str(product), "discount_pct": 10, "days": 7},
        "labels": {"product_name": "Chè Tân Cương 200 g"},
        "reason_vi": "Sản phẩm còn 40 gói, 21 ngày chưa bán được gói nào.",
        "subjects": [str(product)]}]}
    assert client.get("/agent/suggestions", headers=bearer(htx="LB", roles=("agent",))).json() == {"suggestions": []}


def test_action_creates_the_promotion_as_the_acting_manager(client, db):
    product = add_product(db)
    response = client.post(CREATE, headers=acting(sub="kc-approver"),
                           json={"product_id": str(product), "discount_pct": 10, "days": 7})
    assert response.status_code == 200
    row = db.execute("SELECT id, created_by, discount_pct FROM promotions").fetchone()
    assert (str(row[0]), row[1], row[2]) == (response.json()["promotion_id"], "kc-approver", 10)
    assert response.json()["ends_on"] == str(db.execute("SELECT ends_on FROM promotions").fetchone()[0])
    again = client.post(CREATE, headers=acting(), json={"product_id": str(product), "discount_pct": 10, "days": 7})
    assert (again.status_code, again.json()) == (409, {"message_vi": "Sản phẩm đang có khuyến mãi."})


@pytest.mark.parametrize("body", [
    {"product_id": "nope", "discount_pct": 10, "days": 7},
    {"discount_pct": 10, "days": 7},
    {"product_id": "x", "discount_pct": 4, "days": 7},
    {"product_id": "x", "discount_pct": 31, "days": 7},
    {"product_id": "x", "discount_pct": 10, "days": 0},
    {"product_id": "x", "discount_pct": 10, "days": 15},
    {"product_id": "x", "discount_pct": "10", "days": 7},
    {"product_id": "x", "discount_pct": True, "days": 7},
    {"product_id": "x", "discount_pct": 10, "days": 7, "extra": 1},
])
def test_action_refuses_bad_payloads(client, db, body):
    product = add_product(db)
    body = {**body, **({"product_id": str(product)} if body.get("product_id") == "x" else {})}
    response = client.post(CREATE, headers=acting(), json=body)
    assert response.status_code == 400 and response.json()["message_vi"]
    assert db.execute("SELECT count(*) FROM promotions").fetchone()[0] == 0


def test_action_other_cooperative_or_missing_product_is_404(client, db):
    other = add_product(db, htx="LB")
    for product in (other, uuid.uuid4()):
        response = client.post(CREATE, headers=acting(htx="TC"), json={"product_id": str(product), "discount_pct": 10, "days": 7})
        assert (response.status_code, response.json()) == (404, {"message_vi": store.PRODUCT_MISSING})


def test_action_is_not_open_to_a_user_who_forges_the_acting_headers(client, db):
    product = add_product(db)
    body = {"product_id": str(product), "discount_pct": 10, "days": 7}
    forged = {**bearer(sub="kc-farmer", roles=("farmer",)), **{k: v for k, v in acting().items() if k != "Authorization"}}
    assert client.post(CREATE, headers=forged, json=body).status_code == 403
    assert client.post(CREATE, headers=AGENT, json=body).status_code == 403  # the agent suggests, never acts
    assert client.post(CREATE, headers=acting(role="officer"), json=body).status_code == 403
    assert client.post(CREATE, json=body).status_code == 401


def test_manager_lists_and_ends_promotions(client, db):
    product = add_product(db, name="Chè A", price_vnd=150000)
    promotion = promote(db, product, pct=10)
    page = client.get("/promotions", headers=bearer())
    assert page.status_code == 200 and "Chè A" in page.text and "10%" in page.text
    assert client.get("/promotions", headers=bearer(htx="LB")).text.count("Chè A") == 0
    assert client.post(f"/promotions/{promotion.id}/end", headers=bearer(htx="LB")).status_code == 404
    ended = client.post(f"/promotions/{promotion.id}/end", headers=bearer())
    assert ended.status_code == 303
    assert store.get_product(db, "TC", product).discount_pct == 0
    assert client.post(f"/promotions/{promotion.id}/end", headers=bearer()).status_code == 303  # already ended: notice, no error


def test_public_page_shows_the_sale_price(client, db):
    product = add_product(db, price_vnd=150000)
    promote(db, product, pct=10)
    text = client.get("/public/TC").text
    assert "135.000 ₫" in text and "150.000 ₫" in text and "-10%" in text
