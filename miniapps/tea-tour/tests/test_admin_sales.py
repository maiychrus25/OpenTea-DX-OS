# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Back office sales desk: overview, bookings, payments, customers, reviews and inquiries, reports (spec 6, 7)."""
import re
from datetime import datetime, timedelta, timezone

import pytest
from factories import (NOW, add_booking, add_departure, add_event, add_inquiry, add_payment, add_review, add_settings,
                       add_tour, bearer)

from tea_tour.domain import money
from tea_tour.domain.policy import VN_TZ
from tea_tour.store import core, sales

MANAGER = bearer()
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nông hộ Một")
OTHER = bearer(sub="kc-manager-lb", htx="LB", name="Quản trị LB")
FIXED = datetime(2026, 11, 15, 5, 0, tzinfo=timezone.utc)  # 12:00 in Vietnam, mid-month


def at(day: int, month: int = 11, hour: int = 7) -> datetime:
    return datetime(2026, month, day, hour, 0, tzinfo=VN_TZ)


def text_of(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))


# ---------- overview ----------

def test_overview_figures_of_a_small_fixed_month(db):
    tour = add_tour(db)
    past = add_departure(db, tour, starts_at=at(3))
    soon = add_departure(db, tour, starts_at=at(18))
    cancelled = add_departure(db, tour, starts_at=at(20), status="CANCELLED")
    far = add_departure(db, tour, starts_at=at(20, 12))
    add_booking(db, past, adults=2, status="CONFIRMED")
    add_booking(db, soon, adults=2, children=1, status="CONFIRMED")
    add_booking(db, soon, adults=1)  # pending
    reported = add_booking(db, soon, adults=1, guest_paid_reported_at=NOW)
    paid = add_booking(db, cancelled, adults=1, status="CANCELLED", cancel_reason="HTX huỷ chuyến")
    add_payment(db, paid, 100_000, recorded_at=at(2))
    add_booking(db, far, adults=1, status="CONFIRMED")
    add_payment(db, reported, 300_000, recorded_at=at(5), sync=False)
    add_payment(db, reported, -50_000, recorded_at=at(10), sync=False)
    add_payment(db, reported, 999_000, recorded_at=at(30, 10), sync=False)  # last month: not counted
    review_booking = add_booking(db, past, adults=1, status="CONFIRMED", checked_in_count=1)
    add_review(db, review_booking, tour, status="PENDING")
    add_inquiry(db)
    add_inquiry(db)
    add_inquiry(db, status="CONTACTED")
    add_tour(db, htx="LB")
    view = sales.overview(db, "TC", now=FIXED)
    assert view.upcoming_departures == 2  # soon and far; cancelled and past ones are not upcoming
    assert view.guests_month == 2 + 3 + 1  # confirmed guests of departures in November
    assert view.collected_month == 350_000  # 300.000 + 100.000 in, 50.000 out; October money is out
    assert (view.pending, view.reported) == (2, 1)
    assert (view.refund_count, view.refund_vnd) == (1, 100_000)
    assert (view.reviews_pending, view.inquiries_new) == (1, 2)
    assert [row.departure_id for row in view.soon] == [soon]
    assert view.soon[0].seats_used == 5 and view.soon[0].seats == 10


def test_overview_of_another_cooperative_is_empty(db):
    tour = add_tour(db)
    add_booking(db, add_departure(db, tour, starts_at=at(18)), status="CONFIRMED")
    view = sales.overview(db, "LB", now=FIXED)
    assert (view.upcoming_departures, view.guests_month, view.pending, view.soon) == (0, 0, 0, [])


def test_overview_page_needs_the_manager_role(client):
    assert client.get("/").status_code == 401
    assert client.get("/", headers=FARMER).status_code == 403


def test_overview_page_shows_the_figures_todo_and_customer_link(client, db):
    tour = add_tour(db)
    soon = add_departure(db, tour, starts_at=NOW + timedelta(days=2))
    add_booking(db, soon, guest_name="Trần Thị Chờ", deposit_vnd=50_000)
    add_inquiry(db, name="Cô Hạnh")
    reply = client.get("/?theme=dark", headers=MANAGER)
    assert reply.status_code == 200
    body = reply.text
    for label in ("Chuyến sắp tới", "Khách tháng này", "Đã thu tháng này", "Chờ xác nhận", "Khách báo đã chuyển",
                  "Cần hoàn tiền", "Một ngày làm người hái chè"):
        assert label in body
    assert "Trần Thị Chờ" in body and "/apps/tea-tour/bookings?status=PENDING" in body
    assert "/apps/tea-tour/reviews" in body and "/apps/tea-tour/public/TC" in body
    assert f"/apps/tea-tour/departures/{soon}" in body


def test_opening_the_overview_cancels_an_expired_hold(client, db):
    tour = add_tour(db)
    dep = add_departure(db, tour)
    stale = add_booking(db, dep, deposit_vnd=50_000, hold_until=NOW - timedelta(hours=1))
    assert client.get("/", headers=MANAGER).status_code == 200
    assert core.get_booking(db, "TC", stale).status == "CANCELLED"


def test_other_cooperatives_data_is_not_on_my_overview(client, db):
    other_tour = add_tour(db, htx="LB", title="Tour của LB")
    other_dep = add_departure(db, other_tour, htx="LB", starts_at=NOW + timedelta(days=2))
    add_booking(db, other_dep, htx="LB", guest_name="Khách LB bí mật")
    body = client.get("/", headers=MANAGER).text
    assert "Tour của LB" not in body and "Khách LB bí mật" not in body


# ---------- bookings: list, filters, search, CSV ----------

def booking_codes(client, query="", path="/bookings"):
    html = client.get(f"{path}{query}", headers=MANAGER).text
    return re.findall(r'href="/apps/tea-tour/bookings/[0-9a-f-]{36}[^"]*">([A-Z0-9]{8})<', html)


def make(db, **fields):
    """A booking of the demo tour on its own departure unless one is given; returns (booking id, code)."""
    departure = fields.pop("departure", None) or add_departure(db, add_tour(db), starts_at=NOW + timedelta(days=3))
    booking = add_booking(db, departure, **fields)
    return booking, db.execute("SELECT code FROM bookings WHERE id = %s", (booking,)).fetchone()[0]


def test_bookings_list_needs_the_manager_role(client):
    assert client.get("/bookings").status_code == 401
    assert client.get("/bookings", headers=FARMER).status_code == 403
    assert client.get("/bookings/export.csv", headers=FARMER).status_code == 403


