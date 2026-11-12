# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import json
import re
import threading
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import pytest
from conftest import add_booking, add_tour, bearer
from fastapi.testclient import TestClient

from tea_tour import core_client, main
from tea_tour.core_client import CoreError, Household

MANAGER = bearer()
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nông hộ Một")
HOUSEHOLDS = [Household(id="h1", name="Hộ ông Ba", keycloak_user_id="kc-farmer-1"),
              Household(id="h2", name="Hộ bà Tư", keycloak_user_id=None)]
FORM = {"title": "Hái chè sớm", "starts_at": "2030-05-01T07:30", "meeting_point": "Đình Hồng Thái", "seats": "8",
        "price_vnd": "250000", "description": "Đi bộ, hái chè, sao chè.", "guide": "h1"}


@pytest.fixture
def client(db):
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as test_client:
        yield test_client


@pytest.fixture
def households(monkeypatch):
    calls = []

    def fake(authorization):
        calls.append(authorization)
        return HOUSEHOLDS

    monkeypatch.setattr(core_client, "list_households", fake)
    return calls


def book(client, tour_id, htx="TC", **form):
    data = {"guest_name": "Nguyễn Văn Khách", "phone": "0912 345 678", "party_size": "2", "note": "", **form}
    return client.post(f"/public/{htx}/tours/{tour_id}/book", data=data)


def test_manager_sees_only_own_htx_tours(client, db, households):
    add_tour(db, title="Tour của Tân Cương")
    lb_tour = add_tour(db, htx="LB", title="Tour của La Bằng")
    page = client.get("/", headers=MANAGER)
    assert page.status_code == 200
    assert "Tour của Tân Cương" in page.text and "Tour của La Bằng" not in page.text
    assert client.get(f"/tours/{lb_tour}", headers=MANAGER).status_code == 404
    for path in (f"/tours/{lb_tour}/cancel",):
        assert client.post(path, headers=MANAGER).status_code == 404
    assert db.execute("SELECT status FROM tours WHERE id = %s", (lb_tour,)).fetchone()[0] == "OPEN"


def test_manager_page_shows_price_time_and_public_link(client, db, households):
    add_tour(db, starts_at=datetime(2030, 5, 1, 0, 30, tzinfo=timezone.utc), price_vnd=250000, seats=8)
    page = client.get("/", headers=MANAGER).text
    assert "01/05/2030 07:30" in page  # Asia/Ho_Chi_Minh
    assert 'href="/apps/tea-tour/public/TC"' in page
    assert '<link rel="stylesheet" href="/dxos-app.css">' in page


def test_farmer_guide_sees_only_assigned_tours(client, db):
    mine = add_tour(db, title="Tour tôi dẫn", guide_user_id="kc-farmer-1", guide_name="Hộ ông Ba")
    add_booking(db, mine, code="AAAA2222", party_size=2, status="CONFIRMED")
    add_booking(db, mine, code="BBBB3333", party_size=3, status="PENDING", phone="0987654321")
    add_tour(db, title="Tour người khác dẫn", guide_user_id="kc-farmer-2")
    add_tour(db, htx="LB", title="Tour HTX khác", guide_user_id="kc-farmer-1")
    page = client.get("/guide", headers=FARMER)
    assert page.status_code == 200
    assert "Tour tôi dẫn" in page.text
    assert "Tour người khác dẫn" not in page.text and "Tour HTX khác" not in page.text
    assert '<td role="cell" data-label="Khách đã xác nhận">2</td>' in page.text  # confirmed guests only
    assert "0987654321" not in page.text and "0912345678" not in page.text


