# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Overview, ticket list, print pages, CSV, month filter and inline errors (the app-kit pages)."""
import re
from datetime import date
from decimal import Decimal

import pytest
from conftest import add_grade, add_ticket, bearer
from test_pages import FARMER, MANAGER, OFFICER, client, form, households  # noqa: F401  (fixtures)

from leaf_purchase import main, store

TODAY = date(2030, 5, 15)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(main, "today", lambda: TODAY)


def column(html: str, label: str) -> list[str]:
    return re.findall(rf'data-label="{label}">(.*?)</td>', html)


def seed_overview(db, client):
    """A closed period, a voided ticket, tickets outside the month and a ticket nobody has closed."""
    grade = add_grade(db, price_vnd=8000)
    add_ticket(db, grade, household_id="h1", household_name="Nguyễn Văn An", weighed_on="2030-05-03", kg="30.0")
    add_ticket(db, grade, household_id="h3", household_name="Lê Văn Cường", weighed_on="2030-05-03", kg="50.0",
               voided=True)
    assert client.post("/periods", headers=MANAGER, data={"date_from": "2030-05-01", "date_to": "2030-05-10"}
                       ).status_code == 303
    add_ticket(db, grade, household_id="h1", household_name="Nguyễn Văn An", weighed_on="2030-05-14", kg="20.0")
    add_ticket(db, grade, household_id="h1", household_name="Nguyễn Văn An", weighed_on="2030-05-15", kg="10.0")
    add_ticket(db, grade, household_id="h2", household_name="Trần Thị Bình", weighed_on="2030-05-15", kg="5.0")
    add_ticket(db, grade, household_id="h3", household_name="Lê Văn Cường", weighed_on="2030-04-30", kg="7.0")
    add_ticket(db, grade, household_id="h3", household_name="Lê Văn Cường", weighed_on="2030-05-14", kg="99.0",
               voided=True)


def test_overview_numbers(db, client):
    seed_overview(db, client)
    data = store.overview(db, "TC", TODAY)
    assert (data.today_kg, data.today_vnd, data.today_tickets) == (Decimal("15.0"), 120000, 2)
    assert (data.month_kg, data.month_vnd, data.month_tickets) == (Decimal("65.0"), 520000, 4)
    assert (data.open_kg, data.open_vnd) == (Decimal("42.0"), 336000)
    assert (data.unpaid_vnd, data.unpaid_households) == (240000, 1)
    assert len(data.days) == 14 and data.days[0][0] == date(2030, 5, 2) and data.days[-1][0] == TODAY
    assert dict(data.days)[date(2030, 5, 3)] == Decimal("30.0") and dict(data.days)[date(2030, 5, 4)] == 0
    assert dict(data.days)[date(2030, 5, 14)] == Decimal("20.0")
    assert [(h.household_name, h.kg) for h in data.top] == [("Nguyễn Văn An", Decimal("60.0")),
                                                            ("Trần Thị Bình", Decimal("5.0"))]


def test_overview_is_scoped_to_the_htx(db, client):
    seed_overview(db, client)
    other = add_grade(db, htx="LB", name="Loại LB")
    add_ticket(db, other, htx="LB", household_name="Hộ La Bằng", weighed_on="2030-05-15", kg="500.0")
    data = store.overview(db, "TC", TODAY)
    assert data.today_kg == Decimal("15.0") and all(h.household_name != "Hộ La Bằng" for h in data.top)
    assert store.overview(db, "ZZ", TODAY).month_tickets == 0


def test_overview_page(db, client):
    seed_overview(db, client)
    html = client.get("/overview", headers=MANAGER).text
    for text in ("Hôm nay", "Tháng này", "Chưa vào kỳ", "Chưa trả", "Số ký 14 ngày gần nhất",
                 "Hộ bán nhiều nhất tháng này", "15,0 kg", "120.000 ₫", "240.000 ₫", "Nguyễn Văn An"):
        assert text in html, text
    assert html.count('class="chart-label"') == 14
    assert 'aria-current="page">Tổng quan' in html
    assert client.get("/overview", headers=OFFICER).status_code == 403
    assert client.get("/overview", headers=FARMER).status_code == 403
    assert client.get("/overview").status_code == 401