def test_bookings_list_filters_by_status(client, db):
    _, pending = make(db)
    _, confirmed = make(db, status="CONFIRMED")
    _, cancelled = make(db, status="CANCELLED", cancel_reason="x")
    assert booking_codes(client, "?status=CONFIRMED") == [confirmed]
    assert booking_codes(client, "?status=CANCELLED") == [cancelled]
    assert sorted(booking_codes(client)) == sorted([pending, confirmed, cancelled])
    assert sorted(booking_codes(client, "?status=bogus")) == sorted([pending, confirmed, cancelled])  # ignored, not an error


@pytest.mark.parametrize("status,total,paid", [
    ("PENDING", 250_000, 0), ("CONFIRMED", 250_000, 100_000), ("CONFIRMED", 250_000, 250_000),
    ("CONFIRMED", 250_000, 300_000), ("CANCELLED", 250_000, 0), ("CANCELLED", 250_000, 50_000),
    ("CONFIRMED", 0, 0), ("PENDING", 250_000, 250_000)])
def test_payment_filter_agrees_with_the_domain_rule(client, db, status, total, paid):
    booking, code = make(db, status=status, adults=1, total_vnd=total, paid_vnd=paid,
                         **({"cancel_reason": "x"} if status == "CANCELLED" else {}))
    expected = money.payment_state(status, total, paid)
    for state in ("UNPAID", "DEPOSITED", "PAID", "REFUND_DUE"):
        assert (code in booking_codes(client, f"?payment={state}")) == (state == expected), state


def test_reported_filter_lists_pending_bookings_that_told_us_they_paid(client, db):
    _, reported = make(db, guest_paid_reported_at=NOW)
    make(db)
    assert booking_codes(client, "?reported=1") == [reported]


def test_bookings_list_filters_by_departure_and_by_departure_date(client, db):
    tour = add_tour(db)
    early = add_departure(db, tour, starts_at=at(3))
    late = add_departure(db, tour, starts_at=at(20, 12))
    _, in_early = make(db, departure=early)
    _, in_late = make(db, departure=late)
    assert booking_codes(client, f"?departure={early}") == [in_early]
    assert booking_codes(client, "?from=2026-12-10&to=2026-12-31") == [in_late]
    assert booking_codes(client, "?from=2026-12-01") == [in_late]
    assert booking_codes(client, "?to=2026-12-03") == [in_early]
    assert sorted(booking_codes(client, "?from=nonsense&departure=nonsense")) == sorted([in_early, in_late])


def test_search_matches_code_name_and_phone_literally(client, db):
    _, first = make(db, guest_name="Lê Thị Hoa", phone="0911111111")
    _, second = make(db, guest_name="Phạm 100% Chè_Xanh", phone="0922222222")
    assert booking_codes(client, "?q=hoa") == [first]
    assert booking_codes(client, "?q=0922") == [second]
    assert booking_codes(client, f"?q={first[:4].lower()}") == [first]
    assert booking_codes(client, "?q=100%25") == [second]  # the percent sign is not a wildcard
    assert booking_codes(client, "?q=%25") == [second]
    assert booking_codes(client, "?q=_") == [second]
    assert booking_codes(client, "?q=khong-co") == []
    assert "Không có lượt đặt nào khớp" in client.get("/bookings?q=khong-co", headers=MANAGER).text


def test_bookings_list_pages_of_25_and_keeps_the_filters_in_the_links(client, db):
    departure = add_departure(db, add_tour(db), seats=100, starts_at=NOW + timedelta(days=3))
    for index in range(30):
        add_booking(db, departure, guest_name=f"Khách {index:02d}", created_at=NOW - timedelta(minutes=index))
    first = booking_codes(client, "?status=PENDING")
    second = booking_codes(client, "?status=PENDING&page=2")
    assert len(first) == 25 and len(second) == 5 and not set(first) & set(second)
    html = client.get("/bookings?status=PENDING", headers=MANAGER).text
    assert "Trang 1/2" in html and "status=PENDING&amp;page=2" in html
    assert len(booking_codes(client, "?page=99")) == 5  # beyond the end: the last page


def test_bookings_of_another_cooperative_are_not_listed_or_exported(client, db):
    other_departure = add_departure(db, add_tour(db, htx="LB"), htx="LB", starts_at=NOW + timedelta(days=3))
    other = add_booking(db, other_departure, htx="LB", guest_name="Khách LB")
    code = db.execute("SELECT code FROM bookings WHERE id = %s", (other,)).fetchone()[0]
    make(db)
    assert code not in booking_codes(client)
    assert code not in client.get("/bookings/export.csv", headers=MANAGER).text
    assert code in client.get("/bookings/export.csv", headers=OTHER).text


def test_hostile_guest_name_is_text_in_the_page_and_neutralised_in_csv(client, db):
    make(db, guest_name="<script>alert(1)</script>", note='=HYPERLINK("http://x")')
    make(db, guest_name='=HYPERLINK("http://x")')
    html = client.get("/bookings", headers=MANAGER).text
    assert "<script>alert(1)</script>" not in html and "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    reply = client.get("/bookings/export.csv", headers=MANAGER)
    assert reply.status_code == 200 and reply.headers["content-type"].startswith("text/csv")
    assert reply.content.startswith("﻿".encode()) and b"\r\n" in reply.content
    assert "attachment" in reply.headers["content-disposition"] and "tea-tour-TC-" in reply.headers["content-disposition"]
    assert "'=HYPERLINK" in reply.text and ",=HYPERLINK" not in reply.text


def test_csv_follows_the_filters_and_has_every_row_not_just_one_page(client, db):
    departure = add_departure(db, add_tour(db), seats=100, starts_at=NOW + timedelta(days=3))
    for index in range(30):
        add_booking(db, departure, guest_name=f"Khách {index}")
    add_booking(db, departure, guest_name="Khách huỷ", status="CANCELLED", cancel_reason="x")
    all_rows = client.get("/bookings/export.csv?status=PENDING", headers=MANAGER).text.strip().split("\r\n")
    assert len(all_rows) == 31  # header + 30
    assert "Mã đặt chỗ" in all_rows[0] and "Số điện thoại" in all_rows[0]


# ---------- booking page: history and actions through the core ----------

def post(client, path, headers=MANAGER, **data):
    return client.post(path, data=data, headers=headers)


def page_of(client, booking, query="", headers=MANAGER):
    return client.get(f"/bookings/{booking}{query}", headers=headers)


