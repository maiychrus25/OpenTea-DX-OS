# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Guide pages: schedule, guest list, check-in by button and by code (spec 6, 7.5)."""
import re
import uuid
from datetime import timedelta

from factories import NOW, add_booking, add_departure, add_payment, add_tour, bearer

GUIDE = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nông hộ Một")
OTHER_GUIDE = bearer(sub="kc-farmer-2", roles=("farmer",), name="Nông hộ Hai")
MANAGER = bearer()
STARTED = NOW - timedelta(hours=2)  # inside the check-in window for any duration


def _departure(db, guide="kc-farmer-1", starts_at=STARTED, **fields):
    return add_departure(db, add_tour(db), starts_at=starts_at, guide_user_id=guide, guide_name="Nông hộ", **fields)


def _confirmed(db, departure, **fields):
    return add_booking(db, departure, status="CONFIRMED", **fields)


def _checkin(client, departure, headers=GUIDE, **form):
    return client.post(f"/guide/departures/{departure}/checkin", data=form, headers=headers)


def _row(db, booking):
    return db.execute("SELECT checked_in_at, checked_in_count, checked_in_by FROM bookings WHERE id = %s",
                      (booking,)).fetchone()


# ---------- schedule ----------

def test_the_schedule_needs_the_farmer_role(client):
    assert client.get("/guide").status_code == 401
    assert client.get("/guide", headers=MANAGER).status_code == 403


def test_the_schedule_lists_only_my_departures_upcoming_before_past(client, db):
    tour = add_tour(db, title="Tour của tôi")
    soon = add_departure(db, tour, starts_at=NOW + timedelta(days=1), guide_user_id="kc-farmer-1")
    later = add_departure(db, tour, starts_at=NOW + timedelta(days=9), guide_user_id="kc-farmer-1")
    past = add_departure(db, tour, starts_at=NOW - timedelta(days=3), guide_user_id="kc-farmer-1")
    add_departure(db, add_tour(db, title="Tour của người khác"), guide_user_id="kc-farmer-2")
    add_departure(db, add_tour(db, title="Tour chưa giao"))
    add_departure(db, add_tour(db, htx="LB", title="Tour HTX khác"), htx="LB", guide_user_id="kc-farmer-1")
    _confirmed(db, soon, adults=2, children=1)
    add_booking(db, soon, adults=5)  # pending: not counted
    html = client.get("/guide", headers=GUIDE).text
    assert "Tour của tôi" in html
    assert "người khác" not in html and "chưa giao" not in html and "HTX khác" not in html
    links = re.findall(r"/guide/departures/([0-9a-f-]{36})", html)
    assert links == [str(soon), str(later), str(past)]
    assert 'trip-number">3<' in html and 'trip-number">5<' not in html


def test_the_schedule_is_empty_for_a_guide_with_nothing_assigned(client, db):
    _departure(db, guide="kc-farmer-9")
    html = client.get("/guide", headers=GUIDE).text
    assert "chưa được giao" in html.lower()


def test_a_cancelled_departure_is_marked_on_the_schedule(client, db):
    add_departure(db, add_tour(db), starts_at=NOW + timedelta(days=2), guide_user_id="kc-farmer-1",
                  status="CANCELLED", cancel_reason="Mưa lớn")
    html = client.get("/guide", headers=GUIDE).text
    assert "Đã huỷ" in html and "Mưa lớn" in html


# ---------- departure page ----------

def test_the_departure_page_shows_confirmed_guests_without_contact_data(client, db):
    departure = _departure(db)
    booking = _confirmed(db, departure, guest_name="Trần Thị Lan", adults=2, children=1, phone="0987654321",
                         email="lan@example.com", note="Con nhỏ say xe", total_vnd=650_000)
    add_payment(db, booking, 200_000)
    add_booking(db, departure, guest_name="Khách chưa xác nhận", status="PENDING")
    add_booking(db, departure, guest_name="Khách đã huỷ", status="CANCELLED")
    html = client.get(f"/guide/departures/{departure}", headers=GUIDE).text
    assert "Trần Thị Lan" in html and "Con nhỏ say xe" in html
    assert "450.000" in html  # 650.000 - 200.000 still to collect
    assert "Khách chưa xác nhận" not in html and "Khách đã huỷ" not in html
    for secret in ("0987654321", "lan@example.com", "987654321"):
        assert secret not in html