@pytest.fixture
def listed(db):
    g1 = add_grade(db, name="Búp một tôm hai lá")
    g2 = add_grade(db, name="Búp một tôm ba lá", price_vnd=6000)
    add_ticket(db, g1, household_id="h1", household_name="Nguyễn Văn An", weighed_on="2030-05-01", kg="10.0")
    add_ticket(db, g2, household_id="h1", household_name="Nguyễn Văn An", weighed_on="2030-05-10", kg="20.0",
               price_vnd=6000)
    add_ticket(db, g1, household_id="h2", household_name="Trần Thị Bình", weighed_on="2030-05-10", kg="5.0")
    add_ticket(db, g1, household_id="h2", household_name="Trần Thị Bình", weighed_on="2030-05-20", kg="7.0",
               voided=True)
    add_ticket(db, g2, household_id="h3", household_name="Lê Văn Cường", weighed_on="2030-06-01", kg="3.0",
               price_vnd=6000)
    return g1, g2


def kgs(client, query="", headers=OFFICER):
    response = client.get("/tickets" + query, headers=headers)
    assert response.status_code == 200, query
    return column(response.text, "Số ký")


def test_ticket_list_filters(client, listed):
    g1, g2 = listed
    assert kgs(client) == ["3,0", "5,0", "20,0", "10,0"]  # newest first (same day: last written first), voided hidden by default
    assert kgs(client, "?status=voided") == ["7,0"]
    assert kgs(client, "?status=all") == ["3,0", "7,0", "5,0", "20,0", "10,0"]
    assert kgs(client, "?status=nonsense") == ["3,0", "5,0", "20,0", "10,0"]
    assert kgs(client, "?from=2030-05-10") == ["3,0", "5,0", "20,0"]
    assert kgs(client, "?to=2030-05-10") == ["5,0", "20,0", "10,0"]
    assert kgs(client, "?household=h1") == ["20,0", "10,0"]
    assert kgs(client, f"?grade={g2}") == ["3,0", "20,0"]
    assert kgs(client, "?q=văn") == ["3,0", "20,0", "10,0"]
    assert kgs(client, "?q=VĂN") == ["3,0", "20,0", "10,0"]
    assert kgs(client, f"?household=h1&grade={g2}&from=2030-05-05&to=2030-05-31&q=An") == ["20,0"]
    assert kgs(client, "?from=oops&to=2030-13-40&grade=nope") == ["3,0", "5,0", "20,0", "10,0"]
    assert kgs(client, "?household=h1", MANAGER) == ["20,0", "10,0"]


def test_search_treats_wildcards_as_text(db, client):
    grade = add_grade(db)
    for name, kg in (("Hộ 100% chè", "1.0"), ("Hộ a_b", "2.0"), ("Hộ axb", "3.0"), ("Hộ O'Neil; DROP", "4.0"),
                     ("Hộ c\\d", "5.0")):
        add_ticket(db, grade, household_name=name, kg=kg)
    assert kgs(client, "?q=%25") == ["1,0"]
    assert kgs(client, "?q=_") == ["2,0"]
    assert kgs(client, "?q=a_b") == ["2,0"]
    assert kgs(client, "?q=%27") == ["4,0"]
    assert kgs(client, "?q=%3B+DROP") == ["4,0"]
    assert kgs(client, "?q=%5C") == ["5,0"]
    assert len(kgs(client, "?q=H%E1%BB%99")) == 5
    assert db.execute("SELECT count(*) FROM tickets").fetchone()[0] == 5


def test_paging_edges(db, client):
    grade = add_grade(db)
    for i in range(30):
        add_ticket(db, grade, weighed_on=f"2030-05-{i + 1:02d}", kg=f"{i + 1}.0")
    first = client.get("/tickets", headers=OFFICER)
    assert len(column(first.text, "Số ký")) == 25 and "Trang 1/2" in first.text and 'rel="next"' in first.text
    assert column(first.text, "Số ký")[0] == "30,0"
    second = client.get("/tickets?page=2", headers=OFFICER)
    assert len(column(second.text, "Số ký")) == 5 and "Trang 2/2" in second.text and 'rel="prev"' in second.text
    for bad in ("0", "abc", "-3", "999999", "", "1e3"):
        response = client.get(f"/tickets?page={bad}", headers=OFFICER)
        assert response.status_code == 200, bad
        assert re.search(r"Trang [12]/2", response.text), bad
    assert "Trang 2/2" in client.get("/tickets?page=999999", headers=OFFICER).text
    # the filters ride along on the paging links
    filtered = client.get("/tickets?from=2030-05-01&status=all", headers=OFFICER).text
    assert "from=2030-05-01" in filtered.split('class="pagination"')[1]
    empty = client.get("/tickets?q=khong-co-ai", headers=OFFICER)
    assert empty.status_code == 200 and 'class="empty"' in empty.text and 'class="pagination"' not in empty.text