def desk(db, **fields):
    """A booking that can be acted on: deposit 75.000 of 250.000, on a departure with room and a second one to move to."""
    tour = add_tour(db)
    departure = add_departure(db, tour, starts_at=NOW + timedelta(days=3), seats=10)
    other = add_departure(db, tour, starts_at=NOW + timedelta(days=5), seats=10)
    booking = add_booking(db, departure, deposit_vnd=75_000, **fields)
    return booking, departure, other, tour


def test_booking_page_shows_details_history_and_payments(client, db):
    booking, departure, _, _ = desk(db, guest_name="Ngô Thị Lan", note="Đi cùng bà ngoại", internal_note="Khách quen")
    add_event(db, booking, kind="CREATED", detail="Đặt chỗ: 1 người lớn", actor_name="Ngô Thị Lan")
    add_event(db, booking, kind="PAYMENT", actor_kind="MANAGER", actor_name="Chị Lan", detail="Thu 50.000 ₫ (tiền mặt)")
    add_payment(db, booking, 50_000, method="CASH", recorded_by_name="Chị Lan", note="cọc")
    reply = page_of(client, booking)
    assert reply.status_code == 200
    body = text_of(reply.text)
    for expected in ("Ngô Thị Lan", "0912345678", "Đi cùng bà ngoại", "Khách quen", "Đặt chỗ: 1 người lớn",
                     "Thu 50.000 ₫ (tiền mặt)", "Chị Lan", "50.000 ₫", "Còn phải thu", "Lịch sử", "Sổ thu"):
        assert expected in body, expected
    assert f"/apps/tea-tour/departures/{departure}" in reply.text


def test_booking_page_is_404_for_a_stranger_a_bad_id_and_another_cooperative(client, db):
    booking, *_ = desk(db)
    assert page_of(client, booking, headers=OTHER).status_code == 404
    assert client.get("/bookings/not-a-uuid", headers=MANAGER).status_code == 404
    assert client.get("/bookings/00000000-0000-0000-0000-000000000000", headers=MANAGER).status_code == 404
    assert page_of(client, booking, headers=FARMER).status_code == 403


def test_other_cooperatives_booking_is_404_on_every_action_and_stays_untouched(client, db):
    booking, departure, other, _ = desk(db)
    forms = {"confirm": {}, "payments": {"amount": "50000", "kind": "in", "method": "CASH"},
             "cancel": {"reason": "x"}, "move": {"departure": str(other)}, "resize": {"adults": "2", "children": "0"},
             "note": {"note": "x"}}
    for action, data in forms.items():
        assert post(client, f"/bookings/{booking}/{action}", OTHER, **data).status_code == 404, action
    row = db.execute("SELECT status, paid_vnd, adults, departure_id, internal_note FROM bookings WHERE id = %s",
                     (booking,)).fetchone()
    assert row == ("PENDING", 0, 1, departure, None)


def test_confirm_moves_pending_to_confirmed_and_writes_history(client, db):
    booking, *_ = desk(db)
    reply = post(client, f"/bookings/{booking}/confirm")
    assert reply.status_code == 303 and reply.headers["location"].startswith(f"/apps/tea-tour/bookings/{booking}")
    assert core.get_booking(db, "TC", booking).status == "CONFIRMED"
    detail = text_of(page_of(client, booking, "?done=confirm").text)
    assert "Đã xác nhận lượt đặt" in detail and "Quản trị TC" in detail
    again = post(client, f"/bookings/{booking}/confirm")  # already confirmed: the core refuses
    assert again.status_code == 409 and core.Refusal.WRONG_STATE.message in again.text


def test_recording_a_payment_updates_the_ledger_and_confirms_at_the_deposit(client, db):
    booking, *_ = desk(db)
    assert post(client, f"/bookings/{booking}/payments", amount="50.000", kind="in", method="CASH", note="tại quầy").status_code == 303
    assert core.get_booking(db, "TC", booking).paid_vnd == 50_000 and core.get_booking(db, "TC", booking).status == "PENDING"
    assert post(client, f"/bookings/{booking}/payments", amount="25000", kind="in", method="TRANSFER", note="").status_code == 303
    after = core.get_booking(db, "TC", booking)
    assert (after.paid_vnd, after.status) == (75_000, "CONFIRMED")  # reached the deposit
    ledger = db.execute("SELECT amount_vnd, method, note, recorded_by_name FROM payments WHERE booking_id = %s "
                        "ORDER BY recorded_at", (booking,)).fetchall()
    assert ledger == [(50_000, "CASH", "tại quầy", "Quản trị TC"), (25_000, "TRANSFER", None, "Quản trị TC")]


def test_a_refund_is_a_negative_ledger_line_and_cannot_go_below_zero(client, db):
    booking, *_ = desk(db)
    post(client, f"/bookings/{booking}/payments", amount="100000", kind="in", method="CASH", note="")
    assert post(client, f"/bookings/{booking}/payments", amount="30000", kind="out", method="CASH", note="trả bớt").status_code == 303
    assert core.get_booking(db, "TC", booking).paid_vnd == 70_000
    assert db.execute("SELECT min(amount_vnd) FROM payments WHERE booking_id = %s", (booking,)).fetchone()[0] == -30_000
    refused = post(client, f"/bookings/{booking}/payments", amount="80000", kind="out", method="CASH", note="")
    assert refused.status_code == 409 and core.Refusal.PAYMENT_BELOW_ZERO.message in refused.text
    assert core.get_booking(db, "TC", booking).paid_vnd == 70_000


def test_a_payment_above_the_total_is_refused_with_the_core_message(client, db):
    booking, *_ = desk(db)
    reply = post(client, f"/bookings/{booking}/payments", amount="250001", kind="in", method="CASH", note="")
    assert reply.status_code == 409 and core.Refusal.PAYMENT_ABOVE_TOTAL.message in reply.text
    assert core.get_booking(db, "TC", booking).paid_vnd == 0


@pytest.mark.parametrize("data", [{"amount": "", "kind": "in", "method": "CASH"}, {"amount": "abc", "kind": "in", "method": "CASH"},
                                  {"amount": "0", "kind": "in", "method": "CASH"}, {"amount": "-5", "kind": "in", "method": "CASH"},
                                  {"amount": "1000", "kind": "sideways", "method": "CASH"}, {"amount": "1000", "kind": "in", "method": "BITCOIN"},
                                  {"amount": "1000", "kind": "in", "method": "CASH", "note": "x" * 201}])