def test_table_cells_carry_their_column_label(client, db, households):
    """/dxos-app.css stacks table rows as cards on phones and labels each cell from data-label."""
    add_tour(db, guide_user_id="kc-farmer-1", guide_name="Hộ ông Ba")
    for path, headers in (("/", MANAGER), ("/guide", FARMER)):
        html = client.get(path, headers=headers).text
        heads = re.findall(r'<th role="columnheader">(.*?)</th>', html)
        assert len(heads) == 5 and re.findall(r'<td role="cell" data-label="(.*?)">', html) == heads, path
        assert "<td>" not in html, path
        # The stacked rows are display: block, which drops table semantics in some screen readers; roles keep them.
        assert '<table role="table">' in html and html.count('role="rowgroup"') == 2, path
        assert html.count('<tr role="row">') == 2, path  # the header row and the one tour


def test_roles_are_checked_by_the_app_too(client, db, households):
    assert client.get("/", headers=FARMER).status_code == 403
    assert client.get("/guide", headers=MANAGER).status_code == 403
    assert client.get("/", headers=bearer(htx="")).status_code == 403


def test_public_lookup_needs_code_and_phone(client, db):
    tour_id = add_tour(db, title="Tour sáng sớm")
    response = book(client, tour_id)
    assert response.status_code == 303
    location = urlsplit(response.headers["location"])
    assert location.path == "/apps/tea-tour/public/TC/booking"
    code = parse_qs(location.query)["code"][0]
    assert re.fullmatch(r"[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}", code)

    just_booked = client.get(f"/public/TC/booking?code={code}&booked=1")
    assert code in just_booked.text and "Tour sáng sớm" not in just_booked.text
    assert "Nguyễn Văn Khách" not in just_booked.text

    wrong_phone = client.get(f"/public/TC/booking?code={code}&phone=0999999999")
    wrong_code = client.get("/public/TC/booking?code=ZZZZ9999&phone=0912345678")
    other_htx = client.get(f"/public/LB/booking?code={code}&phone=0912345678")
    for miss in (wrong_phone, wrong_code, other_htx):
        assert miss.status_code == 404
        assert "Không tìm thấy lượt đặt với mã và số điện thoại này." in miss.text
        assert "Tour sáng sớm" not in miss.text
    assert wrong_phone.text.replace(code, "") == wrong_code.text.replace("ZZZZ9999", "")

    found = client.get(f"/public/TC/booking?code={code.lower()}&phone=%2B84912345678")
    assert found.status_code == 200
    assert "Tour sáng sớm" in found.text and "Chờ xác nhận" in found.text and "2 người" in found.text


def test_booking_page_hides_phones(client, db):
    tour_id = add_tour(db, title="Tour chiều")
    add_booking(db, tour_id, code="AAAA2222", guest_name="Khách Một", phone="0911111111")
    add_booking(db, tour_id, code="BBBB3333", guest_name="Khách Hai", phone="0922222222")
    pages = [client.get("/public/TC"), client.get("/public/TC/booking?code=AAAA2222&phone=0911111111"),
             book(client, tour_id, phone="12345"), book(client, tour_id, party_size="99")]
    assert pages[0].status_code == 200 and "Tour chiều" in pages[0].text
    for page in pages:
        assert "0922222222" not in page.text and "Khách Hai" not in page.text
        assert "0911111111" not in page.text
    assert "Khách Một" in pages[1].text  # the guest's own booking


def test_public_page_lists_upcoming_open_tours_with_seats_left(client, db):
    open_tour = add_tour(db, title="Còn chỗ", seats=5)
    add_booking(db, open_tour, party_size=3)
    full = add_tour(db, title="Đã kín", seats=2)
    add_booking(db, full, code="BBBB3333", party_size=2, status="CONFIRMED")
    add_tour(db, title="Đã huỷ", status="CANCELLED")
    add_tour(db, title="Đã qua", starts_at=datetime.now(timezone.utc) - timedelta(hours=1))
    add_tour(db, htx="LB", title="Của HTX khác")
    page = client.get("/public/TC").text
    assert "Còn chỗ" in page and "Còn 2 chỗ" in page and "250.000 ₫" in page
    assert "Đã kín" in page and "Hết chỗ" in page
    for hidden in ("Đã huỷ", "Đã qua", "Của HTX khác"):
        assert hidden not in page
    assert page.count('name="guest_name"') == 1  # no booking form on the full tour