def test_totals_never_count_voided_tickets(client, listed):
    hint = "Không tính phiếu đã huỷ"
    # (query, kg, vnd, tickets, rows shown, hint shown)
    for query, kg, vnd, count, rows, hinted in (
            ("", "38,0", "258.000 ₫", 4, 4, False), ("?status=all", "38,0", "258.000 ₫", 4, 5, True),
            ("?status=voided", "0,0", "0 ₫", 0, 1, True), ("?household=h1", "30,0", "200.000 ₫", 2, 2, False),
            ("?household=h2&status=all", "5,0", "40.000 ₫", 1, 2, True), ("?q=nobody", "0,0", "0 ₫", 0, 0, False)):
        html = client.get("/tickets" + query, headers=OFFICER).text
        stats = re.findall(r'<span class="stat-value">(.*?)</span>', html)
        assert stats[:3] == [f"{kg} kg", vnd, str(count)], query
        assert len(column(html, "Số ký")) == rows, query
        assert (hint in html) is hinted, query
    html = client.get("/tickets?status=all", headers=OFFICER).text
    amounts = [int(a.replace(".", "").replace(" ₫", "")) for a in column(html, "Thành tiền")]
    states = [re.search(r">(.*?)<", st).group(1) for st in column(html, "Tình trạng")]
    assert sum(a for a, st in zip(amounts, states) if st != "Đã huỷ") == 258000


def test_status_pills_carry_a_tone(db, client, households):
    grade = add_grade(db)
    add_ticket(db, grade, household_id="h1", weighed_on="2030-05-01", kg="1.0")
    add_ticket(db, grade, household_id="h1", weighed_on="2030-05-02", kg="2.0", voided=True)
    html = client.get("/tickets?status=all", headers=OFFICER).text
    assert '<span class="pill warn">Chưa chốt</span>' in html and '<span class="pill danger">Đã huỷ</span>' in html
    closed = client.post("/periods", headers=MANAGER, data={"date_from": "2030-05-01", "date_to": "2030-05-31"})
    period = closed.headers["location"].split("?")[0].rsplit("/", 1)[1]
    assert '<span class="pill">Đã vào kỳ</span>' in client.get("/tickets", headers=OFFICER).text
    assert '<span class="pill warn">Chưa trả</span>' in client.get(f"/periods/{period}", headers=MANAGER).text
    farmer = client.get("/mine", headers=FARMER).text
    assert '<span class="pill warn">Chưa trả</span>' in farmer and '<span class="pill">Đã vào kỳ</span>' in farmer
    payout = db.execute("SELECT id FROM payouts").fetchone()[0]
    client.post(f"/periods/{period}/payouts/{payout}/paid", headers=MANAGER)
    assert '<span class="pill">Đã trả</span>' in client.get(f"/periods/{period}", headers=MANAGER).text
    assert '<span class="pill">Đã trả</span>' in client.get("/mine", headers=FARMER).text


def test_print_pages_use_the_signature_block(db, client, households):
    grade = add_grade(db)
    ticket = add_ticket(db, grade)
    client.post("/periods", headers=MANAGER, data={"date_from": "2030-05-01", "date_to": "2030-05-31"})
    period = db.execute("SELECT id FROM periods").fetchone()[0]
    assert client.get(f"/tickets/{ticket}/print", headers=OFFICER).text.count('class="signature"') == 2
    sheet = client.get(f"/periods/{period}/print", headers=MANAGER).text
    assert sheet.count('class="signature"') == 1 and "<br><br>" not in sheet


def test_export_only_holds_the_callers_rows(db, client, listed):
    g1, g2 = listed
    other = add_grade(db, htx="LB", name="Loại LB")
    add_ticket(db, other, htx="LB", household_name="Hộ La Bằng", weighed_on="2030-05-10", kg="999.0")
    add_ticket(db, g1, household_id="h9", household_name="=HYPERLINK(\"http://x\")", weighed_on="2030-05-11", kg="1.0")
    response = client.get("/tickets/export.csv?from=2030-05-10&to=2030-05-11", headers=OFFICER)
    assert response.status_code == 200 and response.content.startswith("﻿".encode())
    assert response.headers["content-disposition"].startswith('attachment; filename="leaf-purchase-TC-tickets-')
    lines = response.content.decode("utf-8-sig").split("\r\n")
    assert lines[0] == "Ngày cân,Hộ,Loại chè,Số ký,Giá mỗi ký,Thành tiền,Tình trạng,Kỳ"
    body = "\n".join(lines)
    assert "La Bằng" not in body and "999" not in body and "Lê Văn Cường" not in body
    assert "'=HYPERLINK" in body and ",=HYPERLINK" not in body
    assert "10/05/2030,Nguyễn Văn An,Loại 1,\"20,0\",6000,120000,Chưa chốt," in body
    assert "Trần Thị Bình" in body and body.count("\n") == 4  # header + 3 rows + the final CRLF, none from 05-01 or 06-01
    assert client.get("/tickets/export.csv", headers=FARMER).status_code == 403
    assert client.get("/tickets/export.csv").status_code == 401
    assert "Hộ La Bằng" not in client.get("/tickets/export.csv?status=all", headers=MANAGER).text
    assert client.get("/tickets/export.csv?status=voided", headers=OFFICER).content.decode("utf-8-sig").count("\r\n") == 2