def test_a_bad_payment_form_is_422_and_keeps_what_was_typed(client, db, data):
    booking, *_ = desk(db)
    reply = post(client, f"/bookings/{booking}/payments", **{"note": "ghi chú của tôi", **data})
    assert reply.status_code == 422 and 'role="alert"' in reply.text
    assert core.get_booking(db, "TC", booking).paid_vnd == 0
    if "note" not in data:
        assert "ghi chú của tôi" in reply.text


def test_cancel_needs_a_reason_and_records_who_cancelled(client, db):
    booking, *_ = desk(db)
    missing = post(client, f"/bookings/{booking}/cancel", reason="   ")
    assert missing.status_code == 422 and core.Refusal.REASON_REQUIRED.message in missing.text
    assert core.get_booking(db, "TC", booking).status == "PENDING"
    assert post(client, f"/bookings/{booking}/cancel", reason="Khách đổi kế hoạch").status_code == 303
    after = core.get_booking(db, "TC", booking)
    assert (after.status, after.cancelled_by, after.cancel_reason) == ("CANCELLED", "MANAGER", "Khách đổi kế hoạch")
    assert "Khách đổi kế hoạch" in page_of(client, booking).text
    assert post(client, f"/bookings/{booking}/cancel", reason="lần hai").status_code == 409


def test_cancelling_a_paid_booking_puts_it_under_refund_due(client, db):
    booking, *_ = desk(db)
    post(client, f"/bookings/{booking}/payments", amount="100000", kind="in", method="CASH", note="")
    post(client, f"/bookings/{booking}/cancel", reason="Mưa lớn")
    assert "Cần hoàn tiền" in page_of(client, booking).text
    assert booking_codes(client, "?payment=REFUND_DUE") == [db.execute("SELECT code FROM bookings WHERE id = %s", (booking,)).fetchone()[0]]


def test_move_to_another_departure_of_the_same_tour_only(client, db):
    booking, departure, other, tour = desk(db)
    foreign = add_departure(db, add_tour(db, title="Tour khác"), starts_at=NOW + timedelta(days=4))
    page_html = page_of(client, booking).text
    assert str(other) in page_html and str(foreign) not in page_html  # only same-tour targets are offered
    assert post(client, f"/bookings/{booking}/move", departure=str(foreign)).status_code == 409
    assert post(client, f"/bookings/{booking}/move", departure=str(departure)).status_code == 409  # same departure
    assert post(client, f"/bookings/{booking}/move", departure="junk").status_code == 422
    assert post(client, f"/bookings/{booking}/move", departure=str(other)).status_code == 303
    assert core.get_booking(db, "TC", booking).departure_id == other


def test_resize_recomputes_the_total_and_refuses_bad_or_full_parties(client, db):
    booking, departure, *_ = desk(db)
    assert post(client, f"/bookings/{booking}/resize", adults="2", children="1").status_code == 303
    after = core.get_booking(db, "TC", booking)
    assert (after.party_size, after.total_vnd) == (3, 650_000)
    for adults, children in (("0", "0"), ("x", "1"), ("", ""), ("-1", "2")):
        assert post(client, f"/bookings/{booking}/resize", adults=adults, children=children).status_code == 422
    assert post(client, f"/bookings/{booking}/resize", adults="30", children="0").status_code == 409  # more than the seats
    assert core.get_booking(db, "TC", booking).party_size == 3


def test_internal_note_is_saved_cleared_and_limited(client, db):
    booking, *_ = desk(db)
    assert post(client, f"/bookings/{booking}/note", note="Gọi lại sau 5 giờ").status_code == 303
    assert core.get_booking(db, "TC", booking).internal_note == "Gọi lại sau 5 giờ"
    assert "Gọi lại sau 5 giờ" in page_of(client, booking).text
    too_long = post(client, f"/bookings/{booking}/note", note="x" * 501)
    assert too_long.status_code == 422 and core.get_booking(db, "TC", booking).internal_note == "Gọi lại sau 5 giờ"
    assert post(client, f"/bookings/{booking}/note", note="  ").status_code == 303
    assert core.get_booking(db, "TC", booking).internal_note is None


def test_hostile_text_on_the_booking_page_is_escaped(client, db):
    booking, *_ = desk(db, guest_name="<script>alert(1)</script>", note="<img src=x onerror=alert(1)>",
                       internal_note="<b>đậm</b>")
    html = page_of(client, booking).text
    assert "<script>alert(1)" not in html and "<img src=x" not in html and "<b>đậm</b>" not in html
    assert "&lt;script&gt;" in html


def test_an_expired_hold_is_cancelled_by_the_system_when_a_manager_acts(client, db):
    booking, *_ = desk(db, hold_until=NOW - timedelta(hours=1))
    reply = post(client, f"/bookings/{booking}/confirm")
    assert reply.status_code == 409  # the core swept first: WRONG_STATE
    assert core.get_booking(db, "TC", booking).cancelled_by == "SYSTEM"


# ---------- booking on behalf of a caller ----------

def new_form(target, **fields):
    return {"departure": str(target), "adults": "2", "children": "1", "guest_name": "Võ Thị Gọi", "phone": "0988 111 222",
            "email": "", "note": "Gọi lúc 8 giờ", "request_key": "k" * 16, **fields}


def test_new_booking_form_lists_open_and_closed_departures_with_seats_left(client, db):
    tour = add_tour(db, title="Tour nháp", status="DRAFT")
    open_dep = add_departure(db, tour, starts_at=NOW + timedelta(days=3), seats=10)
    closed = add_departure(db, tour, starts_at=NOW + timedelta(days=4), status="CLOSED")
    gone = add_departure(db, tour, starts_at=NOW + timedelta(days=5), status="CANCELLED")
    past = add_departure(db, tour, starts_at=NOW - timedelta(days=1))
    add_booking(db, open_dep, adults=4, status="CONFIRMED")
    html = client.get(f"/bookings/new?departure={closed}", headers=MANAGER).text
    assert str(open_dep) in html and str(closed) in html and str(gone) not in html and str(past) not in html
    assert "còn 6 chỗ" in html and re.search(rf'value="{closed}"\s+selected', html)
    assert re.search(r'name="request_key" value="[A-Za-z0-9_-]{16,}"', html)


