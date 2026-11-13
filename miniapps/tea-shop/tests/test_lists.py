# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Overview, order and product lists, CSV, delivery note and the public pages of the shared mini-app kit."""
import csv
import io
import re
import uuid

import pytest
from conftest import add_product, bearer
from fastapi.testclient import TestClient
from test_pages import MANAGER, order_code, place

from tea_shop import main

FARMER = bearer(sub="kc-farmer-1", roles=("farmer",))
OTHER_MANAGER = bearer(sub="kc-manager-lb", htx="LB")
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@pytest.fixture
def client(db):
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as test_client:
        yield test_client


def code_for(n: int) -> str:
    return "".join(CODE_ALPHABET[(n // 32 ** i) % 32] for i in range(8))


def add_order(db, htx="TC", status="NEW", total=100000, customer="Trần Thị Mai", phone="0912345678",
              address="12 Đường Chè, Thái Nguyên", days_ago=0, n=None, items=()):
    """An order inserted directly so status, total and date are exact; items are (name, pack, price, quantity)."""
    n = n if n is not None else uuid.uuid4().int % 10**6
    order_id = db.execute(
        "INSERT INTO orders (htx_code, code, customer_name, phone, address, status, total_vnd, created_at) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, now() - make_interval(days => %s)) RETURNING id",
        (htx, code_for(n), customer, phone, address, status, total, days_ago)).fetchone()[0]
    for name, pack, price, quantity in items:
        product_id = add_product(db, htx=htx, name=name, pack=pack, price_vnd=price)
        db.execute("INSERT INTO order_items (htx_code, order_id, product_id, product_name, pack, price_vnd, quantity) "
                   "VALUES (%s, %s, %s, %s, %s, %s, %s)", (htx, order_id, product_id, name, pack, price, quantity))
    return order_id


def stat(html: str, label: str) -> str:
    found = re.search(rf'<span class="stat-label">{re.escape(label)}</span>\s*<span class="stat-value">(.*?)</span>', html)
    assert found, f"no stat {label!r}"
    return found.group(1)


def charts(html: str) -> list[str]:
    return re.findall(r'<figure class="chart">.*?</figure>', html, re.S)


def codes_on(html: str) -> list[str]:
    return re.findall(r'data-label="Mã đơn"><a href="[^"]*">([A-Z0-9]{8})</a>', html)


def test_overview_stats_on_a_fixed_set(client, db):
    add_order(db, status="NEW", n=1)
    add_order(db, status="NEW", n=2)
    add_order(db, status="SHIPPING", n=3)
    add_order(db, status="DONE", total=100000, n=4)
    add_order(db, status="DONE", total=50000, n=5)
    add_order(db, status="CANCELLED", total=999000, n=6)
    add_order(db, status="DONE", total=70000, days_ago=40, n=7)  # a past month: not this month's revenue
    add_order(db, htx="LB", status="NEW", n=8)
    add_product(db, name="Biên 5", stock=5)
    add_product(db, name="Biên 6", stock=6)
    add_product(db, name="Ngừng bán", stock=0, active=False)
    add_product(db, htx="LB", name="Của HTX khác", stock=1)
    html = client.get("/", headers=MANAGER).text
    assert stat(html, "Đơn chờ xác nhận") == "2"
    assert stat(html, "Đang giao") == "1"
    assert stat(html, "Doanh thu tháng này") == "150.000 ₫"
    assert stat(html, "Sắp hết hàng") == "1"
    revenue_chart = charts(html)[0]
    assert "Doanh thu 14 ngày gần nhất" in revenue_chart and "150.000 ₫" in revenue_chart
    assert "999.000" not in revenue_chart and "70.000" not in revenue_chart
    assert stat(client.get("/", headers=OTHER_MANAGER).text, "Đơn chờ xác nhận") == "1"


def test_overview_empty_htx_shows_zeros(client, db):
    html = client.get("/", headers=MANAGER).text
    assert stat(html, "Doanh thu tháng này") == "0 ₫" and stat(html, "Sắp hết hàng") == "0"
    assert 'class="chart"' in html and 'class="empty"' in html


def test_overview_top_products_by_quantity(client, db):
    for i in range(6):
        add_order(db, status="DONE", n=10 + i, items=[(f"Chè số {i}", "Gói 100g", 10000, 10 + i)])
    add_order(db, status="CANCELLED", n=20, items=[("Chè đã huỷ", "Gói", 10000, 90)])
    add_order(db, htx="LB", status="DONE", n=21, items=[("Chè của HTX khác", "Gói", 10000, 90)])
    html = client.get("/", headers=MANAGER).text
    top = charts(html)[1]
    assert "Bán chạy tháng này" in top
    assert top.index("Chè số 5") < top.index("Chè số 4") < top.index("Chè số 1")
    assert "Chè số 0" not in top and "Chè đã huỷ" not in top and "Chè của HTX khác" not in top


def test_overview_lists_the_ten_newest_and_link_to_the_full_lists(client, db):
    for i in range(12):
        add_order(db, n=30 + i, days_ago=12 - i)
    for i in range(12):
        add_product(db, name=f"Sản phẩm {i:02d}")
    html = client.get("/", headers=MANAGER).text
    assert len(codes_on(html)) == 10 and code_for(30 + 11) in html and code_for(30) not in html
    assert len(re.findall(r'data-label="Sản phẩm"', html)) == 10 and "Sản phẩm 11" in html and "Sản phẩm 00" not in html
    assert 'href="/apps/tea-shop/orders"' in html and 'href="/apps/tea-shop/products"' in html
    assert 'name="name"' in html and 'name="pack"' in html and 'name="price_vnd"' in html and 'name="active"' in html


def test_tabs_mark_the_current_page(client, db):
    for path, current in (("/", "Tổng quan"), ("/orders", "Đơn hàng"), ("/products", "Sản phẩm")):
        html = client.get(path, headers=MANAGER).text
        assert re.findall(r'<a href="[^"]*" aria-current="page">(.*?)</a>', html) == [current], path
        for label in ("Tổng quan", "Đơn hàng", "Sản phẩm"):
            assert f">{label}</a>" in html


def test_order_list_filters(client, db):
    add_order(db, status="NEW", customer="Trần Thị Mai", phone="0911111111", days_ago=0, n=100)
    add_order(db, status="DONE", customer="Lê Văn Hùng", phone="0922222222", days_ago=5, n=101)
    add_order(db, status="CANCELLED", customer="Phạm Thu Hà", phone="0933333333", days_ago=10, n=102)
    add_order(db, htx="LB", status="NEW", customer="Trần Thị Mai", n=103)
    a, b, c = code_for(100), code_for(101), code_for(102)

    def listed(query):
        response = client.get(f"/orders{query}", headers=MANAGER)
        assert response.status_code == 200, query
        return codes_on(response.text)

    assert set(listed("")) == {a, b, c} and set(listed("?status=all")) == {a, b, c}
    assert listed("?status=DONE") == [b] and listed("?status=NEW") == [a] and listed("?status=CANCELLED") == [c]
    assert set(listed("?status=BOGUS")) == {a, b, c}
    assert listed(f"?q={b.lower()}") == [b]
    assert listed("?q=h%C3%B9ng") == [b] and listed("?q=0933") == [c] and listed("?q=mai") == [a]
    assert listed("?q=Hung") == []  # accent-sensitive
    assert listed("?q=nobody") == []
    today = client.get("/orders", headers=MANAGER).text
    assert listed("?from=2099-01-01") == [] and set(listed("?to=2099-01-01")) == {a, b, c}
    assert listed("?from=2000-01-01&to=2000-01-02") == []
    assert set(listed("?from=not-a-date&to=2026-13-45")) == {a, b, c}
    assert listed(f"?status=DONE&q={a}") == []
    assert "Trần Thị Mai" in today and "Lê Văn Hùng" in today
    first = client.get("/orders", headers=MANAGER).text
    assert first.index(a) < first.index(b) < first.index(c)  # newest first


def test_date_range_is_inclusive_and_uses_the_vietnam_day(client, db):
    day = db.execute("SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 3").fetchone()[0].isoformat()
    add_order(db, days_ago=3, n=110)
    assert codes_on(client.get(f"/orders?from={day}&to={day}", headers=MANAGER).text) == [code_for(110)]


def test_search_treats_wildcards_as_text(client, db):
    add_order(db, customer="Giảm 100% chè", n=120)
    add_order(db, customer="Tên A_B", n=121)
    add_order(db, customer="Tên AxB", n=122)
    add_order(db, customer="Trần Thị Mai", n=123)
    add_product(db, name="Chè 100% sạch")
    add_product(db, name="Chè thường")

    def names(path):
        response = client.get(path, headers=MANAGER)
        assert response.status_code == 200, path
        return response.text

    assert codes_on(names("/orders?q=%25")) == [code_for(120)]
    assert codes_on(names("/orders?q=A_B")) == [code_for(121)]
    assert codes_on(names("/orders?q=_")) == [code_for(121)]
    assert codes_on(names("/orders?q=%5C")) == []
    assert codes_on(names("/orders?q=%27%3B+DROP+TABLE+orders%3B--")) == []
    assert db.execute("SELECT count(*) FROM orders").fetchone()[0] == 4
    products = names("/products?q=%25")
    assert "Chè 100% sạch" in products and "Chè thường" not in products
    assert "Chè thường" not in names("/products?q=_")


def test_order_list_pages_clamp(client, db):
    for i in range(27):
        add_order(db, n=200 + i, days_ago=27 - i)
    page_1 = codes_on(client.get("/orders", headers=MANAGER).text)
    page_2 = client.get("/orders?page=2", headers=MANAGER)
    assert len(page_1) == 25 and len(codes_on(page_2.text)) == 2 and not set(page_1) & set(codes_on(page_2.text))
    assert "Trang 2/2" in page_2.text and "27 dòng" in page_2.text
    for raw in ("0", "abc", "-4", "999999", "1.5"):
        response = client.get(f"/orders?page={raw}", headers=MANAGER)
        assert response.status_code == 200 and codes_on(response.text), raw
    assert codes_on(client.get("/orders?page=999999", headers=MANAGER).text) == codes_on(page_2.text)
    html = client.get("/orders?status=NEW&page=1", headers=MANAGER).text
    assert 'rel="next"' in html and "status=NEW" in html and "page=2" in html


def test_empty_order_list_has_an_empty_state(client, db):
    html = client.get("/orders?q=khong-co", headers=MANAGER).text
    assert 'class="empty"' in html and "<table" not in html


def test_export_only_holds_the_callers_rows(client, db):
    add_order(db, customer="Trần Thị Mai", phone="0911111111", address="Số 1, Tân Cương", total=250000, n=300)
    add_order(db, customer="Lê Văn Hùng", status="DONE", n=301)
    add_order(db, htx="LB", customer="Khách HTX khác", phone="0999999999", address="Địa chỉ LB", n=302)
    response = client.get("/orders/export.csv", headers=MANAGER)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    disposition = response.headers["content-disposition"]
    assert disposition.startswith('attachment; filename="tea-shop-TC-don-hang-') and disposition.endswith('.csv"')
    assert response.content.startswith(b"\xef\xbb\xbf") and b"\r\n" in response.content
    rows = list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert rows[0] == ["Mã đơn", "Đặt lúc", "Khách", "Số điện thoại", "Địa chỉ", "Tổng tiền", "Trạng thái"]
    assert len(rows) == 3
    mai = next(r for r in rows if r[0] == code_for(300))
    assert mai[2:] == ["Trần Thị Mai", "0911111111", "Số 1, Tân Cương", "250000", "Mới"]
    assert re.fullmatch(r"\d\d/\d\d/\d{4} \d\d:\d\d", mai[1])
    text = response.text
    assert "Khách HTX khác" not in text and "0999999999" not in text and "Địa chỉ LB" not in text
    filtered = client.get("/orders/export.csv?status=DONE", headers=MANAGER).content.decode("utf-8-sig")
    assert "Lê Văn Hùng" in filtered and "Trần Thị Mai" not in filtered
    assert "Trần Thị Mai" in client.get("/orders/export.csv?q=mai", headers=MANAGER).content.decode("utf-8-sig")
    assert code_for(302) in client.get("/orders/export.csv", headers=OTHER_MANAGER).content.decode("utf-8-sig")
    assert code_for(300) not in client.get("/orders/export.csv", headers=OTHER_MANAGER).content.decode("utf-8-sig")


def test_export_escapes_formula_cells(client, db):
    add_order(db, customer="=SUM(1)", address="@cmd", n=310)
    add_order(db, customer='=HYPERLINK("http://x","y")', address="+1", n=311)
    rows = list(csv.reader(io.StringIO(client.get("/orders/export.csv", headers=MANAGER).content.decode("utf-8-sig"))))
    cells = {c for r in rows[1:] for c in r}
    assert "'=SUM(1)" in cells and "'@cmd" in cells and "'+1" in cells
    assert not [c for c in cells if c[:1] in "=+@-"]


def test_delivery_note_prints_the_order(client, db):
    order_id = add_order(db, customer="Trần Thị Mai", phone="0912345678", address="12 Đường Chè, Thái Nguyên", total=330000,
                         n=320, items=[("Chè Tân Cương móc câu", "Gói 200g", 150000, 2), ("Trà sen", "Hộp 100g", 30000, 1)])
    response = client.get(f"/orders/{order_id}/print?theme=dark", headers=MANAGER)
    assert response.status_code == 200
    html = response.text
    for text in (code_for(320), "Trần Thị Mai", "0912345678", "12 Đường Chè, Thái Nguyên", "Chè Tân Cương móc câu",
                 "Trà sen", "330.000 ₫", "Thanh toán khi nhận hàng", "print-sheet", "no-print", "/manager/apps/tea-shop/"):
        assert text in html, text
    assert "<script" not in html and "style=" not in html
    detail = client.get(f"/orders/{order_id}", headers=MANAGER).text
    assert f'href="/apps/tea-shop/orders/{order_id}/print?theme=' not in detail  # no theme was asked for
    assert f'/orders/{order_id}/print"' in detail and 'target="_top"' in detail
    assert client.get(f"/orders/{order_id}/print", headers=OTHER_MANAGER).status_code == 404
    assert client.get(f"/orders/{uuid.uuid4()}/print", headers=MANAGER).status_code == 404
    assert client.get(f"/orders/{order_id}/print", headers=FARMER).status_code == 403
    assert client.get(f"/orders/{order_id}/print").status_code == 401


def test_new_routes_check_role_and_claims(client, db):
    order_id = uuid.uuid4()
    for path in ("/orders", "/orders/export.csv", "/products", f"/orders/{order_id}/print"):
        for headers in ({}, {"Authorization": "Bearer not-a-jwt"}):
            assert client.get(path, headers=headers).status_code == 401, path
        assert client.get(path, headers=FARMER).status_code == 403, path
        assert client.get(path, headers=bearer(htx="")).status_code == 403, path


def test_product_list_filters_and_paging(client, db):
    add_product(db, name="Chè Tân Cương móc câu", stock=20)
    add_product(db, name="Trà sen", stock=5)
    add_product(db, name="Trà ướp lài", stock=6)
    add_product(db, name="Chè cũ", stock=0, active=False)
    add_product(db, name="Chè ngừng còn ít", stock=2, active=False)
    add_product(db, htx="LB", name="Của HTX khác", stock=1)

    def listed(query):
        response = client.get(f"/products{query}", headers=MANAGER)
        assert response.status_code == 200, query
        return set(re.findall(r'data-label="Sản phẩm"><a href="[^"]*">(.*?)</a>', response.text))

    everything = {"Chè Tân Cương móc câu", "Trà sen", "Trà ướp lài", "Chè cũ", "Chè ngừng còn ít"}
    assert listed("") == everything and listed("?show=all") == everything and listed("?show=bogus") == everything
    assert listed("?show=active") == {"Chè Tân Cương móc câu", "Trà sen", "Trà ướp lài"}
    assert listed("?show=hidden") == {"Chè cũ", "Chè ngừng còn ít"}
    assert listed("?show=low") == {"Trà sen"}  # active and stock 5 or less, like the overview figure
    assert listed("?q=trà") == {"Trà sen", "Trà ướp lài"} and listed("?q=trà&show=low") == {"Trà sen"}
    assert listed("?q=HTX") == set()
    for i in range(27):
        add_product(db, name=f"Hàng loạt {i:02d}")
    assert len(re.findall(r'data-label="Sản phẩm"', client.get("/products", headers=MANAGER).text)) == 25
    for raw in ("0", "abc", "999999"):
        assert client.get(f"/products?page={raw}", headers=MANAGER).status_code == 200, raw
    html = client.get("/products?page=2", headers=MANAGER).text
    assert "Trang 2/2" in html and 'data-label="Sản phẩm"' in html


def test_product_list_offers_edit_and_empty_state(client, db):
    assert 'class="empty"' in client.get("/products", headers=MANAGER).text
    product = add_product(db, name="Trà sen")
    html = client.get("/products", headers=MANAGER).text
    assert f'href="/apps/tea-shop/products/{product}/edit"' in html and "Đang bán" in html


def test_public_page_shows_cards_without_personal_data(client, db):
    add_product(db, name="Chè Tân Cương móc câu", stock=5, price_vnd=150000, lot_code="LOT-1")
    add_product(db, name="Ngừng bán", active=False)
    add_product(db, htx="LB", name="Của HTX khác")
    add_order(db, customer="Trần Thị Mai", phone="0912345678", address="Địa chỉ riêng", n=330)
    html = client.get("/public/TC").text
    assert 'class="cards"' in html and html.count('class="card"') == 1
    assert "Chè Tân Cương móc câu" in html and "150.000 ₫" in html and 'href="/lot/LOT-1"' in html
    for secret in ("Ngừng bán", "Của HTX khác", "Trần Thị Mai", "0912345678", "Địa chỉ riêng"):
        assert secret not in html
    assert 'aria-label="Đặt hàng"' in html and 'name="quantity"' in html and 'name="customer_name"' in html
    assert 'name="phone"' in html and 'name="address"' in html


@pytest.mark.parametrize("status,current", [("NEW", 0), ("CONFIRMED", 1), ("SHIPPING", 2), ("DONE", 3)])
def test_tracking_shows_the_status_steps(client, db, status, current):
    add_order(db, status=status, phone="0912345678", n=340)
    html = client.get(f"/public/TC/order?code={code_for(340)}&phone=0912345678").text
    labels = ["Mới", "Đã xác nhận", "Đang giao", "Hoàn tất"]
    assert re.findall(r"<li[^>]*>(.*?)</li>", html.split('<ol class="steps">')[1].split("</ol>")[0]) == labels
    assert re.findall(r'<li aria-current="step">(.*?)</li>', html) == [labels[current]]
    assert html.count('data-state="done"') == current


def test_tracking_cancelled_order_shows_a_pill_instead_of_steps(client, db):
    add_order(db, status="CANCELLED", n=341)
    html = client.get(f"/public/TC/order?code={code_for(341)}&phone=0912345678").text
    assert 'class="steps"' not in html and '<span class="pill">Đã huỷ</span>' in html


def test_new_pages_keep_the_theme_and_have_no_script_or_style(client, db):
    order_id = add_order(db, n=350, items=[("Trà sen", "Hộp", 10000, 1)])
    for theme in ("light", "dark"):
        for path in ("/", "/orders", "/products", f"/orders/{order_id}/print", f"/orders/{order_id}"):
            response = client.get(f"{path}?theme={theme}", headers=MANAGER)
            assert response.status_code == 200, path
            page = response.text
            assert f'<html lang="vi" data-theme="{theme}">' in page, path
            for target in re.findall(r'(?:action|href)="(/apps/tea-shop[^"]*)"', page):
                assert target.endswith(f"theme={theme}"), (path, target)
    pages = [client.get(p, headers=MANAGER).text for p in ("/", "/orders", "/products", f"/orders/{order_id}/print")]
    pages += [client.get("/public/TC").text, client.get(f"/public/TC/order?code={code_for(350)}&phone=0912345678").text]
    for page in pages:
        assert "<script" not in page and "style=" not in page


def test_filter_form_keeps_the_theme_and_the_values(client, db):
    html = client.get("/orders?theme=dark&q=Mai&status=DONE&from=2026-11-01&to=2026-11-13", headers=MANAGER).text
    assert '<form class="toolbar" method="get"' in html and 'name="theme" value="dark"' in html
    assert 'value="Mai"' in html and 'value="2026-11-01"' in html and 'value="2026-11-13"' in html
    assert re.search(r'<option value="DONE" selected>', html)


def test_order_detail_has_steps_and_keeps_its_contract(client, db):
    place(client, [(add_product(db, stock=5), 1)])
    order_id = db.execute("SELECT id FROM orders").fetchone()[0]
    html = client.get(f"/orders/{order_id}", headers=MANAGER).text
    assert "Xác nhận đơn" in html and 'class="steps"' in html and "Tổng quan" in html
    assert order_code(place(client, [(add_product(db, stock=5), 1)]))


def test_edited_product_notice_shows_on_the_overview(client, db):
    assert "Đã lưu sản phẩm." in client.get("/?notice=saved", headers=MANAGER).text
    assert "Đã lưu sản phẩm." not in client.get("/?notice=%3Cb%3E", headers=MANAGER).text
