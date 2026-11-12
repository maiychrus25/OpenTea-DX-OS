# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import re
import threading
import uuid
from urllib.parse import parse_qs, urlsplit

import pytest
from conftest import add_product, bearer
from fastapi.testclient import TestClient

from tea_shop import main, store

MANAGER = bearer()
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",))
PRODUCT_FORM = {"name": "Chè Shan tuyết", "pack": "Gói 200g", "price_vnd": "150000", "stock": "10", "lot_code": "LOT-2026-1",
                "active": "on"}


@pytest.fixture
def client(db):
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as test_client:
        yield test_client


def place(client, lines, htx="TC", query="", **form):
    """Post the public order form; lines are (product id, quantity) pairs."""
    data = {"product_id": [str(p) for p, _ in lines], "quantity": [str(q) for _, q in lines],
            "customer_name": "Nguyễn Văn Khách", "phone": "0912 345 678", "address": "12 Đường Chè, Thái Nguyên",
            "note": "", **form}
    return client.post(f"/public/{htx}/order{query}", data=data)


def order_code(response):
    return parse_qs(urlsplit(response.headers["location"]).query)["code"][0]


def test_manager_sees_only_own_htx_products_and_orders(client, db):
    add_product(db, name="Chè của Tân Cương")
    other_product = add_product(db, htx="LB", name="Chè của La Bằng")
    mine = place(client, [(add_product(db, name="Chè bán", stock=5), 1)], customer_name="Khách TC")
    page = client.get("/", headers=MANAGER)
    assert page.status_code == 200
    assert "Chè của Tân Cương" in page.text and "Khách TC" in page.text and "Chè của La Bằng" not in page.text
    place(client, [(other_product, 1)], htx="LB", customer_name="Khách LB")
    assert mine.status_code == 303
    assert "Khách LB" not in client.get("/", headers=MANAGER).text


def test_manager_of_other_htx_gets_404(client, db):
    lb_product = add_product(db, htx="LB", stock=5)
    lb_order = place(client, [(lb_product, 1)], htx="LB")
    lb_id = db.execute("SELECT id FROM orders WHERE code = %s", (order_code(lb_order),)).fetchone()[0]
    for method, path in (("GET", f"/orders/{lb_id}"), ("POST", f"/orders/{lb_id}/advance"),
                         ("POST", f"/orders/{lb_id}/cancel"), ("GET", f"/products/{lb_product}/edit"),
                         ("POST", f"/products/{lb_product}/edit")):
        assert client.request(method, path, headers=MANAGER, data=PRODUCT_FORM).status_code == 404, path
    assert db.execute("SELECT status FROM orders WHERE id = %s", (lb_id,)).fetchone()[0] == "NEW"
    assert db.execute("SELECT stock FROM products WHERE id = %s", (lb_product,)).fetchone()[0] == 4


def test_roles_and_claims_are_checked_by_the_app_too(client, db):
    product, order_id = uuid.uuid4(), uuid.uuid4()
    calls = [("GET", "/"), ("POST", "/products"), ("GET", f"/products/{product}/edit"),
             ("POST", f"/products/{product}/edit"), ("GET", f"/orders/{order_id}"),
             ("POST", f"/orders/{order_id}/advance"), ("POST", f"/orders/{order_id}/cancel")]
    for method, path in calls:
        for headers in ({}, {"Authorization": "Bearer not-a-jwt"}):
            assert client.request(method, path, headers=headers).status_code == 401, (method, path)
        assert client.request(method, path, headers=FARMER).status_code == 403, (method, path)
        assert client.request(method, path, headers=bearer(htx="")).status_code == 403, (method, path)