def test_manager_books_for_a_caller_as_source_manager(client, db):
    tour = add_tour(db, status="DRAFT")  # a manager may book any tour status
    departure = add_departure(db, tour, starts_at=NOW + timedelta(days=3), status="CLOSED")
    reply = post(client, "/bookings", **new_form(departure))
    assert reply.status_code == 303
    row = db.execute("SELECT id, source, phone, adults, children, guest_name FROM bookings WHERE htx_code = 'TC'").fetchall()
    assert len(row) == 1 and row[0][1:] == ("MANAGER", "0988111222", 2, 1, "Võ Thị Gọi")
    assert reply.headers["location"].startswith(f"/apps/tea-tour/bookings/{row[0][0]}")
    history = db.execute("SELECT actor_kind, actor_name FROM booking_events WHERE booking_id = %s AND kind = 'CREATED'",
                         (row[0][0],)).fetchone()
    assert history == ("MANAGER", "Quản trị TC")


def test_sending_the_same_form_twice_makes_one_booking(client, db):
    departure = add_departure(db, add_tour(db), starts_at=NOW + timedelta(days=3))
    first = post(client, "/bookings", **new_form(departure))
    second = post(client, "/bookings", **new_form(departure))
    assert first.status_code == second.status_code == 303 and first.headers["location"] == second.headers["location"]
    assert db.execute("SELECT count(*) FROM bookings").fetchone()[0] == 1


@pytest.mark.parametrize("change", [{"phone": "12345"}, {"guest_name": "  "}, {"adults": "x"}, {"adults": "0", "children": "0"},
                                    {"children": "-1"}, {"departure": "junk"}, {"email": "e" * 121}, {"note": "n" * 501},
                                    {"request_key": "short"}, {"guest_name": "g" * 81}])
def test_new_booking_with_bad_input_is_422_with_the_form_refilled(client, db, change):
    departure = add_departure(db, add_tour(db), starts_at=NOW + timedelta(days=3))
    reply = post(client, "/bookings", **new_form(departure, **change))
    assert reply.status_code == 422 and 'role="alert"' in reply.text
    assert db.execute("SELECT count(*) FROM bookings").fetchone()[0] == 0
    if "guest_name" not in change:
        assert "Võ Thị Gọi" in reply.text


def test_new_booking_beyond_the_seats_left_is_409_and_creates_nothing(client, db):
    departure = add_departure(db, add_tour(db), starts_at=NOW + timedelta(days=3), seats=3)
    add_booking(db, departure, adults=2, status="CONFIRMED")
    reply = post(client, "/bookings", **new_form(departure))  # 3 people, 1 seat left
    assert reply.status_code == 409 and core.Refusal.FULL.message in reply.text
    assert db.execute("SELECT count(*) FROM bookings").fetchone()[0] == 1
    assert post(client, "/bookings", **new_form(departure, adults="1", children="0", request_key="z" * 16)).status_code == 303


def test_new_booking_on_a_cancelled_departure_or_another_cooperatives_is_refused(client, db):
    gone = add_departure(db, add_tour(db), starts_at=NOW + timedelta(days=3), status="CANCELLED")
    assert post(client, "/bookings", **new_form(gone)).status_code == 409
    foreign = add_departure(db, add_tour(db, htx="LB"), htx="LB", starts_at=NOW + timedelta(days=3))
    assert post(client, "/bookings", **new_form(foreign, request_key="y" * 16)).status_code == 404
    assert db.execute("SELECT count(*) FROM bookings").fetchone()[0] == 0


# ---------- payments ledger ----------

def ledger(db):
    """Three bookings with money on known days (Vietnam time): returns their ledger ids."""
    tour = add_tour(db)
    departure = add_departure(db, tour, starts_at=NOW + timedelta(days=3), seats=50)
    first = add_booking(db, departure, guest_name="Mai Thu Một", total_vnd=1_000_000)
    second = add_booking(db, departure, guest_name="Mai Thu Hai", total_vnd=1_000_000)
    return {
        "a": add_payment(db, first, 500_000, method="TRANSFER", recorded_at=at(2, 11, 9), note="cọc"),
        "b": add_payment(db, first, 200_000, method="CASH", recorded_at=at(10, 11, 9)),
        "c": add_payment(db, first, -100_000, method="CASH", recorded_at=at(12, 11, 9), note="hoàn bớt"),
        "d": add_payment(db, second, 300_000, method="TRANSFER", recorded_at=at(12, 11, 23)),  # 23:00 VN, still the 12th
        "first": first, "second": second,
    }


def ledger_rows(client, query=""):
    html = client.get(f"/payments{query}", headers=MANAGER).text
    return re.findall(r'data-label="Số tiền"><strong class="(?:in|out)">([^<]+)</strong>', html)


def test_payments_need_the_manager_role(client):
    for path in ("/payments", "/payments/export.csv", "/customers", "/customers/export.csv"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers=FARMER).status_code == 403


def test_ledger_lists_newest_first_with_totals(client, db):
    ledger(db)
    assert ledger_rows(client) == ["+300.000 ₫", "-100.000 ₫", "+200.000 ₫", "+500.000 ₫"]
    body = text_of(client.get("/payments", headers=MANAGER).text)
    assert "Tổng thu 1.000.000 ₫" in body and "Tổng hoàn 100.000 ₫" in body and "Còn lại 900.000 ₫" in body


def test_ledger_filters_by_method_by_day_and_by_booking_code(client, db):
    data = ledger(db)
    code = db.execute("SELECT code FROM bookings WHERE id = %s", (data["second"],)).fetchone()[0]
    assert ledger_rows(client, "?method=CASH") == ["-100.000 ₫", "+200.000 ₫"]
    assert ledger_rows(client, "?from=2026-11-12&to=2026-11-12") == ["+300.000 ₫", "-100.000 ₫"]  # 23:00 on the 12th included
    assert ledger_rows(client, "?from=2026-11-10") == ["+300.000 ₫", "-100.000 ₫", "+200.000 ₫"]
    assert ledger_rows(client, f"?q={code.lower()}") == ["+300.000 ₫"]
    assert ledger_rows(client, "?q=%25") == []  # a percent sign is not a wildcard
    assert ledger_rows(client, "?method=BITCOIN&from=nonsense") == ["+300.000 ₫", "-100.000 ₫", "+200.000 ₫", "+500.000 ₫"]
    body = text_of(client.get("/payments?method=CASH", headers=MANAGER).text)
    assert "Tổng thu 200.000 ₫" in body and "Tổng hoàn 100.000 ₫" in body