def test_guest_text_is_escaped(client, db):
    departure = _departure(db)
    _confirmed(db, departure, guest_name="<script>alert(1)</script>", note="<b>x</b>")
    html = client.get(f"/guide/departures/{departure}", headers=GUIDE).text
    assert "<script>alert(1)" not in html and "&lt;script&gt;" in html and "<b>x</b>" not in html


def test_another_guides_unassigned_foreign_or_malformed_departure_is_404(client, db):
    mine = _departure(db)
    assert client.get(f"/guide/departures/{mine}", headers=OTHER_GUIDE).status_code == 404
    assert client.get(f"/guide/departures/{_departure(db, guide=None)}", headers=GUIDE).status_code == 404
    foreign = add_departure(db, add_tour(db, htx="LB"), htx="LB", guide_user_id="kc-farmer-1")
    assert client.get(f"/guide/departures/{foreign}", headers=GUIDE).status_code == 404
    assert client.get(f"/guide/departures/{uuid.uuid4()}", headers=GUIDE).status_code == 404
    assert client.get("/guide/departures/not-an-id", headers=GUIDE).status_code == 404
    assert client.get(f"/guide/departures/{mine}", headers=MANAGER).status_code == 403


def test_a_guest_who_never_checked_in_is_absent_once_the_departure_has_ended(client, db):
    ended = add_departure(db, add_tour(db, duration_minutes=60), starts_at=NOW - timedelta(hours=5),
                          guide_user_id="kc-farmer-1")
    _confirmed(db, ended, guest_name="Người vắng")
    assert "Vắng mặt" in client.get(f"/guide/departures/{ended}", headers=GUIDE).text
    running = _departure(db, starts_at=NOW - timedelta(minutes=5))
    _confirmed(db, running, guest_name="Người chưa tới")
    assert "Vắng mặt" not in client.get(f"/guide/departures/{running}", headers=GUIDE).text


def test_outside_the_window_the_buttons_are_replaced_by_the_reason(client, db):
    future = _departure(db, starts_at=NOW + timedelta(days=3))
    _confirmed(db, future)
    html = client.get(f"/guide/departures/{future}", headers=GUIDE).text
    assert "Chưa tới giờ điểm danh" in html and 'name="code"' not in html and "<button" not in html
    old = _departure(db, starts_at=NOW - timedelta(days=5))
    _confirmed(db, old)
    html = client.get(f"/guide/departures/{old}", headers=GUIDE).text
    assert "đã quá thời gian điểm danh" in html.lower() and 'name="code"' not in html


def test_a_cancelled_departure_shows_the_reason_and_no_guests(client, db):
    departure = _departure(db, status="CANCELLED", cancel_reason="Bão")
    html = client.get(f"/guide/departures/{departure}", headers=GUIDE).text
    assert "Bão" in html and 'name="code"' not in html


# ---------- check-in ----------

def test_check_in_by_button_records_the_whole_party_and_the_guide(client, db):
    departure = _departure(db)
    booking = _confirmed(db, departure, adults=2, children=1)
    response = _checkin(client, departure, action="checkin", booking_id=str(booking))
    assert response.status_code == 303 and response.headers["location"].startswith(f"/apps/tea-tour/guide/departures/{departure}")
    at, count, by = _row(db, booking)
    assert at is not None and count == 3 and by == "Nông hộ Một"
    event = db.execute("SELECT actor_kind FROM booking_events WHERE booking_id = %s AND kind = 'CHECKED_IN'",
                       (booking,)).fetchone()
    assert event == ("GUIDE",)
    assert "Có mặt 3/3" in client.get(f"/guide/departures/{departure}", headers=GUIDE).text