def test_manager_creates_and_edits_a_product(client, db):
    created = client.post("/products", headers=MANAGER, data=PRODUCT_FORM)
    assert created.status_code == 303 and created.headers["location"] == "/apps/tea-shop/"
    product_id, stock, lot, active = db.execute("SELECT id, stock, lot_code, active FROM products").fetchone()
    assert (stock, lot, active) == (10, "LOT-2026-1", True)
    edited = client.post(f"/products/{product_id}/edit", headers=MANAGER,
                         data={**PRODUCT_FORM, "name": "Chè mới", "stock": "7", "lot_code": "", "active": ""})
    assert edited.status_code == 303
    assert db.execute("SELECT name, stock, lot_code, active FROM products").fetchone() == ("Chè mới", 7, None, False)
    assert "Chè mới" in client.get(f"/products/{product_id}/edit", headers=MANAGER).text


def test_product_form_validates_every_field(client, db):
    for bad in ({"name": ""}, {"pack": "x" * 61}, {"price_vnd": "-1"}, {"price_vnd": "abc"}, {"stock": ""},
                {"stock": "1.5"}, {"lot_code": "bad lot!"}, {"lot_code": "x" * 41}):
        response = client.post("/products", headers=MANAGER, data={**PRODUCT_FORM, **bad})
        assert response.status_code == 400 and 'role="alert"' in response.text, bad
    assert db.execute("SELECT count(*) FROM products").fetchone()[0] == 0


def test_manager_moves_an_order_and_cancel_restores_stock(client, db):
    product = add_product(db, stock=5)
    place(client, [(product, 2)])
    order_id = db.execute("SELECT id FROM orders").fetchone()[0]
    detail = client.get(f"/orders/{order_id}", headers=MANAGER).text
    assert "Nguyễn Văn Khách" in detail and "0912345678" in detail and "12 Đường Chè" in detail
    moved = client.post(f"/orders/{order_id}/advance?theme=dark", headers=MANAGER)
    assert moved.status_code == 303 and moved.headers["location"] == f"/apps/tea-shop/orders/{order_id}?theme=dark"
    assert db.execute("SELECT status FROM orders").fetchone()[0] == "CONFIRMED"
    assert client.post(f"/orders/{order_id}/cancel", headers=MANAGER).status_code == 303
    assert db.execute("SELECT status FROM orders").fetchone()[0] == "CANCELLED"
    assert db.execute("SELECT stock FROM products").fetchone()[0] == 5
    again = client.post(f"/orders/{order_id}/advance", headers=MANAGER)
    assert again.headers["location"].endswith("?notice=unchanged")
    assert "Không có gì thay đổi" in client.get(again.headers["location"].removeprefix("/apps/tea-shop"),
                                                headers=MANAGER).text


def test_notice_takes_only_known_keys(client, db):
    place(client, [(add_product(db), 1)])
    order_id = db.execute("SELECT id FROM orders").fetchone()[0]
    page = client.get(f"/orders/{order_id}?notice=%3Cb%3Ex", headers=MANAGER).text
    assert "<b>x" not in page and 'role="status"' not in page


def test_public_page_lists_active_products_of_the_htx(client, db):
    add_product(db, name="Còn hàng", stock=5, price_vnd=150000)
    add_product(db, name="Hết hàng", stock=0)
    add_product(db, name="Ngừng bán", active=False)
    add_product(db, htx="LB", name="Của HTX khác")
    page = client.get("/public/TC").text
    assert "Còn hàng" in page and "150.000 ₫" in page and "Hết hàng" in page
    for hidden in ("Ngừng bán", "Của HTX khác"):
        assert hidden not in page
    assert page.count('name="product_id"') == 1  # no quantity field for the sold-out product
    assert client.get("/public/LB").status_code == 200 and client.get("/public/XX").status_code == 200


def test_order_flow_redirects_to_code_and_lookup_shows_the_order(client, db):
    product = add_product(db, name="Chè Shan tuyết", price_vnd=150000, stock=10)
    response = place(client, [(product, 2)], query="?theme=dark")
    assert response.status_code == 303
    location = urlsplit(response.headers["location"])
    assert location.path == "/apps/tea-shop/public/TC/order" and "theme=dark" in location.query
    code = order_code(response)
    assert re.fullmatch(r"[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}", code)
    just_placed = client.get(f"/public/TC/order?code={code}&booked=1")
    assert code in just_placed.text and "Chè Shan tuyết" not in just_placed.text
    found = client.get(f"/public/TC/order?code={code.lower()}&phone=%2B84912345678")
    assert found.status_code == 200
    assert "Chè Shan tuyết" in found.text and "300.000 ₫" in found.text and "Mới" in found.text