def test_ledger_totals_cover_every_page_and_pages_hold_25(client, db):
    booking = add_booking(db, add_departure(db, add_tour(db), starts_at=NOW + timedelta(days=3)), total_vnd=10**9)
    for index in range(30):
        add_payment(db, booking, 10_000, recorded_at=NOW - timedelta(minutes=index), sync=False)
    assert len(ledger_rows(client)) == 25 and len(ledger_rows(client, "?page=2")) == 5
    assert "Tổng thu 300.000 ₫" in text_of(client.get("/payments?page=2", headers=MANAGER).text)


def test_ledger_of_another_cooperative_stays_out_and_csv_is_safe(client, db):
    data = ledger(db)
    other_dep = add_departure(db, add_tour(db, htx="LB"), htx="LB", starts_at=NOW + timedelta(days=3))
    other = add_booking(db, other_dep, htx="LB", total_vnd=1_000_000)
    add_payment(db, other, 777_000, htx="LB", recorded_by_name="Người LB")
    add_payment(db, data["first"], 1_000, note='=HYPERLINK("http://x")', recorded_by_name="<script>x</script>", sync=False,
                recorded_at=NOW)
    assert "777.000" not in client.get("/payments", headers=MANAGER).text
    reply = client.get("/payments/export.csv", headers=MANAGER)
    assert reply.status_code == 200 and reply.content.startswith("﻿".encode()) and "777000" not in reply.text
    assert "'=HYPERLINK" in reply.text and ",=HYPERLINK" not in reply.text
    html = client.get("/payments", headers=MANAGER).text
    assert "<script>x</script>" not in html and "&lt;script&gt;x&lt;/script&gt;" in html


# ---------- customers ----------

def customer_rows(client, query=""):
    html = client.get(f"/customers{query}", headers=MANAGER).text
    return re.findall(r'data-label="Điện thoại">(\d{10})<', html)


def test_customers_are_grouped_by_phone_with_counts_and_money(client, db):
    tour = add_tour(db)
    departure = add_departure(db, tour, starts_at=NOW + timedelta(days=3), seats=50)
    add_booking(db, departure, phone="0911000111", guest_name="Tên cũ", created_at=NOW - timedelta(days=30), paid_vnd=100_000,
                status="CONFIRMED", checked_in_count=2)
    add_booking(db, departure, phone="0911000111", guest_name="Tên mới", created_at=NOW - timedelta(days=1), paid_vnd=50_000,
                status="CONFIRMED")
    add_booking(db, departure, phone="0911000111", status="CANCELLED", cancel_reason="x", created_at=NOW - timedelta(days=40))
    add_booking(db, departure, phone="0922000222", guest_name="Người khác", created_at=NOW - timedelta(days=60))
    view = sales.list_customers(db, "TC", "", None)[0]
    first = view[0]
    assert (first.phone, first.guest_name, first.bookings, first.went, first.paid_vnd) == ("0911000111", "Tên mới", 2, 1, 150_000)
    assert [c.phone for c in view] == ["0911000111", "0922000222"] and customer_rows(client) == ["0911000111", "0922000222"]
    body = text_of(client.get("/customers", headers=MANAGER).text)
    assert "Tên mới" in body and "Tên cũ" not in body  # the latest name stands for the customer


def test_customers_are_ordered_by_the_latest_booking(client, db):
    departure = add_departure(db, add_tour(db), starts_at=NOW + timedelta(days=3), seats=50)
    add_booking(db, departure, phone="0900000001", created_at=NOW - timedelta(days=5))
    add_booking(db, departure, phone="0900000002", created_at=NOW - timedelta(days=1))
    add_booking(db, departure, phone="0900000003", created_at=NOW - timedelta(days=9))
    assert customer_rows(client) == ["0900000002", "0900000001", "0900000003"]


def test_customer_search_matches_name_or_phone_literally(client, db):
    departure = add_departure(db, add_tour(db), starts_at=NOW + timedelta(days=3), seats=50)
    add_booking(db, departure, phone="0900000001", guest_name="Hoàng Văn Chè")
    add_booking(db, departure, phone="0900000002", guest_name="Bà 100% Tư")
    assert customer_rows(client, "?q=ho%C3%A0ng") == ["0900000001"]
    assert customer_rows(client, "?q=000002") == ["0900000002"]
    assert customer_rows(client, "?q=%25") == ["0900000002"]
    assert customer_rows(client, "?q=xyz") == [] and "Không có khách nào khớp" in client.get("/customers?q=xyz", headers=MANAGER).text


def test_customers_pages_csv_and_isolation(client, db):
    departure = add_departure(db, add_tour(db), starts_at=NOW + timedelta(days=3), seats=100)
    for index in range(27):
        add_booking(db, departure, phone=f"09{index:08d}", guest_name=f"Khách {index}")
    other = add_departure(db, add_tour(db, htx="LB"), htx="LB", starts_at=NOW + timedelta(days=3))
    add_booking(db, other, htx="LB", phone="0999999999", guest_name="=HYPERLINK(1)")
    add_booking(db, departure, phone="0888888888", guest_name='=HYPERLINK("http://x")')
    assert len(customer_rows(client)) == 25 and len(customer_rows(client, "?page=2")) == 3
    reply = client.get("/customers/export.csv", headers=MANAGER)
    assert reply.status_code == 200 and len(reply.text.strip().split("\r\n")) == 29 and "0999999999" not in reply.text
    assert "'=HYPERLINK" in reply.text and ",=HYPERLINK" not in reply.text


# ---------- reviews and inquiries ----------

def reviewed(db, **fields):
    """A pending review of a checked-in booking; returns (review id, tour id)."""
    tour = add_tour(db, title="Tour được đánh giá")
    departure = add_departure(db, tour, starts_at=NOW - timedelta(days=2))
    booking = add_booking(db, departure, status="CONFIRMED", checked_in_count=1, guest_name="Khách đã đi")
    return add_review(db, booking, tour, status=fields.pop("status", "PENDING"), **fields), tour


def review_state(db, review):
    return db.execute("SELECT status, reply, moderated_at FROM reviews WHERE id = %s", (review,)).fetchone()


def test_reviews_need_the_manager_role(client):
    assert client.get("/reviews").status_code == 401
    assert client.get("/reviews", headers=FARMER).status_code == 403
    assert client.post("/reviews/00000000-0000-0000-0000-000000000000/publish", headers=FARMER).status_code == 403
    assert client.post("/inquiries/00000000-0000-0000-0000-000000000000", headers=FARMER).status_code == 403


