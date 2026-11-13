# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import re
import threading
from datetime import datetime, timedelta, timezone

import pytest
from conftest import add_item, add_request, add_round, bearer
from fastapi.testclient import TestClient

from farm_supply import core_client, main, store
from farm_supply.core_client import Household

MANAGER = bearer()
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nông hộ Một")
PAST = datetime.now(timezone.utc) - timedelta(days=1)
HOUSEHOLD = Household(id="h1", name="Hộ ông Ba", keycloak_user_id="kc-farmer-1")


@pytest.fixture
def client(db):
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as test_client:
        yield test_client


@pytest.fixture
def households(monkeypatch):
    """Hasura stand-in: a farmer token sees only its own household, a manager token sees the HTX's."""
    calls = []

    def fake(authorization, role="manager"):
        calls.append(role)
        return [HOUSEHOLD] if role == "farmer" else [HOUSEHOLD, Household(id="h2", name="Hộ bà Tư", keycloak_user_id=None)]

    monkeypatch.setattr(core_client, "list_households", fake)
    return calls


def register(client, round_id, headers=FARMER, **quantities):
    return client.post(f"/mine/rounds/{round_id}", headers=headers,
                       data={f"q_{item}": value for item, value in quantities.items()})


def requests_of(db, household="h1"):
    return db.execute("SELECT item_id, quantity FROM requests WHERE household_id = %s", (household,)).fetchall()


def test_register_and_change_quantity_before_deadline(client, db, households):
    round_id = add_round(db)
    item = add_item(db, round_id)
    first = register(client, round_id, **{str(item): "2"})
    assert first.status_code == 303 and first.headers["location"].startswith("/apps/farm-supply/mine")
    assert requests_of(db) == [(item, 2)]
    register(client, round_id, **{str(item): "3,5"})
    assert requests_of(db) == [(item, 3.5)]
    register(client, round_id, **{str(item): ""})  # an empty quantity removes the request
    assert requests_of(db) == []


def test_register_after_deadline_is_refused(client, db, households):
    round_id = add_round(db, deadline=PAST)
    item = add_item(db, round_id)
    response = register(client, round_id, **{str(item): "2"})
    assert response.status_code == 409 and "Đợt đăng ký đã đóng." in response.text
    assert requests_of(db) == []


def test_register_on_closed_round_is_refused(client, db, households):
    round_id = add_round(db, status="CLOSED")
    item = add_item(db, round_id)
    add_request(db, round_id, item, quantity=1)
    response = register(client, round_id, **{str(item): "4"})
    assert response.status_code == 409 and "Đợt đăng ký đã đóng." in response.text
    assert requests_of(db) == [(item, 1)]  # neither changed nor removed
    assert register(client, round_id, **{str(item): ""}).status_code == 409
    assert requests_of(db) == [(item, 1)]


def test_close_while_registering_is_consistent(db, app_db_url):
    """Real threads and connections: whenever a register wins it is settled, so nothing is written after the close."""
    for attempt in range(25):
        round_id = add_round(db)
        item = add_item(db, round_id)
        barrier = threading.Barrier(2)
        outcome = {}

        def closer():
            with store.connect(app_db_url) as conn:
                barrier.wait()
                outcome["close"] = store.close_round(conn, "TC", round_id)

        def registrar():
            with store.connect(app_db_url) as conn:
                barrier.wait()
                outcome["register"] = store.register(conn, "TC", round_id, "h1", "Hộ ông Ba", {item: 2})

        threads = [threading.Thread(target=closer), threading.Thread(target=registrar)]
        [t.start() for t in threads]
        [t.join(20) for t in threads]
        assert not any(t.is_alive() for t in threads)
        registered = db.execute("SELECT count(*) FROM requests WHERE round_id = %s", (round_id,)).fetchone()[0]
        settled = db.execute("SELECT count(*) FROM settlements WHERE round_id = %s", (round_id,)).fetchone()[0]
        assert db.execute("SELECT status FROM rounds WHERE id = %s", (round_id,)).fetchone()[0] == "CLOSED"
        assert registered == settled, f"attempt {attempt}: a request was written after the close"
        assert (registered == 1) == (outcome["register"] is None), outcome