def test_lookup_needs_code_and_phone(client, db):
    code = order_code(place(client, [(add_product(db, name="Chè bí mật"), 1)]))
    wrong_phone = client.get(f"/public/TC/order?code={code}&phone=0999999999")
    wrong_code = client.get("/public/TC/order?code=ZZZZ9999&phone=0912345678")
    other_htx = client.get(f"/public/LB/order?code={code}&phone=0912345678")
    garbage = client.get(f"/public/TC/order?code={code}&phone=abc")
    for miss in (wrong_phone, wrong_code, other_htx, garbage):
        assert miss.status_code == 404
        assert "Không tìm thấy đơn hàng với mã và số điện thoại này." in miss.text
        assert "Chè bí mật" not in miss.text
    assert wrong_phone.text.replace(code, "") == wrong_code.text.replace("ZZZZ9999", "")


def test_public_pages_hide_other_customers(client, db):
    product = add_product(db, stock=10)
    mine = order_code(place(client, [(product, 1)], customer_name="Khách Một", phone="0911111111", address="Địa chỉ Một"))
    place(client, [(product, 1)], customer_name="Khách Hai", phone="0922222222", address="Địa chỉ Hai")
    pages = [client.get("/public/TC"), client.get(f"/public/TC/order?code={mine}&phone=0911111111"),
             client.get(f"/public/TC/order?code={mine}&phone=0922222222"),
             place(client, [(product, 1)], phone="12345"), place(client, [(product, 99)])]
    for page in pages:
        for secret in ("Khách Hai", "0922222222", "Địa chỉ Hai"):
            assert secret not in page.text
    assert "Khách Một" in pages[1].text  # the customer's own order


def test_bad_order_forms_are_refused_and_nothing_is_stored(client, db):
    product = add_product(db, name="Chè A", stock=3)
    inactive = add_product(db, active=False)
    other = add_product(db, htx="LB")
    cases = [([(product, 0)], {}, 400, "Chọn ít nhất một sản phẩm."),
             ([(product, 4)], {}, 409, "Sản phẩm Chè A chỉ còn 3."),
             ([(product, 100)], {}, 400, "Số lượng"),
             ([(product, "x")], {}, 400, "Số lượng"),
             ([(inactive, 1)], {}, 409, "không còn bán"),
             ([(other, 1)], {}, 409, "không còn bán"),
             ([("not-a-uuid", 1)], {}, 409, "không còn bán"),
             ([(product, 1)], {"phone": "12345"}, 400, "Số điện thoại"),
             ([(product, 1)], {"customer_name": " "}, 400, "Họ tên"),
             ([(product, 1)], {"address": ""}, 400, "Địa chỉ"),
             ([(product, 1)], {"note": "x" * 501}, 400, "Ghi chú")]
    for lines, form, status, message in cases:
        response = place(client, lines, **form)
        assert response.status_code == status, (lines, form)
        assert 'role="alert"' in response.text and message in response.text, (lines, form)
    assert db.execute("SELECT count(*) FROM orders").fetchone()[0] == 0
    assert db.execute("SELECT stock FROM products WHERE id = %s", (product,)).fetchone()[0] == 3


def test_phone_is_normalised(client, db):
    place(client, [(add_product(db), 1)], phone="+84 912.345-678")
    assert db.execute("SELECT phone FROM orders").fetchone()[0] == "0912345678"


def test_lot_link_only_with_lot_code(client, db):
    add_product(db, name="Có mã lô", lot_code="LOT-2026-1")
    add_product(db, name="Không mã lô", lot_code=None)
    page = client.get("/public/TC").text
    assert page.count("Xem nguồn gốc") == 1 and 'href="/lot/LOT-2026-1"' in page