def test_full_tour_tells_the_guest(client, db):
    tour_id = add_tour(db, seats=1)
    add_booking(db, tour_id, party_size=1)
    response = book(client, tour_id, party_size="1")
    assert response.status_code == 409
    assert 'role="alert"' in response.text and "Tour đã hết chỗ." in response.text
    other = book(client, add_tour(db, htx="LB"))
    assert other.status_code == 404 and "Không tìm thấy tour." in other.text
    assert db.execute("SELECT count(*) FROM bookings").fetchone()[0] == 1


def test_protected_routes_need_claims(client, db):
    tour_id, booking_id = uuid.uuid4(), uuid.uuid4()
    calls = [("GET", "/"), ("GET", "/guide"), ("GET", f"/tours/{tour_id}"), ("POST", "/tours"),
             ("POST", f"/tours/{tour_id}/cancel"), ("POST", f"/bookings/{booking_id}/confirm"),
             ("POST", f"/bookings/{booking_id}/cancel")]
    for method, path in calls:
        for headers in ({}, {"Authorization": "Bearer not-a-jwt"}, {"Authorization": "Basic eDp5"}):
            response = client.request(method, path, headers=headers)
            assert response.status_code == 401, (method, path, headers)
            assert "Cần đăng nhập" in response.text


def test_vietnamese_guest_name_round_trips(client, db):
    tour_id = add_tour(db)
    assert book(client, tour_id, guest_name="  Nguyễn Thị Hoa ", note="Ăn chay").status_code == 303
    assert db.execute("SELECT guest_name, phone, note FROM bookings").fetchone() == ("Nguyễn Thị Hoa", "0912345678", "Ăn chay")
    page = client.get(f"/tours/{tour_id}", headers=MANAGER)
    assert "Nguyễn Thị Hoa" in page.text and "0912345678" in page.text


def test_guide_must_be_household_of_htx(client, db, households):
    refused = client.post("/tours", headers=MANAGER, data={**FORM, "guide": "h-of-another-htx"})
    assert refused.status_code == 400
    assert 'role="alert"' in refused.text and "Người dẫn tour phải là một nông hộ của HTX." in refused.text
    assert db.execute("SELECT count(*) FROM tours").fetchone()[0] == 0

    created = client.post("/tours?theme=dark", headers=MANAGER, data=FORM)
    assert created.status_code == 303
    row = db.execute("SELECT id, htx_code, guide_user_id, guide_name, starts_at, seats, price_vnd FROM tours").fetchone()
    assert row[1:4] == ("TC", "kc-farmer-1", "Hộ ông Ba")
    assert row[4] == datetime(2030, 5, 1, 0, 30, tzinfo=timezone.utc) and row[5:] == (8, 250000)
    assert created.headers["location"] == f"/apps/tea-tour/tours/{row[0]}?theme=dark"
    assert households == [MANAGER["Authorization"], MANAGER["Authorization"]]


def test_create_tour_validates_every_field(client, db, households):
    bad = {"title": "", "starts_at": "2000-01-01T07:00", "meeting_point": "x" * 201, "seats": "51",
           "price_vnd": "-1", "description": "d" * 2001, "guide": "h1"}
    page = client.post("/tours", headers=MANAGER, data=bad)
    assert page.status_code == 400
    for message in ("Tên tour", "Thời gian", "Điểm hẹn", "Số chỗ", "Giá", "Mô tả"):
        assert message in page.text.split('role="alert"')[1].split("</div>")[0], message
    assert client.post("/tours", headers=MANAGER, data={**FORM, "starts_at": "mai"}).status_code == 400
    assert db.execute("SELECT count(*) FROM tours").fetchone()[0] == 0