def test_period_export_and_print_are_manager_only_and_scoped(db, client, households):
    grade = add_grade(db)
    add_ticket(db, grade, household_id="h1", household_name="Nguyễn Văn An", kg="10.0")
    add_ticket(db, grade, household_id="h2", household_name="Trần Thị Bình", kg="5.0")
    closed = client.post("/periods", headers=MANAGER, data={"date_from": "2030-05-01", "date_to": "2030-05-31"})
    period_id = closed.headers["location"].split("?")[0].rsplit("/", 1)[1]
    payout = db.execute("SELECT id FROM payouts WHERE household_id = 'h1'").fetchone()[0]
    client.post(f"/periods/{period_id}/payouts/{payout}/paid", headers=MANAGER)
    csv_ = client.get(f"/periods/{period_id}/export.csv", headers=MANAGER)
    assert csv_.status_code == 200 and csv_.content.startswith("﻿".encode())
    lines = csv_.content.decode("utf-8-sig").split("\r\n")
    assert lines[0] == "Hộ,Tổng số ký,Tổng tiền,Đã trả,Ngày trả"
    assert lines[1].startswith("Nguyễn Văn An,\"10,0\",80000,Có,") and lines[2] == "Trần Thị Bình,\"5,0\",40000,Không,"
    sheet = client.get(f"/periods/{period_id}/print", headers=MANAGER)
    assert sheet.status_code == 200 and "Nguyễn Văn An" in sheet.text and "Chữ ký" in sheet.text
    assert "print-sheet" in sheet.text and 'class="tabs"' not in sheet.text
    for path in (f"/periods/{period_id}/export.csv", f"/periods/{period_id}/print"):
        assert client.get(path, headers=OFFICER).status_code == 403
        assert client.get(path, headers=FARMER).status_code == 403
        assert client.get(path, headers=bearer(htx="LB")).status_code == 404
    assert client.get(f"/periods/{'0' * 8}-0000-0000-0000-{'0' * 12}/print", headers=MANAGER).status_code == 404
    assert client.get("/periods/not-a-uuid/print", headers=MANAGER).status_code == 404


def test_ticket_print_page(db, client, households):
    grade = add_grade(db, price_vnd=8000)
    ticket = add_ticket(db, grade, household_name="Nguyễn Văn An", weighed_on="2030-05-02", kg="12.5")
    lb_grade = add_grade(db, htx="LB", name="Loại LB")
    lb_ticket = add_ticket(db, lb_grade, htx="LB", household_name="Hộ La Bằng")
    for headers in (OFFICER, MANAGER):
        html = client.get(f"/tickets/{ticket}/print", headers=headers)
        assert html.status_code == 200
        for text in ("TC", "Nguyễn Văn An", "02/05/2030", "Loại 1", "12,5", "8.000 ₫", "100.000 ₫", "Chữ ký"):
            assert text in html.text, text
        assert "print-sheet" in html.text
    assert client.get(f"/tickets/{ticket}/print", headers=FARMER).status_code == 403
    assert client.get(f"/tickets/{lb_ticket}/print", headers=OFFICER).status_code == 404
    assert client.get("/tickets/not-a-uuid/print", headers=OFFICER).status_code == 404


