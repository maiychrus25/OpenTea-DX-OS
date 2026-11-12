# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
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