def test_household_comes_from_token_not_form(client, db, households):
    round_id = add_round(db)
    item = add_item(db, round_id)
    response = client.post(f"/mine/rounds/{round_id}", headers=FARMER,
                           data={f"q_{item}": "1", "household_id": "h2", "household_name": "Kẻ giả mạo"})
    assert response.status_code == 303
    assert households == ["farmer"]
    assert db.execute("SELECT household_id, household_name FROM requests").fetchall() == [("h1", "Hộ ông Ba")]


def test_item_with_requests_cannot_change(client, db, households):
    round_id = add_round(db)
    free, taken = add_item(db, round_id, name="Urê"), add_item(db, round_id, name="Kali")
    add_request(db, round_id, taken)
    ok = client.post(f"/items/{free}/edit", headers=MANAGER, data={"name": "Urê 46", "unit": "bao", "price_vnd": "500000"})
    assert ok.status_code == 303 and ok.headers["location"] == f"/apps/farm-supply/rounds/{round_id}?notice=saved"
    refused = client.post(f"/items/{taken}/edit", headers=MANAGER, data={"name": "Đổi", "unit": "kg", "price_vnd": "1"})
    assert refused.status_code == 409 and "đã có hộ đăng ký" in refused.text
    assert db.execute("SELECT name, price_vnd FROM items WHERE id = %s", (taken,)).fetchone() == ("Kali", 400000)
    assert db.execute("SELECT name, price_vnd FROM items WHERE id = %s", (free,)).fetchone() == ("Urê 46", 500000)
    added = client.post(f"/rounds/{round_id}/items", headers=MANAGER, data={"name": "Lân", "unit": "bao", "price_vnd": "300000"})
    assert added.status_code == 303
    store.close_round(db, "TC", round_id)
    late = client.post(f"/rounds/{round_id}/items", headers=MANAGER, data={"name": "Muộn", "unit": "bao", "price_vnd": "1"})
    assert late.status_code == 409


def test_summary_by_item_and_household(client, db, households):
    round_id = add_round(db)
    npk, ure = add_item(db, round_id, name="NPK", price_vnd=400000), add_item(db, round_id, name="Urê", price_vnd=333)
    add_request(db, round_id, npk, household_id="h1", household_name="Hộ ông Ba", quantity=2.5)
    add_request(db, round_id, ure, household_id="h1", household_name="Hộ ông Ba", quantity=1.5)  # 499.5 -> 500
    add_request(db, round_id, npk, household_id="h2", household_name="Hộ bà Tư", quantity=1)
    page = client.get(f"/rounds/{round_id}", headers=MANAGER).text
    assert '<td role="cell" data-label="Tổng số lượng">3.5</td>' in page  # NPK: 2.5 + 1
    assert "1.400.000 ₫" in page  # NPK total
    assert 'data-label="Thành tiền">500 ₫</td>' in page  # round(1.5 * 333)
    assert "1.000.500 ₫" in page  # household h1: 1.000.000 + 500
    assert "400.000 ₫" in page  # household h2
    assert {h.household_id: h.amount_vnd for h in store.household_summary(db, "TC", round_id)} == {"h1": 1000500, "h2": 400000}


def test_marks_only_on_closed_round(client, db, households):
    round_id = add_round(db)
    item = add_item(db, round_id)
    add_request(db, round_id, item)
    open_try = client.post(f"/rounds/{round_id}/settlements/h1/delivered", headers=MANAGER)
    assert open_try.status_code == 409
    assert db.execute("SELECT count(*) FROM settlements").fetchone()[0] == 0
    assert client.post(f"/rounds/{round_id}/close", headers=MANAGER).status_code == 303
    assert client.post(f"/rounds/{round_id}/settlements/h1/delivered", headers=MANAGER).status_code == 303
    assert client.post(f"/rounds/{round_id}/settlements/h1/paid", headers=MANAGER).status_code == 303
    delivered, paid = db.execute("SELECT delivered_at, paid_at FROM settlements WHERE household_id = 'h1'").fetchone()
    assert delivered and paid
    assert client.post(f"/rounds/{round_id}/settlements/h9/paid", headers=MANAGER).status_code == 409  # never registered
    assert client.post(f"/rounds/{round_id}/settlements/h1/refund", headers=MANAGER).status_code == 404
    reopen = register(client, round_id, **{str(item): "9"})
    assert reopen.status_code == 409 and requests_of(db) == [(item, 2)]