def test_check_in_with_a_partial_count_and_a_bad_count(client, db):
    departure = _departure(db)
    booking = _confirmed(db, departure, adults=3)
    assert _checkin(client, departure, action="checkin", booking_id=str(booking), count="2").status_code == 303
    assert _row(db, booking)[1] == 2
    _checkin(client, departure, action="undo", booking_id=str(booking))
    for bad in ("0", "4", "x", "-1"):
        response = _checkin(client, departure, action="checkin", booking_id=str(booking), count=bad)
        assert response.status_code == 422 and "không hợp lệ" in response.text
    assert _row(db, booking)[0] is None


def test_undo_check_in(client, db):
    departure = _departure(db)
    booking = _confirmed(db, departure, checked_in_at=NOW, checked_in_count=1, checked_in_by="x")
    assert _checkin(client, departure, action="undo", booking_id=str(booking)).status_code == 303
    assert _row(db, booking) == (None, None, None)
    assert _checkin(client, departure, action="undo", booking_id=str(booking)).status_code == 409


def test_check_in_by_code_ignores_case_and_spaces(client, db):
    departure = _departure(db)
    booking = _confirmed(db, departure, code="ABCD2345", adults=2)
    assert _checkin(client, departure, action="code", code=" abcd2345 ").status_code == 303
    assert _row(db, booking)[1] == 2


def test_an_unknown_code_or_a_code_of_another_departure_keeps_the_page_and_the_entry(client, db):
    departure = _departure(db)
    other = _departure(db)
    _confirmed(db, other, code="ZZZZ2222")
    response = _checkin(client, departure, action="code", code="ZZZZ2222")
    assert response.status_code == 404 and "Không tìm thấy" in response.text and "ZZZZ2222" in response.text
    assert _row(db, _confirmed(db, departure))[0] is None
    assert _checkin(client, departure, action="code", code="").status_code == 422


def test_a_pending_booking_cannot_be_checked_in_by_code(client, db):
    departure = _departure(db)
    pending = add_booking(db, departure, code="PEND2222", status="PENDING")
    assert _checkin(client, departure, action="code", code="PEND2222").status_code in (404, 409)
    assert _row(db, pending)[0] is None


def test_check_in_outside_the_window_is_refused_with_the_reason(client, db):
    departure = _departure(db, starts_at=NOW + timedelta(days=3))
    booking = _confirmed(db, departure)
    response = _checkin(client, departure, action="checkin", booking_id=str(booking))
    assert response.status_code == 409 and "thời gian điểm danh" in response.text
    assert _row(db, booking)[0] is None


def test_another_guides_check_in_is_404_and_changes_nothing(client, db):
    departure = _departure(db)
    booking = _confirmed(db, departure, code="ABCD2345")
    assert _checkin(client, departure, headers=OTHER_GUIDE, action="checkin", booking_id=str(booking)).status_code == 404
    assert _checkin(client, departure, headers=OTHER_GUIDE, action="code", code="ABCD2345").status_code == 404
    assert _checkin(client, departure, headers=MANAGER, action="code", code="ABCD2345").status_code == 403
    assert _row(db, booking)[0] is None


def test_a_booking_of_another_departure_cannot_be_checked_in_through_this_one(client, db):
    mine, also_mine = _departure(db), _departure(db)
    booking = _confirmed(db, also_mine)
    assert _checkin(client, mine, action="checkin", booking_id=str(booking)).status_code == 404
    assert _checkin(client, mine, action="checkin", booking_id="nope").status_code == 404
    assert _row(db, booking)[0] is None


def test_an_unknown_action_is_rejected(client, db):
    departure = _departure(db)
    assert _checkin(client, departure, action="delete").status_code == 422


def test_the_done_banner_names_the_guest_and_ignores_a_foreign_id(client, db):
    departure = _departure(db)
    booking = _confirmed(db, departure, guest_name="Lê Văn Bình", adults=2)
    html = client.get(f"/guide/departures/{departure}?done={booking}&did=checkin", headers=GUIDE).text
    assert "Đã điểm danh" in html and "Lê Văn Bình" in html
    assert client.get(f"/guide/departures/{departure}?done={uuid.uuid4()}&did=checkin", headers=GUIDE).status_code == 200
    assert client.get(f"/guide/departures/{departure}?done=junk", headers=GUIDE).status_code == 200