def test_core_outage_keeps_the_tour_list(client, db, monkeypatch):
    add_tour(db, title="Tour vẫn hiện")

    def down(authorization):
        raise CoreError("timeout")

    monkeypatch.setattr(core_client, "list_households", down)
    page = client.get("/", headers=MANAGER)
    assert page.status_code == 200 and "Tour vẫn hiện" in page.text
    assert "Không lấy được danh sách nông hộ" in page.text and 'role="alert"' in page.text
    refused = client.post("/tours", headers=MANAGER, data=FORM)
    assert refused.status_code == 400 and "Không lấy được danh sách nông hộ" in refused.text
    assert db.execute("SELECT count(*) FROM tours").fetchone()[0] == 1  # only the tour added above


def test_manager_confirms_and_cancels_bookings_and_tours(client, db):
    tour_id = add_tour(db)
    pending = add_booking(db, tour_id, code="AAAA2222")
    lb_booking = add_booking(db, add_tour(db, htx="LB"), htx="LB", code="BBBB3333")
    confirmed = client.post(f"/bookings/{pending}/confirm", headers=MANAGER)
    assert confirmed.status_code == 303 and confirmed.headers["location"] == f"/apps/tea-tour/tours/{tour_id}"
    assert client.post(f"/bookings/{lb_booking}/confirm", headers=MANAGER).status_code == 404
    assert db.execute("SELECT status FROM bookings WHERE id = %s", (lb_booking,)).fetchone()[0] == "PENDING"
    assert client.post(f"/bookings/{pending}/cancel", headers=MANAGER).status_code == 303
    # A cancelled booking is never confirmed again: that could oversell the tour.
    assert client.post(f"/bookings/{pending}/confirm", headers=MANAGER).status_code == 303
    assert db.execute("SELECT status FROM bookings WHERE id = %s", (pending,)).fetchone()[0] == "CANCELLED"
    cancelled = client.post(f"/tours/{tour_id}/cancel?theme=light", headers=MANAGER)
    assert cancelled.headers["location"] == f"/apps/tea-tour/tours/{tour_id}?theme=light"
    assert db.execute("SELECT status FROM tours WHERE id = %s", (tour_id,)).fetchone()[0] == "CANCELLED"


def test_theme_is_echoed_and_kept(client, db, households):
    tour_id = add_tour(db)
    for theme in ("light", "dark"):
        for path, headers in (("/", MANAGER), (f"/tours/{tour_id}", MANAGER), ("/guide", FARMER), ("/public/TC", {})):
            page = client.get(f"{path}?theme={theme}", headers=headers).text
            assert f'<html lang="vi" data-theme="{theme}">' in page, path
            for target in re.findall(r'(?:action|href)="(/apps/tea-tour[^"]*)"', page):
                assert target.endswith(f"theme={theme}"), (path, target)
    page = client.get("/public/TC?theme=%22%3E%3Cb%3E").text
    assert '<html lang="vi">' in page and "theme=" not in page
    assert book(client, tour_id).headers["location"].endswith("&booked=1")
    themed = client.post(f"/public/TC/tours/{tour_id}/book?theme=dark",
                         data={"guest_name": "A", "phone": "0912345678", "party_size": "1"})
    assert themed.headers["location"].endswith("&booked=1&theme=dark")


def test_errors_are_vietnamese_pages(client, db):
    for path in ("/tours/not-a-uuid", "/no-such-page", "/public/TC/booking/x", "/public/T%20C"):
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


