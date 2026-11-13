# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import re
import threading
from decimal import Decimal
from urllib.parse import urlsplit

import pytest
from conftest import add_grade, add_ticket, bearer
from fastapi.testclient import TestClient

from leaf_purchase import core_client, main
from leaf_purchase.core_client import CoreError, Household

OFFICER = bearer(sub="kc-officer-1", roles=("officer",), name="Cán bộ Một")
MANAGER = bearer()
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nông hộ Một")
HOUSEHOLDS = [Household(id="h1", name="Hộ ông Ba", keycloak_user_id="kc-farmer-1"),
              Household(id="h2", name="Hộ bà Tư", keycloak_user_id=None)]


@pytest.fixture
def client(db):
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as test_client:
        yield test_client


@pytest.fixture
def households(monkeypatch):
    calls = []

    def fake(authorization, role):
        calls.append(role)
        return HOUSEHOLDS if role != "farmer" else HOUSEHOLDS[:1]

    monkeypatch.setattr(core_client, "list_households", fake)
    return calls


def form(grade_id, **fields):
    return {"household": "h1", "weighed_on": "2030-05-02", "grade": str(grade_id), "kg": "12,5", **fields}


def test_officer_writes_a_ticket_and_sees_the_daily_total(client, db, households):
    grade = add_grade(db, price_vnd=8000)
    response = client.post("/tickets", headers=OFFICER, data=form(grade))
    assert response.status_code == 303
    location = urlsplit(response.headers["location"])
    assert location.path.startswith("/apps/leaf-purchase/") and "day=2030-05-02" in location.query
    assert households == ["officer"]
    assert db.execute("SELECT kg, amount_vnd, household_name, created_by FROM tickets").fetchone() == (
        Decimal("12.5"), 100000, "Hộ ông Ba", "kc-officer-1")
    html = client.get("/?day=2030-05-02", headers=OFFICER).text
    assert "Hộ ông Ba" in html and "100.000 ₫" in html and "12,5" in html
    assert '<link rel="stylesheet" href="/dxos-app.css">' in html


def test_forged_household_is_rejected(client, db, households):
    grade = add_grade(db)
    response = client.post("/tickets", headers=OFFICER, data=form(grade, household="h999"))
    assert response.status_code == 400 and 'role="alert"' in response.text
    assert db.execute("SELECT count(*) FROM tickets").fetchone()[0] == 0


def test_bad_input_is_a_400_with_a_message(client, db, households):
    grade = add_grade(db)
    other_grade = add_grade(db, htx="LB", name="Loại LB")
    for bad in (form(grade, kg="abc"), form(grade, kg="0"), form(grade, weighed_on="2030-13-40"),
                form(grade, grade="nope"), form(other_grade)):
        assert client.post("/tickets", headers=OFFICER, data=bad).status_code == 400, bad
    assert db.execute("SELECT count(*) FROM tickets").fetchone()[0] == 0


def test_core_down_blocks_writing_but_shows_the_page(client, db, monkeypatch):
    grade = add_grade(db)
    monkeypatch.setattr(core_client, "list_households", lambda a, r: (_ for _ in ()).throw(CoreError("down")))
    assert "nông hộ" in client.get("/", headers=OFFICER).text
    assert client.post("/tickets", headers=OFFICER, data=form(grade)).status_code == 400


def test_edit_and_void_through_the_pages(client, db, households):
    grade = add_grade(db, price_vnd=8000)
    ticket_id = add_ticket(db, grade)
    page = client.get(f"/tickets/{ticket_id}/edit", headers=OFFICER)
    assert page.status_code == 200 and "Hộ ông Ba" in page.text
    assert client.post(f"/tickets/{ticket_id}/edit", headers=OFFICER, data=form(grade, kg="20")).status_code == 303
    assert db.execute("SELECT kg, amount_vnd FROM tickets").fetchone() == (Decimal("20.0"), 160000)
    assert client.post(f"/tickets/{ticket_id}/void", headers=OFFICER).status_code == 303
    assert db.execute("SELECT voided FROM tickets").fetchone()[0] is True


def test_closed_ticket_pages_answer_409(client, db, households):
    grade = add_grade(db)
    ticket_id = add_ticket(db, grade)
    assert client.post("/periods", headers=MANAGER, data={"date_from": "2030-05-01", "date_to": "2030-05-31"}
                       ).status_code == 303
    assert client.get(f"/tickets/{ticket_id}/edit", headers=OFFICER).status_code == 409
    assert client.post(f"/tickets/{ticket_id}/edit", headers=OFFICER, data=form(grade)).status_code == 409
    assert client.post(f"/tickets/{ticket_id}/void", headers=OFFICER).status_code == 409