def test_reviews_page_lists_pending_first_with_filter_and_counts(client, db):
    first, _ = reviewed(db, status="PUBLISHED", comment="Đã đăng rồi", created_at=NOW)
    second, _ = reviewed(db, status="PENDING", comment="Chờ duyệt đây", created_at=NOW - timedelta(days=1))
    third, _ = reviewed(db, status="HIDDEN", comment="Đã bị ẩn", created_at=NOW - timedelta(days=2))
    html = client.get("/reviews", headers=MANAGER).text
    assert html.index("Chờ duyệt đây") < html.index("Đã đăng rồi") < html.index("Đã bị ẩn")
    assert "Tour được đánh giá" in html and "Khách đã đi" in html
    only = client.get("/reviews?status=HIDDEN", headers=MANAGER).text
    assert "Đã bị ẩn" in only and "Chờ duyệt đây" not in only
    assert "Đã đăng rồi" in client.get("/reviews?status=nonsense", headers=MANAGER).text  # ignored filter


def test_publish_and_hide_change_the_status_and_stamp_the_moderation(client, db):
    review, _ = reviewed(db)
    reply = post(client, f"/reviews/{review}/publish")
    assert reply.status_code == 303 and reply.headers["location"].startswith("/apps/tea-tour/reviews")
    status, _, moderated = review_state(db, review)
    assert status == "PUBLISHED" and moderated is not None
    assert post(client, f"/reviews/{review}/hide").status_code == 303
    assert review_state(db, review)[0] == "HIDDEN"


def test_reply_is_saved_cleared_and_limited(client, db):
    review, _ = reviewed(db)
    assert post(client, f"/reviews/{review}/reply", reply="Cảm ơn chị đã ghé thăm").status_code == 303
    assert review_state(db, review)[1] == "Cảm ơn chị đã ghé thăm"
    assert "Cảm ơn chị đã ghé thăm" in client.get("/reviews", headers=MANAGER).text
    too_long = post(client, f"/reviews/{review}/reply", reply="x" * 1001)
    assert too_long.status_code == 422 and 'role="alert"' in too_long.text and review_state(db, review)[1] == "Cảm ơn chị đã ghé thăm"
    assert post(client, f"/reviews/{review}/reply", reply="  ").status_code == 303
    assert review_state(db, review)[1] is None


def test_other_cooperatives_review_is_404_and_untouched(client, db):
    review, _ = reviewed(db)
    for action, data in (("publish", {}), ("hide", {}), ("reply", {"reply": "x"})):
        assert post(client, f"/reviews/{review}/{action}", OTHER, **data).status_code == 404
    assert post(client, "/reviews/not-a-uuid/publish").status_code == 404
    assert post(client, "/reviews/00000000-0000-0000-0000-000000000000/hide").status_code == 404
    assert review_state(db, review) == ("PENDING", None, None)
    assert "Tour được đánh giá" not in client.get("/reviews", headers=OTHER).text


def test_hostile_review_and_inquiry_text_is_escaped(client, db):
    reviewed(db, comment="<script>alert(1)</script>", display_name="<b>Tên</b>")
    add_inquiry(db, name="<img src=x onerror=alert(1)>", message="<script>steal()</script>", internal_note="<i>ghi</i>")
    html = client.get("/reviews", headers=MANAGER).text
    for raw in ("<script>alert(1)</script>", "<b>Tên</b>", "<img src=x", "<script>steal()</script>", "<i>ghi</i>"):
        assert raw not in html, raw
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html


def test_inquiries_are_listed_filtered_and_updated(client, db):
    new = add_inquiry(db, name="Cô Hạnh", message="Đoàn 30 em học sinh", desired_date=NOW.date() + timedelta(days=20))
    done = add_inquiry(db, name="Anh Bình", status="CLOSED")
    html = client.get("/reviews", headers=MANAGER).text
    assert "Cô Hạnh" in html and "Đoàn 30 em học sinh" in html and "Anh Bình" in html and "0987654321" in html
    only = client.get("/reviews?inq=NEW", headers=MANAGER).text
    assert "Cô Hạnh" in only and "Anh Bình" not in only
    reply = post(client, f"/inquiries/{new}", status="CONTACTED", note="Đã gọi, hẹn thứ bảy")
    assert reply.status_code == 303 and "/apps/tea-tour/reviews" in reply.headers["location"]
    assert db.execute("SELECT status, internal_note FROM inquiries WHERE id = %s", (new,)).fetchone() == ("CONTACTED", "Đã gọi, hẹn thứ bảy")
    assert db.execute("SELECT status FROM inquiries WHERE id = %s", (done,)).fetchone()[0] == "CLOSED"
    assert post(client, f"/inquiries/{new}", status="CONTACTED", note="").status_code == 303
    assert db.execute("SELECT internal_note FROM inquiries WHERE id = %s", (new,)).fetchone()[0] is None


@pytest.mark.parametrize("data", [{"status": "DONE", "note": ""}, {"status": "", "note": ""}, {"status": "NEW", "note": "n" * 501}])
def test_a_bad_inquiry_form_is_422_and_changes_nothing(client, db, data):
    inquiry = add_inquiry(db)
    reply = post(client, f"/inquiries/{inquiry}", **data)
    assert reply.status_code == 422 and 'role="alert"' in reply.text
    assert db.execute("SELECT status, internal_note FROM inquiries WHERE id = %s", (inquiry,)).fetchone() == ("NEW", None)


def test_other_cooperatives_inquiry_is_404_and_not_listed(client, db):
    inquiry = add_inquiry(db, htx="LB", name="Khách của LB")
    assert post(client, f"/inquiries/{inquiry}", status="CLOSED", note="").status_code == 404
    assert db.execute("SELECT status FROM inquiries WHERE id = %s", (inquiry,)).fetchone()[0] == "NEW"
    assert "Khách của LB" not in client.get("/reviews", headers=MANAGER).text
    assert post(client, "/inquiries/junk", status="CLOSED", note="").status_code == 404