def test_quantity_accepts_comma():
    assert main.parse_quantity("2,5") == main.parse_quantity("2.5") == 2.5
    assert main.parse_quantity("") == 0 and main.parse_quantity("  ") == 0
    for bad in ("-1", "abc", "1.25", "10000,1", "1e3", "٣", "1,2,3"):
        assert main.parse_quantity(bad) is None, bad


def test_other_htx_gets_404(client, db, households):
    other_round = add_round(db, htx="LB", title="Đợt của La Bằng")
    other_item = add_item(db, other_round, htx="LB")
    assert "Đợt của La Bằng" not in client.get("/", headers=MANAGER).text
    assert client.get(f"/rounds/{other_round}", headers=MANAGER).status_code == 404
    for path in (f"/rounds/{other_round}/close", f"/rounds/{other_round}/settlements/h1/paid"):
        assert client.post(path, headers=MANAGER).status_code == 404, path
    assert client.post(f"/rounds/{other_round}/items", headers=MANAGER,
                       data={"name": "x", "unit": "kg", "price_vnd": "1"}).status_code == 404
    assert client.post(f"/items/{other_item}/edit", headers=MANAGER,
                       data={"name": "x", "unit": "kg", "price_vnd": "1"}).status_code == 404
    assert register(client, other_round, **{str(other_item): "1"}).status_code == 404
    assert db.execute("SELECT status FROM rounds").fetchone()[0] == "OPEN" and requests_of(db) == []
    # An item id of another round or HTX inside the form is ignored, never written.
    mine = add_round(db)
    add_item(db, mine)
    register(client, mine, **{str(other_item): "1"})
    assert requests_of(db) == []


def test_farmer_cannot_open_manager_pages(client, db, households):
    round_id = add_round(db)
    assert client.get("/", headers=FARMER).status_code == 403
    assert client.get(f"/rounds/{round_id}", headers=FARMER).status_code == 403
    assert client.post(f"/rounds/{round_id}/close", headers=FARMER).status_code == 403
    assert client.get("/mine", headers=MANAGER).status_code == 403
    assert client.get("/", headers=bearer(htx="")).status_code == 403
    assert client.get("/").status_code == 401
    assert db.execute("SELECT status FROM rounds").fetchone()[0] == "OPEN"


def test_farmer_without_household_gets_notice(client, db, monkeypatch):
    round_id = add_round(db)
    item = add_item(db, round_id)
    monkeypatch.setattr(core_client, "list_households", lambda authorization, role="manager": [])
    page = client.get("/mine", headers=FARMER)
    assert page.status_code == 200 and "chưa được gắn với nông hộ nào" in page.text
    assert register(client, round_id, **{str(item): "1"}).status_code == 409
    assert requests_of(db) == []


def test_pages_escape_html(client, db, households):
    round_id = add_round(db, title="<script>alert(1)</script>")
    item = add_item(db, round_id, name="<b>x</b>", unit="<i>")
    add_request(db, round_id, item, household_name="<u>hộ</u>")
    for path, headers in ((f"/rounds/{round_id}", MANAGER), ("/", MANAGER), ("/mine", FARMER)):
        html = client.get(path, headers=headers).text
        assert "<script>alert" not in html and "<b>x</b>" not in html and "<u>hộ</u>" not in html, path
    assert "&lt;b&gt;x&lt;/b&gt;" in client.get(f"/rounds/{round_id}", headers=MANAGER).text


def test_busy_database_answers_503(client, db, households, monkeypatch):
    monkeypatch.setattr(main, "DB_WAIT_S", 0.05)
    taken = [main.DB_SLOTS.acquire(blocking=False) for _ in range(main.DB_MAX_CONNECTIONS)]
    try:
        assert all(taken)
        result = {}
        request = threading.Thread(target=lambda: result.update(response=client.get("/", headers=MANAGER)), daemon=True)
        request.start()
        request.join(5)
        assert not request.is_alive()
        assert result["response"].status_code == 503 and "bận" in result["response"].text
    finally:
        for _ in taken:
            main.DB_SLOTS.release()
    assert client.get("/", headers=MANAGER).status_code == 200