def test_other_htx_sees_nothing_and_gets_404(client, db, households):
    lb_grade = add_grade(db, htx="LB", name="Loại LB")
    lb_ticket = add_ticket(db, lb_grade, htx="LB", household_name="Hộ La Bằng")
    lb_period = db.execute("INSERT INTO periods (htx_code, date_from, date_to) VALUES ('LB', '2030-05-01', '2030-05-31') "
                           "RETURNING id").fetchone()[0]
    payout = db.execute("INSERT INTO payouts (htx_code, period_id, household_id, household_name, total_kg, total_vnd) "
                        "VALUES ('LB', %s, 'h1', 'x', 1, 1) RETURNING id", (lb_period,)).fetchone()[0]
    add_grade(db, name="Loại TC")
    assert "Hộ La Bằng" not in client.get("/?day=2030-05-01", headers=OFFICER).text
    assert "Loại LB" not in client.get("/prices", headers=MANAGER).text
    assert str(lb_period) not in client.get("/periods", headers=MANAGER).text
    for method, path, headers in (("get", f"/tickets/{lb_ticket}/edit", OFFICER), ("post", f"/tickets/{lb_ticket}/edit", OFFICER),
                                  ("post", f"/tickets/{lb_ticket}/void", OFFICER), ("get", f"/periods/{lb_period}", MANAGER),
                                  ("post", f"/periods/{lb_period}/payouts/{payout}/paid", MANAGER),
                                  ("post", f"/prices/{lb_grade}", MANAGER)):
        data = form(lb_grade) if "edit" in path else {"price_vnd": "1"}
        assert getattr(client, method)(path, headers=headers, **({"data": data} if method == "post" else {})
                                       ).status_code == 404, path
    assert db.execute("SELECT voided FROM tickets").fetchone()[0] is False
    assert db.execute("SELECT paid_at FROM payouts").fetchone()[0] is None


def test_officer_cannot_open_prices_or_periods(client, db, households):
    for path in ("/prices", "/periods"):
        assert client.get(path, headers=OFFICER).status_code == 403
    assert client.post("/prices", headers=OFFICER, data={"name": "x", "price_vnd": "1"}).status_code == 403
    assert client.post("/periods", headers=OFFICER, data={"date_from": "2030-05-01", "date_to": "2030-05-02"}
                       ).status_code == 403
    assert client.get("/prices", headers=MANAGER).status_code == 200
    assert client.get("/", headers=FARMER).status_code == 403
    assert client.get("/mine", headers=MANAGER).status_code == 403
    assert client.get("/", headers=bearer(htx="", roles=("manager",))).status_code == 403
    assert client.get("/").status_code == 401


def test_manager_sets_prices(client, db, households):
    assert client.post("/prices", headers=MANAGER, data={"name": "Loại 1", "price_vnd": "8000"}).status_code == 303
    assert client.post("/prices", headers=MANAGER, data={"name": "Loại 1", "price_vnd": "9000"}).status_code == 400
    assert client.post("/prices", headers=MANAGER, data={"name": "", "price_vnd": "x"}).status_code == 400
    grade_id = db.execute("SELECT id FROM grades").fetchone()[0]
    assert client.post(f"/prices/{grade_id}", headers=MANAGER, data={"price_vnd": "9500", "active": "1"}).status_code == 303
    assert db.execute("SELECT price_vnd, active, htx_code FROM grades").fetchone() == (9500, True, "TC")
    assert client.post(f"/prices/{grade_id}", headers=MANAGER, data={"price_vnd": "9500"}).status_code == 303
    assert db.execute("SELECT active FROM grades").fetchone()[0] is False


def test_period_pages_close_and_mark_paid(client, db, households):
    grade = add_grade(db, price_vnd=8000)
    add_ticket(db, grade)
    bad = client.post("/periods", headers=MANAGER, data={"date_from": "2030-05-31", "date_to": "2030-05-01"})
    assert bad.status_code == 400
    empty = client.post("/periods", headers=MANAGER, data={"date_from": "2030-06-01", "date_to": "2030-06-30"})
    assert empty.status_code == 409 and "Không có phiếu cân nào trong khoảng này." in empty.text
    closed = client.post("/periods", headers=MANAGER, data={"date_from": "2030-05-01", "date_to": "2030-05-31"})
    assert closed.status_code == 303
    overlap = client.post("/periods", headers=MANAGER, data={"date_from": "2030-05-15", "date_to": "2030-06-15"})
    assert overlap.status_code == 409 and "Kỳ này trùng ngày với một kỳ đã chốt." in overlap.text
    detail_path = urlsplit(closed.headers["location"]).path.removeprefix("/apps/leaf-purchase")
    detail = client.get(detail_path, headers=MANAGER)
    assert detail.status_code == 200 and "80.000 ₫" in detail.text and "Chưa trả" in detail.text
    payout = db.execute("SELECT id FROM payouts").fetchone()[0]
    assert client.post(f"{detail_path}/payouts/{payout}/paid", headers=MANAGER).status_code == 303
    assert db.execute("SELECT paid_at IS NOT NULL, paid_by FROM payouts").fetchone() == (True, "kc-manager-tc")
    assert "Đã trả" in client.get(detail_path, headers=MANAGER).text
    assert "Kỳ 01/05/2030" in client.get("/periods", headers=MANAGER).text