def test_core_client_sends_bearer_and_manager_role(monkeypatch):
    sent = {}

    class Reply:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self):
            return json.dumps({"data": {"households": [{"id": "h1", "name": "Hộ ông Ba", "keycloak_user_id": "kc-1"}]}}).encode()

    def fake_urlopen(request, timeout):
        sent.update(url=request.full_url, headers=dict(request.header_items()), timeout=timeout,
                    body=json.loads(request.data))
        return Reply()

    monkeypatch.setattr(core_client.urllib.request, "urlopen", fake_urlopen)
    assert core_client.list_households("Bearer t") == [Household("h1", "Hộ ông Ba", "kc-1")]
    assert sent["url"] == "http://apisix:9081/api/data/graphql" and sent["timeout"] == 5
    assert sent["headers"]["Authorization"] == "Bearer t" and sent["headers"]["X-hasura-role"] == "manager"
    assert "households" in sent["body"]["query"]

    for reply in (b'{"errors": [{"message": "x"}]}', b"not json", b'{"data": {"households": [{"id": 1}]}}'):
        monkeypatch.setattr(Reply, "read", lambda self, reply=reply: reply)
        with pytest.raises(CoreError):
            core_client.list_households("Bearer t")

    def refused(request, timeout):
        raise core_client.urllib.error.URLError("connection refused")

    monkeypatch.setattr(core_client.urllib.request, "urlopen", refused)
    with pytest.raises(CoreError):
        core_client.list_households("Bearer t")


EDIT = {**FORM, "title": "Hái chè chiều", "starts_at": "2030-06-02T15:00", "meeting_point": "Đồi chè số 3",
        "seats": "12", "price_vnd": "300000", "description": "Mới", "guide": "h2"}


def edit(client, tour_id, **form):
    return client.post(f"/tours/{tour_id}/edit", headers=MANAGER, data={**EDIT, **form})


def tour_row(db, tour_id):
    return db.execute("SELECT title, seats, price_vnd, guide_name, guide_user_id FROM tours WHERE id = %s",
                      (tour_id,)).fetchone()


def test_confirm_on_cancelled_tour_stays_pending(client, db):
    tour_id = add_tour(db)
    booking_id = add_booking(db, tour_id)
    assert client.post(f"/tours/{tour_id}/cancel", headers=MANAGER).status_code == 303
    response = client.post(f"/bookings/{booking_id}/confirm?theme=dark", headers=MANAGER)
    assert response.status_code == 303
    assert response.headers["location"] == f"/apps/tea-tour/tours/{tour_id}?notice=unchanged&theme=dark"
    assert db.execute("SELECT status FROM bookings WHERE id = %s", (booking_id,)).fetchone()[0] == "PENDING"
    page = client.get(f"/tours/{tour_id}?notice=unchanged", headers=MANAGER).text
    assert 'role="status"' in page and "Không có gì thay đổi" in page
    assert ">Xác nhận</button>" not in page


def test_notice_takes_only_known_keys(client, db):
    tour_id = add_tour(db)
    page = client.get(f"/tours/{tour_id}?notice=%3Cb%3Eforged", headers=MANAGER).text
    assert "forged" not in page and 'role="status"' not in page


def test_noop_cancel_shows_notice(client, db):
    tour_id = add_tour(db)
    booking_id = add_booking(db, tour_id, status="CANCELLED")
    response = client.post(f"/bookings/{booking_id}/cancel", headers=MANAGER)
    assert response.headers["location"] == f"/apps/tea-tour/tours/{tour_id}?notice=unchanged"


def test_edit_tour_saves_and_redirects(client, db, households):
    tour_id = add_tour(db, seats=5, guide_user_id="kc-farmer-1", guide_name="Hộ ông Ba",
                       starts_at=datetime(2030, 5, 1, 0, 30, tzinfo=timezone.utc))
    page = client.get(f"/tours/{tour_id}", headers=MANAGER).text
    assert f'href="/apps/tea-tour/tours/{tour_id}/edit"' in page
    form = client.get(f"/tours/{tour_id}/edit", headers=MANAGER)
    assert form.status_code == 200
    assert 'value="2030-05-01T07:30"' in form.text and '<option value="h1" selected>' in form.text
    response = edit(client, tour_id)
    assert response.status_code == 303
    assert response.headers["location"] == f"/apps/tea-tour/tours/{tour_id}?notice=saved"
    assert tour_row(db, tour_id) == ("Hái chè chiều", 12, 300000, "Hộ bà Tư", None)