def test_pages_escape_html(client, db):
    product = add_product(db, name="<b>chè</b>", pack="<i>gói</i>")
    code = order_code(place(client, [(product, 1)], customer_name="<script>x</script>", address="<u>a</u>", note="<em>n</em>"))
    order_id = db.execute("SELECT id FROM orders").fetchone()[0]
    pages = [client.get("/public/TC").text, client.get("/", headers=MANAGER).text,
             client.get(f"/orders/{order_id}", headers=MANAGER).text,
             client.get(f"/public/TC/order?code={code}&phone=0912345678").text,
             client.get(f"/products/{product}/edit", headers=MANAGER).text]
    for page in pages:
        for raw in ("<b>chè</b>", "<script>x</script>", "<u>a</u>", "<em>n</em>", "<i>gói</i>"):
            assert raw not in page
    assert "&lt;b&gt;chè&lt;/b&gt;" in pages[0] and "&lt;script&gt;x&lt;/script&gt;" in pages[2]


def test_table_cells_carry_their_column_label(client, db):
    place(client, [(add_product(db), 1)])
    html = client.get("/", headers=MANAGER).text
    assert "<td>" not in html and html.count('<table role="table">') == 2
    for table in html.split('<table role="table">')[1:]:
        heads = re.findall(r'<th role="columnheader">(.*?)</th>', table)
        assert heads and re.findall(r'<td role="cell" data-label="(.*?)">', table) == heads


def test_theme_is_echoed_and_kept(client, db):
    product = add_product(db)
    place(client, [(product, 1)])
    order_id = db.execute("SELECT id FROM orders").fetchone()[0]
    for theme in ("light", "dark"):
        for path, headers in (("/", MANAGER), (f"/orders/{order_id}", MANAGER), (f"/products/{product}/edit", MANAGER),
                              ("/public/TC", {}), ("/public/TC/order?code=ZZZZ9999&phone=0912345678", {})):
            page = client.get(f"{path}{'&' if '?' in path else '?'}theme={theme}", headers=headers).text
            assert f'<html lang="vi" data-theme="{theme}">' in page, path
            for target in re.findall(r'(?:action|href)="(/apps/tea-shop[^"]*)"', page):
                assert target.endswith(f"theme={theme}"), (path, target)
    assert '<html lang="vi">' in client.get("/public/TC?theme=%22%3E%3Cb%3E").text


def test_errors_are_vietnamese_pages(client, db):
    for path in ("/orders/not-a-uuid", "/no-such-page", "/public/TC/order/x", "/public/T%20C",
                 "/public/" + "A" * 21):
        response = client.get(path, headers=MANAGER)
        assert response.status_code == 404, path
        assert response.headers["content-type"].startswith("text/html") and "Không có trang này" in response.text


def test_database_outage_is_a_vietnamese_page(client, monkeypatch):
    monkeypatch.setenv("DXOS_APP_DB_URL", "postgresql://nobody:x@127.0.0.1:1/none?connect_timeout=1")
    response = client.get("/public/TC")
    assert response.status_code == 500
    assert "Có lỗi xảy ra" in response.text and "Traceback" not in response.text and "psycopg" not in response.text


def test_healthz(client):
    assert client.get("/healthz").text == "ok"


def test_busy_database_answers_503(client, db, monkeypatch):
    monkeypatch.setattr(main, "DB_WAIT_S", 0.05)
    taken = [main.DB_SLOTS.acquire(blocking=False) for _ in range(main.DB_MAX_CONNECTIONS)]
    try:
        assert all(taken)
        result = {}
        request = threading.Thread(target=lambda: result.update(response=client.get("/public/TC")), daemon=True)
        request.start()
        request.join(5)
        assert not request.is_alive(), "the request waited for a free connection instead of answering 503"
        assert result["response"].status_code == 503 and "bận" in result["response"].text
    finally:
        for _ in taken:
            main.DB_SLOTS.release()
    assert client.get("/public/TC").status_code == 200