def test_create_round_keeps_theme_and_vietnam_time(client, db, households):
    response = client.post("/rounds?theme=dark", headers=MANAGER, data={"title": "Thuốc BVTV", "deadline": "2030-05-01T07:30"})
    assert response.status_code == 303
    row = db.execute("SELECT id, deadline FROM rounds").fetchone()
    assert row[1] == datetime(2030, 5, 1, 0, 30, tzinfo=timezone.utc)
    assert response.headers["location"] == f"/apps/farm-supply/rounds/{row[0]}?theme=dark"
    page = client.get(f"/rounds/{row[0]}?theme=dark", headers=MANAGER).text
    assert '<html lang="vi" data-theme="dark">' in page and "01/05/2030 07:30" in page
    bad = client.post("/rounds", headers=MANAGER, data={"title": "", "deadline": "2001-01-01T00:00"})
    assert bad.status_code == 400 and 'role="alert"' in bad.text


def test_bad_quantity_writes_nothing_and_keeps_typed_value(client, db, households):
    round_id = add_round(db)
    good, other = add_item(db, round_id, name="A"), add_item(db, round_id, name="B")
    response = register(client, round_id, **{str(good): "2", str(other): "abc"})
    assert response.status_code == 400 and 'role="alert"' in response.text and 'value="abc"' in response.text
    assert requests_of(db) == []


# ---------- App kit: overview, round list, exports, print, inline item errors, farmer cards ----------

def stat(html, label):
    found = re.search(rf'<span class="stat-label">{re.escape(label)}</span>\s*<span class="stat-value">([^<]*)</span>', html)
    assert found, f"no stat {label!r}"
    return found.group(1)


def settle(db, round_id, household, delivered=False, paid=False, htx="TC"):
    db.execute("INSERT INTO settlements (htx_code, round_id, household_id, delivered_at, paid_at) VALUES "
               "(%s, %s, %s, CASE WHEN %s THEN now() END, CASE WHEN %s THEN now() END)",
               (htx, round_id, household, delivered, paid))


def test_overview_stats_on_a_fixed_set(client, db, households):
    open_round = add_round(db, title="Phân bón vụ xuân 2027")
    npk = add_item(db, open_round, price_vnd=400000)
    ure = add_item(db, open_round, name="Urê", price_vnd=10000)
    add_request(db, open_round, npk, household_id="h1", quantity=2)
    add_request(db, open_round, ure, household_id="h1", quantity=5)
    add_request(db, open_round, npk, household_id="h2", household_name="Hộ bà Tư", quantity=1)
    closed = add_round(db, title="Đợt cũ", status="CLOSED", deadline=PAST)
    old = add_item(db, closed)
    for household in ("h1", "h2", "h3"):
        add_request(db, closed, old, household_id=household, quantity=1)
    settle(db, closed, "h1", delivered=True, paid=True)
    settle(db, closed, "h2", delivered=True)
    settle(db, closed, "h3")
    other = add_round(db, htx="LB", title="Đợt của La Bằng")
    add_request(db, other, add_item(db, other, htx="LB"), htx="LB", household_id="h9", quantity=9)
    html = client.get("/", headers=MANAGER).text
    assert stat(html, "Đợt đang mở") == "1"
    assert stat(html, "Hộ đã đăng ký") == "2"
    assert stat(html, "Tổng tiền đăng ký") == "1.250.000 ₫"  # 2 * 400000 + 5 * 10000 + 1 * 400000
    assert stat(html, "Chưa giao") == "1"
    assert stat(html, "Chưa thu tiền") == "2"
    assert "Đợt của La Bằng" not in html and 'aria-current="page"' in html and "Đợt đăng ký" in html