def test_edit_tour_from_another_htx_is_404(client, db, households):
    lb_tour = add_tour(db, htx="LB", title="Tour La Bằng")
    assert client.get(f"/tours/{lb_tour}/edit", headers=MANAGER).status_code == 404
    assert edit(client, lb_tour).status_code == 404
    assert tour_row(db, lb_tour)[0] == "Tour La Bằng"


def test_edit_refuses_seats_below_booked(client, db, households):
    tour_id = add_tour(db, seats=5)
    add_booking(db, tour_id, code="AAAA2222", party_size=2)
    add_booking(db, tour_id, code="BBBB3333", party_size=1, status="CONFIRMED")
    add_booking(db, tour_id, code="CCCC4444", party_size=2, status="CANCELLED")
    refused = edit(client, tour_id, seats="2")
    assert refused.status_code == 400
    assert 'role="alert"' in refused.text and "Số chỗ không được ít hơn số chỗ khách đã đặt (3)." in refused.text
    assert tour_row(db, tour_id)[1] == 5
    assert edit(client, tour_id, seats="3").status_code == 303
    assert tour_row(db, tour_id)[1] == 3


def test_edit_with_forged_guide_is_400(client, db, households):
    tour_id = add_tour(db, title="Giữ nguyên")
    refused = edit(client, tour_id, guide="h-of-another-htx")
    assert refused.status_code == 400 and "Người dẫn tour phải là một nông hộ của HTX." in refused.text
    assert tour_row(db, tour_id)[0] == "Giữ nguyên"


def test_cancelled_or_past_tour_cannot_be_edited(client, db, households):
    for tour_id in (add_tour(db, title="Đã huỷ", status="CANCELLED"),
                    add_tour(db, title="Đã qua", starts_at=datetime.now(timezone.utc) - timedelta(hours=1))):
        assert client.get(f"/tours/{tour_id}/edit", headers=MANAGER).status_code == 409
        response = edit(client, tour_id)
        assert response.status_code == 409 and "không sửa được" in response.text
        assert tour_row(db, tour_id)[0] in ("Đã huỷ", "Đã qua")
        assert f"/tours/{tour_id}/edit" not in client.get(f"/tours/{tour_id}", headers=MANAGER).text


def test_db_busy_answers_503(client, db, monkeypatch):
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


def test_households_are_fetched_without_holding_a_connection(client, db, monkeypatch):
    tour_id = add_tour(db)
    free_slots = []

    def fake(authorization):
        taken = [main.DB_SLOTS.acquire(blocking=False) for _ in range(main.DB_MAX_CONNECTIONS)]
        free_slots.append(sum(taken))
        for got in taken:
            if got:
                main.DB_SLOTS.release()
        return HOUSEHOLDS

    monkeypatch.setattr(core_client, "list_households", fake)
    client.get("/", headers=MANAGER)
    client.post("/tours", headers=MANAGER, data=FORM)
    client.get(f"/tours/{tour_id}/edit", headers=MANAGER)
    edit(client, tour_id)
    assert free_slots == [main.DB_MAX_CONNECTIONS] * 4


def test_starts_at_with_an_offset_keeps_it(client, db, households):
    assert client.post("/tours", headers=MANAGER, data={**FORM, "starts_at": "2030-05-01T07:30+00:00"}).status_code == 303
    assert db.execute("SELECT starts_at FROM tours").fetchone()[0] == datetime(2030, 5, 1, 7, 30, tzinfo=timezone.utc)


def test_guest_name_is_escaped_on_the_manager_page(client, db):
    tour_id = add_tour(db)
    assert book(client, tour_id, guest_name="<b>x</b>").status_code == 303
    page = client.get(f"/tours/{tour_id}", headers=MANAGER).text
    assert "&lt;b&gt;x&lt;/b&gt;" in page and "<b>x</b>" not in page