def test_tabs_follow_the_role(db, client, households):
    def tabs(path, headers):
        html = client.get(path, headers=headers).text
        return re.findall(r'<a href="([^"]*)"(?: aria-current="page")?>([^<]*)</a>', html.split('class="tabs"')[1].split("</nav>")[0])

    officer = tabs("/", OFFICER)
    assert [label for _, label in officer] == ["Ghi phiếu", "Phiếu cân"]
    assert [path for path, _ in officer] == ["/apps/leaf-purchase/", "/apps/leaf-purchase/tickets"]
    manager = tabs("/tickets", MANAGER)
    assert [label for _, label in manager] == ["Ghi phiếu", "Phiếu cân", "Kỳ thanh toán", "Giá thu mua", "Tổng quan"]
    assert 'aria-current="page">Phiếu cân' in client.get("/tickets", headers=MANAGER).text
    for path in ("/prices", "/periods"):
        assert 'class="tabs"' in client.get(path, headers=MANAGER).text
    assert "theme=dark" in client.get("/tickets?theme=dark", headers=OFFICER).text.split('class="tabs"')[1]


def test_ticket_form_errors_are_inline_and_keep_the_typed_values(db, client, households):
    grade = add_grade(db)
    response = client.post("/tickets", headers=OFFICER, data=form(grade, household="h2", kg="abc", weighed_on="2030-05-03"))
    assert response.status_code == 400
    html = response.text
    assert 'value="abc"' in html and 'value="2030-05-03"' in html and '<option value="h2" selected>' in html
    assert f'<option value="{grade}" selected>' in html
    kg_part = html.split('name="kg"')[1].split("</label>")[0]
    assert 'class="field-error"' in kg_part and "Số ký phải lớn hơn 0" in kg_part and 'aria-invalid="true"' in kg_part
    assert "Hộ giao chè phải là" not in html and 'class="tabs"' in html
    assert db.execute("SELECT count(*) FROM tickets").fetchone()[0] == 0
    forged = client.post("/tickets", headers=OFFICER, data=form(grade, household="h999"))
    assert forged.status_code == 400 and "Hộ giao chè phải là một nông hộ của HTX." in forged.text
    assert "Hộ giao chè phải là" in forged.text.split('name="household"')[1].split("</label>")[0]
    add_ticket(db, grade)
    client.post("/periods", headers=MANAGER, data={"date_from": "2030-05-01", "date_to": "2030-05-31"})
    refused = client.post("/tickets", headers=OFFICER, data=form(grade, kg="7"))
    assert refused.status_code == 400 and "thuộc một kỳ đã chốt" in refused.text and 'value="7"' in refused.text


def test_farmer_page_has_stats_month_filter_and_paging(db, client, households):
    grade = add_grade(db, price_vnd=8000)
    add_ticket(db, grade, household_id="h1", weighed_on="2030-05-02", kg="11.0")
    add_ticket(db, grade, household_id="h1", weighed_on="2030-04-20", kg="22.0")
    add_ticket(db, grade, household_id="h2", weighed_on="2030-05-02", kg="44.0")
    period = db.execute("INSERT INTO periods (htx_code, date_from, date_to) VALUES ('TC', '2030-03-01', '2030-03-31') "
                        "RETURNING id").fetchone()[0]
    db.execute("INSERT INTO payouts (htx_code, period_id, household_id, household_name, total_kg, total_vnd) "
               "VALUES ('TC', %s, 'h1', 'Hộ ông Ba', 6, 50000)", (period,))
    html = client.get("/mine", headers=FARMER).text
    values = re.findall(r'<span class="stat-value">(.*?)</span>', html)
    assert "Tháng này" in html and "Chưa trả" in html
    assert values[:2] == ["11,0 kg", "50.000 ₫"]
    assert column(html, "Số ký")[-2:] == ["11,0", "22,0"] and "44,0" not in html
    april = client.get("/mine?month=2030-04", headers=FARMER).text
    tickets = [k for k in column(april, "Số ký")]
    assert "22,0" in tickets and "11,0" not in tickets
    assert client.get("/mine?month=garbage", headers=FARMER).status_code == 200
    assert "11,0" in client.get("/mine?month=2030-13", headers=FARMER).text
    for i in range(30):
        add_ticket(db, grade, household_id="h1", weighed_on="2030-02-01", kg="1.5")
    paged = client.get("/mine?page=2", headers=FARMER)
    assert paged.status_code == 200 and "Trang 2/2" in paged.text
    assert client.get("/mine?page=-1", headers=FARMER).status_code == 200


def test_new_pages_have_no_script_or_style_attribute(db, client, households):
    grade = add_grade(db)
    ticket = add_ticket(db, grade)
    paths = ["/", "/tickets", f"/tickets/{ticket}/print", "/overview", "/periods", "/prices"]
    for path in paths:
        html = client.get(path, headers=MANAGER).text
        assert "<script" not in html and " style=" not in html, path
    assert "<script" not in client.get("/mine", headers=FARMER).text