def test_round_list_filters_and_pages(client, db, households):
    for n in range(28):
        add_round(db, title=f"Đợt mở {n:02d}")
    for n in range(2):
        add_round(db, title=f"Đợt đóng {n}", status="CLOSED", deadline=PAST)
    add_round(db, htx="LB", title="Đợt của La Bằng")
    everything = client.get("/", headers=MANAGER).text
    assert everything.count('href="/apps/farm-supply/rounds/') == 25
    assert "Trang 1/2" in everything and "30 dòng" in everything
    assert client.get("/?page=2", headers=MANAGER).text.count('href="/apps/farm-supply/rounds/') == 5
    closed = client.get("/?status=closed", headers=MANAGER).text
    assert closed.count('href="/apps/farm-supply/rounds/') == 2 and "Đợt đóng" in closed and "Đợt mở" not in closed
    opened = client.get("/?status=open&page=2", headers=MANAGER).text
    assert opened.count('href="/apps/farm-supply/rounds/') == 3 and "status=open" in opened
    for query in ("page=0", "page=abc", "page=999999", "status=%25", "status=x'%3B--", "page=-3"):
        assert client.get(f"/?{query}", headers=MANAGER).status_code == 200, query
    assert client.get("/?page=999999", headers=MANAGER).text.count("Trang 2/2") == 1


def test_exports_hold_the_round_totals(client, db, households):
    round_id = add_round(db)
    npk = add_item(db, round_id, name="Phân NPK 16-16-8, bao 50 kg", unit="bao", price_vnd=400000)
    add_request(db, round_id, npk, household_id="h1", household_name="=HYPERLINK(\"http://x\")", quantity=2.5)
    add_request(db, round_id, npk, household_id="h2", household_name="Hộ bà Tư", quantity=1)
    store.close_round(db, "TC", round_id)
    store.mark(db, "TC", round_id, "h2", "delivered")
    items = client.get(f"/rounds/{round_id}/items/export.csv", headers=MANAGER)
    assert items.status_code == 200 and items.headers["content-type"].startswith("text/csv")
    assert items.headers["content-disposition"].startswith('attachment; filename="farm-supply-TC-items-')
    assert items.content.startswith("﻿".encode())
    lines = items.content.decode("utf-8-sig").split("\r\n")
    assert lines[0] == "Mặt hàng,Đơn vị,Đơn giá,Số hộ,Tổng số lượng,Thành tiền"
    assert lines[1] == '"Phân NPK 16-16-8, bao 50 kg",bao,400000,2,3.5,1400000'
    households_csv = client.get(f"/rounds/{round_id}/households/export.csv", headers=MANAGER)
    lines = households_csv.content.decode("utf-8-sig").split("\r\n")
    assert lines[0] == "Hộ,Thành tiền,Đã giao,Đã trả tiền"
    formula = next(line for line in lines if "HYPERLINK" in line)
    marked = next(line for line in lines if line.startswith("Hộ bà Tư"))
    assert formula.startswith("\"'=HYPERLINK(") and formula.endswith(",1000000,,")  # neutralised, nothing marked
    assert marked.startswith("Hộ bà Tư,400000,") and marked.count(",") == 3 and not marked.endswith(",,")


def test_export_only_holds_the_callers_rows(client, db, households):
    mine = add_round(db)
    add_request(db, mine, add_item(db, mine, name="Của TC"), household_id="h1", household_name="Hộ của TC")
    other = add_round(db, htx="LB", title="Đợt của La Bằng")
    add_request(db, other, add_item(db, other, htx="LB", name="Của LB"), htx="LB", household_id="h9", household_name="Hộ của LB")
    for kind in ("items", "households"):
        body = client.get(f"/rounds/{mine}/{kind}/export.csv", headers=MANAGER).text
        assert "LB" not in body.replace("farm-supply", "") and ("Của TC" in body or "Hộ của TC" in body)
        assert client.get(f"/rounds/{other}/{kind}/export.csv", headers=MANAGER).status_code == 404
    assert client.get(f"/rounds/{other}/print", headers=MANAGER).status_code == 404


def test_farmer_cannot_reach_manager_exports_or_print(client, db, households):
    round_id = add_round(db)
    for path in (f"/rounds/{round_id}/items/export.csv", f"/rounds/{round_id}/households/export.csv", f"/rounds/{round_id}/print"):
        assert client.get(path, headers=FARMER).status_code == 403, path
        assert client.get(path).status_code == 401, path