def test_farmer_sees_only_own_household(client, db, households):
    grade = add_grade(db)
    add_ticket(db, grade, household_id="h1", household_name="Hộ ông Ba", kg="11.0")
    add_ticket(db, grade, household_id="h2", household_name="Hộ bà Tư", kg="22.0")
    add_ticket(db, grade, household_id="h1", household_name="Hộ ông Ba", kg="33.0", voided=True)
    lb_grade = add_grade(db, htx="LB", name="LB")
    add_ticket(db, lb_grade, htx="LB", household_id="h1", household_name="Hộ ông Ba", kg="44.0")
    html = client.get("/mine", headers=FARMER).text
    assert households == ["farmer"]
    assert "11,0" in html and "22,0" not in html and "33,0" not in html and "44,0" not in html


def test_farmer_without_household_gets_notice(client, db, monkeypatch):
    monkeypatch.setattr(core_client, "list_households", lambda a, r: [])
    response = client.get("/mine", headers=FARMER)
    assert response.status_code == 200 and "chưa được gắn với nông hộ" in response.text
    monkeypatch.setattr(core_client, "list_households", lambda a, r: (_ for _ in ()).throw(CoreError("down")))
    assert client.get("/mine", headers=FARMER).status_code == 503


def test_table_cells_carry_their_column_label(client, db, households):
    grade = add_grade(db)
    add_ticket(db, grade)
    for path, headers in (("/?day=2030-05-01", OFFICER), ("/prices", MANAGER), ("/mine", FARMER)):
        html = client.get(path, headers=headers).text
        heads = re.findall(r'<th role="columnheader">(.*?)</th>', html)
        assert heads and re.findall(r'<td role="cell" data-label="(.*?)">', html)[:len(heads)] == heads, path
        assert "<td>" not in html and '<table role="table">' in html, path


def test_pages_escape_html(client, db, households):
    evil = "<b>x</b>"
    grade = db.execute("INSERT INTO grades (htx_code, name, price_vnd) VALUES ('TC', %s, 1) RETURNING id", (evil,)
                       ).fetchone()[0]
    add_ticket(db, grade, household_name=evil)
    db.execute("UPDATE tickets SET grade_name = %s", (evil,))
    for path, headers in (("/?day=2030-05-01", OFFICER), ("/prices", MANAGER), ("/mine", FARMER)):
        html = client.get(path, headers=headers).text
        assert "<b>x</b>" not in html, path
    assert "&lt;b&gt;x&lt;/b&gt;" in client.get("/?day=2030-05-01", headers=OFFICER).text
    assert client.get("/?theme=%22%3E%3Cscript%3E", headers=OFFICER).text.count("<script") == 0


def test_theme_follows_redirects_and_nothing_leaves_the_prefix(client, db, households):
    grade = add_grade(db)
    response = client.post("/tickets?theme=dark", headers=OFFICER, data=form(grade))
    assert response.status_code == 303 and "theme=dark" in response.headers["location"]
    assert 'data-theme="dark"' in client.get("/?theme=dark", headers=OFFICER).text


def test_busy_database_answers_503(client, db, monkeypatch, households):
    monkeypatch.setattr(main, "DB_WAIT_S", 0.05)
    taken = [main.DB_SLOTS.acquire(blocking=False) for _ in range(main.DB_MAX_CONNECTIONS)]
    try:
        assert all(taken)
        result = {}
        request = threading.Thread(target=lambda: result.update(response=client.get("/prices", headers=MANAGER)),
                                   daemon=True)
        request.start()
        request.join(5)
        assert not request.is_alive(), "the request waited for a free connection instead of answering 503"
        assert result["response"].status_code == 503 and "bận" in result["response"].text
    finally:
        for _ in taken:
            main.DB_SLOTS.release()
    assert client.get("/prices", headers=MANAGER).status_code == 200


def test_households_are_fetched_without_holding_a_connection(client, db, monkeypatch):
    grade = add_grade(db)
    free_slots = []

    def fake(authorization, role):
        taken = [main.DB_SLOTS.acquire(blocking=False) for _ in range(main.DB_MAX_CONNECTIONS)]
        free_slots.append(sum(taken))
        for got in taken:
            if got:
                main.DB_SLOTS.release()
        return HOUSEHOLDS

    monkeypatch.setattr(core_client, "list_households", fake)
    ticket_id = add_ticket(db, grade)
    client.get("/", headers=OFFICER)
    client.post("/tickets", headers=OFFICER, data=form(grade))
    client.get(f"/tickets/{ticket_id}/edit", headers=OFFICER)
    client.post(f"/tickets/{ticket_id}/edit", headers=OFFICER, data=form(grade))
    client.get("/mine", headers=FARMER)
    assert free_slots == [main.DB_MAX_CONNECTIONS] * 5