def test_reviews_and_inquiries_page_by_25_separately(client, db):
    departure = add_departure(db, add_tour(db), starts_at=NOW - timedelta(days=2), seats=100)
    tour = db.execute("SELECT tour_id FROM departures WHERE id = %s", (departure,)).fetchone()[0]
    for index in range(27):
        booking = add_booking(db, departure, status="CONFIRMED", checked_in_count=1)
        add_review(db, booking, tour, status="PENDING", comment=f"Nhận xét số {index:02d}", created_at=NOW - timedelta(minutes=index))
        add_inquiry(db, name=f"Người hỏi {index:02d}", created_at=NOW - timedelta(minutes=index))
    first = client.get("/reviews", headers=MANAGER).text
    assert first.count("Nhận xét số") == 25 and first.count("Người hỏi") == 25
    second = client.get("/reviews?page=2", headers=MANAGER).text
    assert second.count("Nhận xét số") == 2 and second.count("Người hỏi") == 25  # the inquiry list stays on its page 1
    third = client.get("/reviews?ipage=2", headers=MANAGER).text
    assert third.count("Nhận xét số") == 25 and third.count("Người hỏi") == 2


# ---------- reports ----------

def report_world(db):
    """A small fixed year around FIXED (15 Nov 2026): two tours, past, future, cancelled and out-of-window departures."""
    tour_a = add_tour(db, title="Hái chè")
    tour_b = add_tour(db, title="Sao chè")
    made = at(1, 10)  # booking creation day, inside the window
    a1 = add_departure(db, tour_a, starts_at=at(3), seats=10)
    a2 = add_departure(db, tour_a, starts_at=at(10, 10), seats=20)
    b1 = add_departure(db, tour_b, starts_at=at(20), seats=10)
    b2 = add_departure(db, tour_b, starts_at=at(20, 10), seats=10, status="CANCELLED")
    old = add_departure(db, tour_a, starts_at=at(5, 10).replace(year=2025), seats=10)
    first = add_booking(db, a1, adults=2, children=1, status="CONFIRMED", created_at=made)
    add_booking(db, a1, adults=4, status="CONFIRMED", created_at=made)
    add_booking(db, a1, adults=1, created_at=made)  # pending
    add_booking(db, a1, adults=1, status="CANCELLED", cancelled_by="GUEST", cancel_reason="x", created_at=made)
    second = add_booking(db, a2, adults=5, status="CONFIRMED", created_at=made)
    add_booking(db, b1, adults=2, status="CONFIRMED", created_at=made)
    add_booking(db, b2, adults=1, status="CANCELLED", cancelled_by="SYSTEM", cancel_reason="HTX huỷ chuyến", created_at=made)
    add_booking(db, old, adults=9, status="CONFIRMED", created_at=at(1, 10).replace(year=2025))
    add_payment(db, first, 300_000, recorded_at=at(5), sync=False)
    add_payment(db, first, -50_000, recorded_at=at(6), sync=False)
    add_payment(db, second, 200_000, recorded_at=at(12, 10), sync=False)
    add_payment(db, second, 1_000_000, recorded_at=at(5, 10).replace(year=2025), sync=False)
    return tour_a, tour_b


def test_reports_twelve_months_of_guests_bookings_and_money(db):
    report_world(db)
    report = sales.reports(db, "TC", now=FIXED)
    assert len(report.months) == 12 and report.months[0].label == "12/2025" and report.months[-1].label == "11/2026"
    by_label = {m.label: m for m in report.months}
    assert (by_label["11/2026"].guests, by_label["11/2026"].bookings, by_label["11/2026"].collected) == (3 + 4 + 2, 3, 250_000)
    assert (by_label["10/2026"].guests, by_label["10/2026"].bookings, by_label["10/2026"].collected) == (5, 1, 200_000)
    assert sum(m.guests for m in report.months) == 14 and sum(m.collected for m in report.months) == 450_000  # 2025 is outside


def test_reports_per_tour_and_occupancy_of_past_departures(db):
    report_world(db)
    report = sales.reports(db, "TC", now=FIXED)
    rows = {t.tour_title: t for t in report.tours}
    assert (rows["Hái chè"].departures, rows["Hái chè"].guests, rows["Hái chè"].bookings, rows["Hái chè"].collected) == (2, 12, 3, 450_000)
    assert rows["Hái chè"].occupancy == 40  # 12 confirmed guests on 30 seats of the two departures that took place
    assert (rows["Sao chè"].departures, rows["Sao chè"].guests, rows["Sao chè"].collected, rows["Sao chè"].occupancy) == (0, 2, 0, None)
    assert report.occupancy == 40 and report.past_departures == 2 and report.past_seats == 30 and report.past_guests == 12


def test_reports_cancellation_rate_of_bookings_made_in_the_window(db):
    report_world(db)
    report = sales.reports(db, "TC", now=FIXED)
    assert (report.created, report.cancelled) == (7, 2)  # the 2025 booking is outside the window
    assert round(float(report.cancel_rate), 1) == 28.6
    assert report.cancelled_by == {"GUEST": 1, "MANAGER": 0, "SYSTEM": 1}


def test_reports_of_an_empty_cooperative_have_no_division_by_zero(db):
    report = sales.reports(db, "TC", now=FIXED)
    assert len(report.months) == 12 and all((m.guests, m.bookings, m.collected) == (0, 0, 0) for m in report.months)
    assert report.tours == [] and report.occupancy is None and report.cancel_rate is None and report.created == 0


def test_reports_never_mix_cooperatives(db):
    report_world(db)
    other = add_tour(db, htx="LB", title="Của LB")
    dep = add_departure(db, other, htx="LB", starts_at=at(2), seats=10)
    add_booking(db, dep, htx="LB", adults=8, status="CONFIRMED", created_at=at(1, 10))
    assert sales.reports(db, "TC", now=FIXED).months[-1].guests == 9
    assert [t.tour_title for t in sales.reports(db, "LB", now=FIXED).tours] == ["Của LB"]


def test_reports_page_needs_the_role_and_shows_every_section(client, db):
    assert client.get("/reports").status_code == 401 and client.get("/reports", headers=FARMER).status_code == 403
    assert client.get("/reports", headers=MANAGER).status_code == 200  # empty: no division by zero
    tour = add_tour(db, title="<script>alert(1)</script>")
    dep = add_departure(db, tour, starts_at=NOW - timedelta(days=2), seats=10)
    booking = add_booking(db, dep, adults=4, status="CONFIRMED")
    add_payment(db, booking, 400_000)
    html = client.get("/reports", headers=MANAGER).text
    body = text_of(html)
    for expected in ("Khách theo tháng", "Lượt đặt theo tháng", "Tiền đã thu theo tháng", "Theo tour", "Tỉ lệ lấp đầy",
                     "Tỉ lệ huỷ", "40%", "400.000 ₫"):
        assert expected in body, expected
    assert "<script>alert(1)</script>" not in html and "&lt;script&gt;" in html
    assert 'class="chart"' in html