def test_print_sheet_lists_households_with_signature_column(client, db, households):
    round_id = add_round(db)
    npk = add_item(db, round_id, name="Phân NPK 16-16-8, bao 50 kg", unit="bao", price_vnd=400000)
    add_request(db, round_id, npk, household_id="h1", household_name="Nguyễn Văn An", quantity=2.5)
    add_request(db, round_id, npk, household_id="h2", household_name="Lê Thị Hoa", quantity=1)
    response = client.get(f"/rounds/{round_id}/print", headers=MANAGER)
    html = response.text
    assert response.status_code == 200 and "print-sheet" in html and "Ký nhận" in html
    assert "Nguyễn Văn An" in html and "Lê Thị Hoa" in html and "2,5 bao" in html and "1.000.000 ₫" in html
    assert 'target="_top"' in html and "/manager/apps/farm-supply/rounds/" in html
    assert client.get("/rounds/00000000-0000-0000-0000-000000000000/print", headers=MANAGER).status_code == 404


def test_item_errors_show_inline_with_typed_values(client, db, households):
    round_id = add_round(db)
    existing = add_item(db, round_id, name="Urê", unit="bao", price_vnd=500000)
    added = client.post(f"/rounds/{round_id}/items", headers=MANAGER, data={"name": "", "unit": "bao 50kg", "price_vnd": "abc"})
    assert added.status_code == 400 and 'class="field-error"' in added.text
    assert "Tên mặt hàng cần từ 1 đến 120 ký tự." in added.text and "Đơn giá phải là số đồng" in added.text
    assert 'value="bao 50kg"' in added.text and 'value="abc"' in added.text
    assert 'action="/apps/farm-supply/rounds/' in added.text and "Thêm mặt hàng" in added.text  # the form is back
    edited = client.post(f"/items/{existing}/edit", headers=MANAGER, data={"name": "Urê đổi", "unit": "", "price_vnd": "-5"})
    assert edited.status_code == 400 and "Đơn vị tính cần từ 1 đến 20 ký tự." in edited.text
    assert 'value="Urê đổi"' in edited.text and 'value="-5"' in edited.text
    assert db.execute("SELECT name, price_vnd FROM items").fetchall() == [("Urê", 500000)]
    assert client.get(f"/rounds/{round_id}", headers=MANAGER).text.count('class="field-error"') == 0


def test_farmer_sees_cards_and_history_with_totals(client, db, households):
    open_round = add_round(db, title="Phân bón vụ xuân 2027")
    npk = add_item(db, open_round, price_vnd=400000)
    add_request(db, open_round, npk, quantity=2.5)
    for n in range(30):
        past = add_round(db, title=f"Đợt cũ {n:02d}", status="CLOSED", deadline=PAST - timedelta(days=n))
        add_request(db, past, add_item(db, past, price_vnd=1000), quantity=3)
    html = client.get("/mine", headers=FARMER).text
    assert '<li class="card">' in html and "Phân bón vụ xuân 2027" in html and "1.000.000 ₫" in html
    assert html.count("3.000 ₫") == 25 and "Trang 1/2" in html
    second = client.get("/mine?page=2", headers=FARMER).text
    assert second.count("3.000 ₫") == 5 and "Đợt cũ 29" in second
    for query in ("page=0", "page=abc", "page=999999"):
        assert client.get(f"/mine?{query}", headers=FARMER).status_code == 200, query
    assert 'aria-current="page"' in html and "Đăng ký vật tư" in html


def test_pages_have_no_script_or_style_attribute(client, db, households):
    round_id = add_round(db)
    add_request(db, round_id, add_item(db, round_id))
    bad = client.post(f"/rounds/{round_id}/items", headers=MANAGER, data={"name": "", "unit": "", "price_vnd": ""})
    pages = [client.get(p, headers=h) for p, h in (("/", MANAGER), (f"/rounds/{round_id}", MANAGER),
                                                    (f"/rounds/{round_id}/print", MANAGER), ("/mine", FARMER))] + [bad]
    for response in pages:
        assert "<script" not in response.text and " style=" not in response.text
