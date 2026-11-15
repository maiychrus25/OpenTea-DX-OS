# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Booking core, one test per rule of spec 7.1-7.6 and 7.9 (and Review Focus 1 and 4 of the plan)."""
import re
import threading
from datetime import datetime, timedelta, timezone

import pytest
from factories import (EARLIER, LATER, NOW, add_booking, add_departure, add_payment, add_review, add_settings,
                       add_tour)

from tea_tour import store
from tea_tour.store import core
from tea_tour.store.core import Actor, NewBooking, Refusal

HTX = "TC"
MANAGER = Actor("MANAGER", "Quản trị TC", "kc-manager-tc")
GUEST = Actor("GUEST", "Nguyễn Văn Khách", None)
SYSTEM = Actor("SYSTEM", "Hệ thống", None)
GUIDE = Actor("GUIDE", "Hộ ông Ba", "kc-guide")
_keys = iter(range(10**6))


@pytest.fixture
def world(db):
    """A published tour with one open departure of 5 seats, a week from now; no settings row (the defaults)."""
    tour = add_tour(db)
    departure = add_departure(db, tour, seats=5)
    return db, tour, departure


def new(departure, adults=2, children=0, source="WEB", htx=HTX, **fields) -> NewBooking:
    values = {"htx_code": htx, "departure_id": departure, "adults": adults, "children": children,
              "guest_name": "Nguyễn Văn Khách", "phone": "0912345678", "email": None, "note": None,
              "request_key": f"key-{next(_keys)}-{datetime.now().timestamp()}", "source": source, **fields}
    return NewBooking(**values)


def create(db, departure, actor=GUEST, **kw):
    return core.create_booking(db, new(departure, **kw), actor)


def booking_row(db, booking_id):
    return db.execute("SELECT status, paid_vnd, cancel_reason, cancelled_by FROM bookings WHERE id = %s",
                      (booking_id,)).fetchone()


def events(db, booking_id):
    return db.execute("SELECT kind, actor_kind, actor_name FROM booking_events WHERE booking_id = %s ORDER BY id",
                      (booking_id,)).fetchall()


def seats_used(db, departure):
    return db.execute("SELECT seats_used FROM departure_load WHERE departure_id = %s", (departure,)).fetchone()[0]


def ledger_matches(db, booking_id):
    paid, ledger = db.execute(
        "SELECT b.paid_vnd, COALESCE((SELECT sum(amount_vnd) FROM payments p WHERE p.booking_id = b.id), 0) "
        "FROM bookings b WHERE b.id = %s", (booking_id,)).fetchone()
    return paid == ledger


# ---------- creating ----------

def test_create_copies_prices_and_computes_total_deposit_and_hold(world):
    db, tour, departure = world
    add_settings(db, deposit_percent=30, hold_hours=12)
    booking = create(db, departure, adults=2, children=1)
    assert isinstance(booking, core.Booking)
    assert (booking.adults, booking.children, booking.party_size) == (2, 1, 3)
    assert (booking.price_adult_vnd, booking.price_child_vnd) == (250_000, 150_000)
    assert booking.total_vnd == 650_000 and booking.deposit_vnd == 195_000
    assert booking.status == "PENDING" and booking.paid_vnd == 0 and booking.source == "WEB"
    assert abs((booking.hold_until - (NOW + timedelta(hours=12))).total_seconds()) < 60
    assert re.fullmatch(r"[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}", booking.code)
    assert len(booking.access_key) == 22 and booking.tour_id == tour
    assert [e[:2] for e in events(db, booking.id)] == [("CREATED", "GUEST")]


def test_price_change_after_booking_does_not_touch_the_booking(world):
    db, _, departure = world
    booking = create(db, departure)
    db.execute("UPDATE departures SET price_adult_vnd = 999000 WHERE id = %s", (departure,))
    assert core.get_booking(db, HTX, booking.id).total_vnd == 500_000


def test_no_deposit_means_no_hold_and_the_hold_is_capped_at_departure(world):
    db, tour, departure = world
    assert create(db, departure).hold_until is None
    add_settings(db, deposit_percent=50, hold_hours=168)
    soon = add_departure(db, tour, starts_at=NOW + timedelta(hours=3), seats=5)
    held = create(db, soon)
    assert abs((held.hold_until - (NOW + timedelta(hours=3))).total_seconds()) < 60


def test_same_request_key_returns_the_same_booking(world):
    db, _, departure = world
    request = new(departure, adults=2)
    first = core.create_booking(db, request, GUEST)
    second = core.create_booking(db, request, GUEST)
    assert first.id == second.id and first.code == second.code
    assert db.execute("SELECT count(*) FROM bookings").fetchone()[0] == 1
    assert seats_used(db, departure) == 2


def test_price_change_between_step_two_and_confirm_creates_nothing(world):
    db, _, departure = world
    stale = new(departure, adults=2, expected_total_vnd=400_000)  # the guest saw 400.000, the price is 500.000
    assert core.create_booking(db, stale, GUEST) is Refusal.PRICE_CHANGED
    assert db.execute("SELECT count(*) FROM bookings").fetchone()[0] == 0
    assert isinstance(core.create_booking(db, new(departure, adults=2, expected_total_vnd=500_000), GUEST),
                      core.Booking)


def test_auto_confirm_at_booking_only_without_a_deposit(world):
    db, _, departure = world
    assert create(db, departure, adults=1).status == "PENDING"  # auto_confirm is off by default
    add_settings(db, auto_confirm=True)
    booking = create(db, departure, adults=1)
    assert booking.status == "CONFIRMED"
    assert [e[0] for e in events(db, booking.id)] == ["CREATED", "CONFIRMED"]
    add_settings(db, auto_confirm=True, deposit_percent=30)
    assert create(db, departure, adults=1).status == "PENDING"  # a deposit is asked first


def test_guest_party_limits(world):
    db, _, departure = world
    db.execute("UPDATE departures SET seats = 200 WHERE id = %s", (departure,))
    assert create(db, departure, adults=20) is not Refusal.PARTY_SIZE
    assert create(db, departure, adults=20, children=1) is Refusal.PARTY_SIZE  # 21 guests
    assert create(db, departure, adults=0, children=2) is Refusal.PARTY_SIZE   # no adult
    assert create(db, departure, adults=-1, children=3) is Refusal.INVALID_INPUT
    assert create(db, departure, adults=0, children=0, actor=MANAGER, source="MANAGER") is Refusal.PARTY_SIZE


def test_manager_books_up_to_the_seats_left_and_may_use_a_closed_departure(world):
    db, _, departure = world
    db.execute("UPDATE departures SET status = 'CLOSED' WHERE id = %s", (departure,))
    assert create(db, departure, adults=1) is Refusal.NOT_BOOKABLE  # a guest cannot
    booking = create(db, departure, actor=MANAGER, source="MANAGER", adults=0, children=5)
    assert isinstance(booking, core.Booking) and booking.source == "MANAGER" and booking.party_size == 5
    assert create(db, departure, actor=MANAGER, source="MANAGER", adults=1) is Refusal.FULL
    assert [e[1] for e in events(db, booking.id)] == ["MANAGER"]


def test_guest_cannot_book_a_draft_or_archived_tour_or_a_cancelled_or_past_departure(world):
    db, tour, departure = world
    for status in ("DRAFT", "ARCHIVED"):
        db.execute("UPDATE tours SET status = %s WHERE id = %s", (status, tour))
        assert create(db, departure) is Refusal.NOT_FOUND
    db.execute("UPDATE tours SET status = 'PUBLISHED' WHERE id = %s", (tour,))
    db.execute("UPDATE departures SET status = 'CANCELLED' WHERE id = %s", (departure,))
    assert create(db, departure) is Refusal.NOT_BOOKABLE
    past = add_departure(db, tour, starts_at=EARLIER)
    assert create(db, past) is Refusal.NOT_BOOKABLE
    assert create(db, past, actor=MANAGER, source="MANAGER") is Refusal.NOT_BOOKABLE


def test_full_departure_is_refused(world):
    db, _, departure = world
    assert isinstance(create(db, departure, adults=5), core.Booking)
    assert create(db, departure, adults=1) is Refusal.FULL


def test_concurrent_bookings_never_exceed_seats(world, app_db_url):
    db, _, departure = world
    results, barrier = [], threading.Barrier(8)

    def worker():
        with store.connect(app_db_url) as conn:
            barrier.wait()
            results.append(core.create_booking(conn, new(departure, adults=1), GUEST))

    threads = [threading.Thread(target=worker) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    booked = [r for r in results if isinstance(r, core.Booking)]
    assert len(booked) == 5 and results.count(Refusal.FULL) == 3
    assert seats_used(db, departure) == 5


# ---------- holds ----------

def test_expired_hold_frees_seats_before_the_sweep(world):
    db, _, departure = world
    expired = add_booking(db, departure, adults=5, deposit_vnd=100_000, hold_until=NOW - timedelta(hours=1))
    assert seats_used(db, departure) == 0  # no sweep has run, yet the seats are free
    booking = create(db, departure, adults=5)
    assert isinstance(booking, core.Booking)
    row = booking_row(db, expired)  # the booking transaction swept this departure
    assert row[0] == "CANCELLED" and row[2] == "Quá hạn giữ chỗ" and row[3] == "SYSTEM"
    assert events(db, expired)[-1] == ("CANCELLED", "SYSTEM", "Hệ thống")


def test_reported_paid_booking_survives_the_hold(world):
    db, _, departure = world
    reported = add_booking(db, departure, adults=3, deposit_vnd=100_000, hold_until=NOW - timedelta(hours=1),
                           guest_paid_reported_at=NOW - timedelta(minutes=30))
    assert seats_used(db, departure) == 3
    assert core.sweep(db, HTX, departure) == 0
    assert booking_row(db, reported)[0] == "PENDING"


def test_sweep_cancels_stale_pending_at_departure_and_keeps_the_rest(world):
    db, tour, _ = world
    started = add_departure(db, tour, starts_at=NOW - timedelta(hours=2))
    stale = add_booking(db, started, status="PENDING")
    kept = add_booking(db, started, status="CONFIRMED")
    assert core.sweep(db, HTX) == 1
    assert booking_row(db, stale)[:3] == ("CANCELLED", 0, "Chuyến đã khởi hành mà chưa được xác nhận")
    assert booking_row(db, kept)[0] == "CONFIRMED"
    assert core.sweep(db, HTX) == 0  # nothing left to do
    other = add_booking(db, add_departure(db, add_tour(db, htx="LB"), htx="LB", starts_at=NOW - timedelta(hours=1)),
                        htx="LB")
    assert core.sweep(db, HTX) == 0 and booking_row(db, other)[0] == "PENDING"  # another cooperative is untouched


# ---------- confirming and paying ----------

def test_manager_confirms_a_pending_booking_once(world):
    db, _, departure = world
    booking = create(db, departure)
    confirmed = core.confirm_booking(db, HTX, booking.id, MANAGER)
    assert confirmed.status == "CONFIRMED"
    assert core.confirm_booking(db, HTX, booking.id, MANAGER) is Refusal.WRONG_STATE
    assert events(db, booking.id)[-1] == ("CONFIRMED", "MANAGER", "Quản trị TC")


def test_payment_reaching_the_deposit_confirms(world):
    db, _, departure = world
    add_settings(db, deposit_percent=40)
    booking = create(db, departure, adults=2)  # total 500.000, deposit 200.000
    assert booking.deposit_vnd == 200_000
    part = core.record_payment(db, HTX, booking.id, 150_000, "TRANSFER", None, MANAGER)
    assert (part.status, part.paid_vnd) == ("PENDING", 150_000)
    done = core.record_payment(db, HTX, booking.id, 50_000, "CASH", "Tiền mặt tại điểm hẹn", MANAGER)
    assert (done.status, done.paid_vnd) == ("CONFIRMED", 200_000)
    assert [e[0] for e in events(db, booking.id)] == ["CREATED", "PAYMENT", "PAYMENT", "CONFIRMED"]
    assert ledger_matches(db, booking.id)
    line = db.execute("SELECT recorded_by_id, recorded_by_name, method, note FROM payments "
                      "WHERE booking_id = %s ORDER BY recorded_at DESC, amount_vnd LIMIT 1", (booking.id,)).fetchone()
    assert line[:2] == ("kc-manager-tc", "Quản trị TC")


def test_payment_without_a_deposit_does_not_confirm(world):
    db, _, departure = world
    booking = create(db, departure)
    assert core.record_payment(db, HTX, booking.id, 100_000, "TRANSFER", None, MANAGER).status == "PENDING"


def test_payment_limits(world):
    db, _, departure = world
    booking = create(db, departure, adults=2)  # total 500.000
    assert core.record_payment(db, HTX, booking.id, 500_001, "CASH", None, MANAGER) is Refusal.PAYMENT_ABOVE_TOTAL
    assert core.record_payment(db, HTX, booking.id, -1, "CASH", None, MANAGER) is Refusal.PAYMENT_BELOW_ZERO
    assert core.record_payment(db, HTX, booking.id, 0, "CASH", None, MANAGER) is Refusal.INVALID_INPUT
    assert core.record_payment(db, HTX, booking.id, 100, "BITCOIN", None, MANAGER) is Refusal.INVALID_INPUT
    paid = core.record_payment(db, HTX, booking.id, 500_000, "TRANSFER", None, MANAGER)
    assert paid.paid_vnd == 500_000 and paid.payment_state == "PAID"
    refunded = core.record_payment(db, HTX, booking.id, -500_000, "TRANSFER", "Hoàn tiền", MANAGER)
    assert refunded.paid_vnd == 0
    assert core.record_payment(db, HTX, booking.id, -1, "TRANSFER", None, MANAGER) is Refusal.PAYMENT_BELOW_ZERO
    assert ledger_matches(db, booking.id)


def test_refund_below_the_deposit_keeps_a_confirmed_booking(world):
    db, _, departure = world
    add_settings(db, deposit_percent=40)
    booking = create(db, departure, adults=2)
    core.record_payment(db, HTX, booking.id, 200_000, "TRANSFER", None, MANAGER)
    after = core.record_payment(db, HTX, booking.id, -150_000, "TRANSFER", None, MANAGER)
    assert (after.status, after.paid_vnd) == ("CONFIRMED", 50_000)


def test_payment_on_a_cancelled_booking_gives_refund_due(world):
    db, _, departure = world
    booking = create(db, departure, adults=2)
    core.cancel_booking(db, HTX, booking.id, "Khách đổi ý", MANAGER)
    late = core.record_payment(db, HTX, booking.id, 100_000, "TRANSFER", "Tiền về muộn", MANAGER)
    assert (late.status, late.paid_vnd, late.payment_state, late.refund_due_vnd) == ("CANCELLED", 100_000,
                                                                                     "REFUND_DUE", 100_000)
    settled = core.record_payment(db, HTX, booking.id, -100_000, "TRANSFER", None, MANAGER)
    assert settled.refund_due_vnd == 0 and ledger_matches(db, booking.id)


def test_guest_reports_payment_once_and_it_only_marks_the_time(world):
    db, _, departure = world
    add_settings(db, deposit_percent=30, hold_hours=1)
    booking = create(db, departure)
    reported = core.report_paid(db, HTX, booking.id)
    assert reported.guest_paid_reported_at is not None and reported.paid_vnd == 0 and reported.status == "PENDING"
    assert core.report_paid(db, HTX, booking.id).guest_paid_reported_at == reported.guest_paid_reported_at
    assert events(db, booking.id)[-1] == ("PAID_REPORTED", "GUEST", "Nguyễn Văn Khách")
    core.cancel_booking(db, HTX, booking.id, "x", SYSTEM)
    assert core.report_paid(db, HTX, booking.id) is Refusal.WRONG_STATE


# ---------- cancelling ----------

def test_guest_cancel_is_refused_after_the_deadline_but_the_manager_may_cancel(world):
    db, tour, _ = world
    add_settings(db, cancel_free_hours=24)
    late = add_departure(db, tour, starts_at=NOW + timedelta(hours=10), seats=5)
    booking = create(db, late)
    assert core.cancel_booking(db, HTX, booking.id, "Bận việc", GUEST) is Refusal.CANCEL_DEADLINE
    assert booking_row(db, booking.id)[0] == "PENDING"
    cancelled = core.cancel_booking(db, HTX, booking.id, "Khách gọi điện xin huỷ", MANAGER)
    assert (cancelled.status, cancelled.cancel_reason, cancelled.cancelled_by) == (
        "CANCELLED", "Khách gọi điện xin huỷ", "MANAGER")
    assert seats_used(db, late) == 0
    assert core.cancel_booking(db, HTX, booking.id, "lại", MANAGER) is Refusal.WRONG_STATE


def test_guest_cancels_in_time_and_the_manager_must_give_a_reason(world):
    db, _, departure = world
    one = create(db, departure)
    cancelled = core.cancel_booking(db, HTX, one.id, "", GUEST)
    assert (cancelled.status, cancelled.cancelled_by, cancelled.cancel_reason) == ("CANCELLED", "GUEST", "Khách tự huỷ")
    two = create(db, departure)
    assert core.cancel_booking(db, HTX, two.id, "  ", MANAGER) is Refusal.REASON_REQUIRED
    assert core.cancel_booking(db, HTX, two.id, "x" * 201, MANAGER) is Refusal.INVALID_INPUT


def test_manager_cannot_cancel_after_the_departure_started(world):
    db, tour, _ = world
    started = add_departure(db, tour, starts_at=NOW - timedelta(hours=1))
    booking = add_booking(db, started, status="CONFIRMED")
    assert core.cancel_booking(db, HTX, booking, "muộn", MANAGER) is Refusal.DEPARTURE_STARTED


def test_cancelling_a_departure_cancels_its_holding_bookings(world):
    db, _, departure = world
    add_settings(db, deposit_percent=30)
    pending = create(db, departure, adults=2)
    confirmed = create(db, departure, adults=1)
    core.confirm_booking(db, HTX, confirmed.id, MANAGER)
    gone = add_booking(db, departure, status="CANCELLED", cancel_reason="trước đó", cancelled_by="GUEST")
    assert core.cancel_departure(db, HTX, departure, "Mưa lớn", MANAGER) == 2
    assert db.execute("SELECT status, cancel_reason FROM departures WHERE id = %s", (departure,)).fetchone() == (
        "CANCELLED", "Mưa lớn")
    for booking_id in (pending.id, confirmed.id):
        row = booking_row(db, booking_id)
        assert (row[0], row[2], row[3]) == ("CANCELLED", "HTX huỷ chuyến", "MANAGER")
        assert events(db, booking_id)[-1][0] == "CANCELLED"
    assert booking_row(db, gone)[2] == "trước đó"
    assert core.cancel_departure(db, HTX, departure, "lại", MANAGER) is Refusal.WRONG_STATE
    assert create(db, departure) is Refusal.NOT_BOOKABLE


def test_cancel_departure_needs_a_reason_and_a_future_start(world):
    db, tour, departure = world
    assert core.cancel_departure(db, HTX, departure, " ", MANAGER) is Refusal.REASON_REQUIRED
    past = add_departure(db, tour, starts_at=EARLIER)
    assert core.cancel_departure(db, HTX, past, "x", MANAGER) is Refusal.DEPARTURE_STARTED


# ---------- moving and resizing ----------

def test_move_only_within_the_same_tour_and_only_with_seats(world):
    db, tour, departure = world
    add_settings(db, deposit_percent=30)
    target = add_departure(db, tour, starts_at=LATER + timedelta(days=1), seats=3, price_adult_vnd=400_000)
    booking = create(db, departure, adults=2)
    core.record_payment(db, HTX, booking.id, 50_000, "CASH", None, MANAGER)
    moved = core.move_booking(db, HTX, booking.id, target, MANAGER)
    assert moved.departure_id == target and moved.tour_id == tour
    assert (moved.total_vnd, moved.deposit_vnd, moved.paid_vnd, moved.price_adult_vnd) == (
        500_000, 150_000, 50_000, 250_000)  # prices and money stay as booked
    assert seats_used(db, departure) == 0 and seats_used(db, target) == 2
    assert core.move_booking(db, HTX, booking.id, target, MANAGER) is Refusal.SAME_DEPARTURE
    other_tour = add_departure(db, add_tour(db, title="Tour khác"))
    assert core.move_booking(db, HTX, booking.id, other_tour, MANAGER) is Refusal.OTHER_TOUR
    crowd = add_departure(db, tour, starts_at=LATER + timedelta(days=2), seats=1)
    assert core.move_booking(db, HTX, booking.id, crowd, MANAGER) is Refusal.FULL
    past = add_departure(db, tour, starts_at=EARLIER)
    assert core.move_booking(db, HTX, booking.id, past, MANAGER) is Refusal.NOT_BOOKABLE
    cancelled = add_departure(db, tour, status="CANCELLED")
    assert core.move_booking(db, HTX, booking.id, cancelled, MANAGER) is Refusal.NOT_BOOKABLE
    closed = add_departure(db, tour, status="CLOSED")
    assert core.move_booking(db, HTX, booking.id, closed, MANAGER).departure_id == closed
    assert events(db, booking.id)[-1][0] == "MOVED"


def test_move_to_another_cooperatives_departure_is_not_found(world):
    db, tour, departure = world
    foreign = add_departure(db, add_tour(db, htx="LB"), htx="LB")
    booking = create(db, departure)
    assert core.move_booking(db, HTX, booking.id, foreign, MANAGER) is Refusal.NOT_FOUND


def test_resize_recomputes_total_and_deposit_and_keeps_unit_prices(world):
    db, _, departure = world
    add_settings(db, deposit_percent=40)
    booking = create(db, departure, adults=2)
    db.execute("UPDATE departures SET price_adult_vnd = 900000 WHERE id = %s", (departure,))
    add_settings(db, deposit_percent=20)  # the current rate applies to a resize
    resized = core.resize_booking(db, HTX, booking.id, 3, 1, MANAGER)
    assert (resized.adults, resized.children, resized.party_size) == (3, 1, 4)
    assert resized.total_vnd == 3 * 250_000 + 150_000 == 900_000
    assert resized.deposit_vnd == 180_000 and resized.hold_until == booking.hold_until
    assert seats_used(db, departure) == 4
    assert core.resize_booking(db, HTX, booking.id, 5, 1, MANAGER) is Refusal.FULL
    assert core.resize_booking(db, HTX, booking.id, 0, 0, MANAGER) is Refusal.PARTY_SIZE
    assert events(db, booking.id)[-1][0] == "RESIZED"


def test_resize_down_below_what_was_paid_is_a_refund_and_may_confirm(world):
    db, _, departure = world
    add_settings(db, deposit_percent=60)
    booking = create(db, departure, adults=4)  # total 1.000.000 deposit 600.000
    core.record_payment(db, HTX, booking.id, 300_000, "CASH", None, MANAGER)
    shrunk = core.resize_booking(db, HTX, booking.id, 1, 0, MANAGER)  # total 250.000, deposit 150.000, paid 300.000
    assert shrunk.status == "CONFIRMED" and shrunk.payment_state == "REFUND_DUE" and shrunk.refund_due_vnd == 50_000


def test_resize_and_move_need_a_holding_booking_before_the_start(world):
    db, tour, departure = world
    booking = create(db, departure)
    core.cancel_booking(db, HTX, booking.id, "x", MANAGER)
    assert core.resize_booking(db, HTX, booking.id, 1, 0, MANAGER) is Refusal.WRONG_STATE
    assert core.move_booking(db, HTX, booking.id, add_departure(db, tour), MANAGER) is Refusal.WRONG_STATE
    started = add_departure(db, tour, starts_at=NOW - timedelta(hours=1))
    running = add_booking(db, started, status="CONFIRMED")
    assert core.resize_booking(db, HTX, running, 1, 0, MANAGER) is Refusal.DEPARTURE_STARTED


# ---------- check-in ----------

@pytest.fixture
def running(db):
    """A confirmed booking of 3 on a departure that started an hour ago (inside the check-in window)."""
    tour = add_tour(db)
    departure = add_departure(db, tour, starts_at=NOW - timedelta(hours=1), guide_user_id="kc-guide",
                              guide_name="Hộ ông Ba")
    return db, tour, departure, add_booking(db, departure, adults=2, children=1, status="CONFIRMED")


def test_check_in_records_count_actor_and_time(running):
    db, _, _, booking = running
    done = core.check_in(db, HTX, booking, None, MANAGER)  # the whole group by default
    assert (done.checked_in_count, done.checked_in_by) == (3, "Quản trị TC") and done.checked_in_at is not None
    again = core.check_in(db, HTX, booking, 2, MANAGER)
    assert again.checked_in_count == 2
    assert events(db, booking)[-1][0] == "CHECKED_IN"


def test_check_in_count_must_be_one_to_the_party(running):
    db, _, _, booking = running
    assert core.check_in(db, HTX, booking, 0, MANAGER) is Refusal.INVALID_INPUT
    assert core.check_in(db, HTX, booking, 4, MANAGER) is Refusal.INVALID_INPUT
    assert core.check_in(db, HTX, booking, 3, MANAGER).checked_in_count == 3


def test_check_in_only_for_confirmed_bookings_of_running_departures(running):
    db, tour, departure, _ = running
    pending = add_booking(db, departure, status="PENDING")
    assert core.check_in(db, HTX, pending, 1, MANAGER) is Refusal.WRONG_STATE
    cancelled = add_booking(db, departure, status="CANCELLED")
    assert core.check_in(db, HTX, cancelled, 1, MANAGER) is Refusal.WRONG_STATE
    future = add_booking(db, add_departure(db, tour, starts_at=NOW + timedelta(days=3)), status="CONFIRMED")
    assert core.check_in(db, HTX, future, 1, MANAGER) is Refusal.OUTSIDE_WINDOW
    old = add_booking(db, add_departure(db, tour, starts_at=NOW - timedelta(days=3)), status="CONFIRMED")
    assert core.check_in(db, HTX, old, 1, MANAGER) is Refusal.OUTSIDE_WINDOW
    dead = add_departure(db, tour, starts_at=NOW - timedelta(hours=1), status="CANCELLED")
    assert core.check_in(db, HTX, add_booking(db, dead, status="CONFIRMED"), 1, MANAGER) is Refusal.WRONG_STATE


def test_a_guide_checks_in_only_the_own_departure(running):
    db, tour, _, booking = running
    assert core.check_in(db, HTX, booking, 3, GUIDE, guide_user_id="kc-guide").checked_in_by == "Hộ ông Ba"
    assert core.check_in(db, HTX, booking, 3, Actor("GUIDE", "Hộ khác", "kc-other"),
                         guide_user_id="kc-other") is Refusal.NOT_FOUND
    unassigned = add_booking(db, add_departure(db, tour, starts_at=NOW - timedelta(hours=1)), status="CONFIRMED")
    assert core.check_in(db, HTX, unassigned, 1, GUIDE, guide_user_id="kc-guide") is Refusal.NOT_FOUND


def test_undo_check_in_inside_the_window(running):
    db, _, _, booking = running
    assert core.undo_check_in(db, HTX, booking, MANAGER) is Refusal.WRONG_STATE
    core.check_in(db, HTX, booking, 3, MANAGER)
    undone = core.undo_check_in(db, HTX, booking, MANAGER)
    assert (undone.checked_in_at, undone.checked_in_count, undone.checked_in_by) == (None, None, None)
    assert events(db, booking)[-1][0] == "CHECK_IN_UNDONE"
    assert core.undo_check_in(db, HTX, booking, GUIDE, guide_user_id="kc-nobody") is Refusal.NOT_FOUND


# ---------- reviews ----------

def test_one_review_per_checked_in_booking(running):
    db, tour, _, booking = running
    assert core.add_review(db, HTX, booking, 5, "Rất đẹp", "Lan") is Refusal.NOT_ELIGIBLE  # not checked in yet
    core.check_in(db, HTX, booking, 3, MANAGER)
    review = core.add_review(db, HTX, booking, 5, "Rất đẹp", "")
    assert isinstance(review, core.Review)
    assert (review.rating, review.status, review.tour_id, review.display_name) == (5, "PENDING", tour, "Khách")
    assert core.add_review(db, HTX, booking, 4, "Lại", "Lan") is Refusal.ALREADY_REVIEWED
    assert db.execute("SELECT count(*) FROM reviews").fetchone()[0] == 1


def test_review_input_and_timing(running):
    db, tour, _, booking = running
    core.check_in(db, HTX, booking, 3, MANAGER)
    assert core.add_review(db, HTX, booking, 0, "x", "Lan") is Refusal.INVALID_INPUT
    assert core.add_review(db, HTX, booking, 6, "x", "Lan") is Refusal.INVALID_INPUT
    assert core.add_review(db, HTX, booking, 5, "x" * 1001, "Lan") is Refusal.INVALID_INPUT
    assert core.add_review(db, HTX, booking, 5, "x", "n" * 41) is Refusal.INVALID_INPUT
    early = add_booking(db, add_departure(db, tour, starts_at=NOW + timedelta(days=1)), status="CONFIRMED",
                        checked_in_at=NOW, checked_in_count=1)
    assert core.add_review(db, HTX, early, 5, "x", "Lan") is Refusal.NOT_ELIGIBLE  # before the departure


# ---------- seats ----------

def test_set_departure_seats(world):
    db, _, departure = world
    create(db, departure, adults=3)
    assert core.set_departure_seats(db, HTX, departure, 2) is Refusal.SEATS_BELOW_USED
    assert core.set_departure_seats(db, HTX, departure, 201) is Refusal.INVALID_INPUT
    assert core.set_departure_seats(db, HTX, departure, 0) is Refusal.INVALID_INPUT
    assert core.set_departure_seats(db, HTX, departure, 3) is None
    assert db.execute("SELECT seats FROM departures WHERE id = %s", (departure,)).fetchone()[0] == 3
    assert create(db, departure, adults=1) is Refusal.FULL


def test_concurrent_seat_shrink_and_booking_never_oversell(world, app_db_url):
    db, _, departure = world
    outcomes, barrier = {}, threading.Barrier(2)

    def book():
        with store.connect(app_db_url) as conn:
            barrier.wait()
            outcomes["book"] = core.create_booking(conn, new(departure, adults=4), GUEST)

    def shrink():
        with store.connect(app_db_url) as conn:
            barrier.wait()
            outcomes["shrink"] = core.set_departure_seats(conn, HTX, departure, 3)

    threads = [threading.Thread(target=book), threading.Thread(target=shrink)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    seats = db.execute("SELECT seats FROM departures WHERE id = %s", (departure,)).fetchone()[0]
    assert seats_used(db, departure) <= seats


# ---------- reading ----------

def test_find_and_lookup(world):
    db, _, departure = world
    booking = create(db, departure)
    assert core.find_booking(db, HTX, booking.code, booking.access_key).id == booking.id
    assert core.find_booking(db, HTX, booking.code.lower(), booking.access_key).id == booking.id
    assert core.find_booking(db, HTX, booking.code, "x" * 22) is None
    assert core.find_booking(db, HTX, booking.code, "") is None
    assert core.find_booking(db, "LB", booking.code, booking.access_key) is None
    assert core.lookup_booking(db, HTX, booking.code, "0912345678").id == booking.id
    assert core.lookup_booking(db, HTX, booking.code, "0912 345 678").id == booking.id
    assert core.lookup_booking(db, HTX, booking.code, "0999999999") is None
    assert core.lookup_booking(db, HTX, booking.code, "bad") is None
    assert core.lookup_booking(db, "LB", booking.code, "0912345678") is None


def test_computed_fields_of_a_booking(world):
    db, _, departure = world
    add_settings(db, deposit_percent=40)
    booking = create(db, departure, adults=2)
    assert booking.payment_state == "UNPAID" and booking.amount_due_now == 200_000 and booking.refund_due_vnd == 0
    paid = core.record_payment(db, HTX, booking.id, 200_000, "TRANSFER", None, MANAGER)
    assert paid.payment_state == "DEPOSITED" and paid.amount_due_now == 300_000


# ---------- isolation, history and the ledger ----------

def test_another_cooperatives_ids_are_not_found_everywhere(world):
    db, tour, departure = world
    booking = create(db, departure)
    for call in (
        lambda: core.confirm_booking(db, "LB", booking.id, MANAGER),
        lambda: core.record_payment(db, "LB", booking.id, 1000, "CASH", None, MANAGER),
        lambda: core.report_paid(db, "LB", booking.id),
        lambda: core.cancel_booking(db, "LB", booking.id, "x", MANAGER),
        lambda: core.move_booking(db, "LB", booking.id, departure, MANAGER),
        lambda: core.resize_booking(db, "LB", booking.id, 1, 0, MANAGER),
        lambda: core.check_in(db, "LB", booking.id, 1, MANAGER),
        lambda: core.undo_check_in(db, "LB", booking.id, MANAGER),
        lambda: core.cancel_departure(db, "LB", departure, "x", MANAGER),
        lambda: core.set_departure_seats(db, "LB", departure, 3),
        lambda: core.add_review(db, "LB", booking.id, 5, "x", "x"),
        lambda: core.create_booking(db, new(departure, htx="LB"), GUEST),
    ):
        assert call() is Refusal.NOT_FOUND
    assert core.get_booking(db, "LB", booking.id) is None
    assert booking_row(db, booking.id)[0] == "PENDING" and seats_used(db, departure) == 2


def test_every_change_writes_one_event_with_its_actor(world):
    db, tour, departure = world
    add_settings(db, deposit_percent=30)
    booking = create(db, departure, adults=2)
    other = add_departure(db, tour, starts_at=LATER + timedelta(days=1))
    core.report_paid(db, HTX, booking.id)
    core.record_payment(db, HTX, booking.id, 150_000, "TRANSFER", None, MANAGER)  # reaches the deposit: confirmed
    core.resize_booking(db, HTX, booking.id, 3, 0, MANAGER)
    core.move_booking(db, HTX, booking.id, other, MANAGER)
    core.cancel_booking(db, HTX, booking.id, "Khách xin huỷ", MANAGER)
    assert events(db, booking.id) == [
        ("CREATED", "GUEST", "Nguyễn Văn Khách"), ("PAID_REPORTED", "GUEST", "Nguyễn Văn Khách"),
        ("PAYMENT", "MANAGER", "Quản trị TC"), ("CONFIRMED", "MANAGER", "Quản trị TC"),
        ("RESIZED", "MANAGER", "Quản trị TC"), ("MOVED", "MANAGER", "Quản trị TC"),
        ("CANCELLED", "MANAGER", "Quản trị TC")]
    assert db.execute("SELECT max(char_length(detail)) FROM booking_events").fetchone()[0] <= 300


def test_paid_always_equals_the_ledger(world):
    db, _, departure = world
    add_settings(db, deposit_percent=30)
    booking = create(db, departure, adults=4)
    for amount in (100_000, 250_000, -50_000, 700_000):
        core.record_payment(db, HTX, booking.id, amount, "TRANSFER", None, MANAGER)
        assert ledger_matches(db, booking.id)
    core.resize_booking(db, HTX, booking.id, 2, 0, MANAGER)
    core.cancel_booking(db, HTX, booking.id, "x", MANAGER)
    assert ledger_matches(db, booking.id)
    assert core.get_booking(db, HTX, booking.id).paid_vnd == 1_000_000


# ---------- late deposit restores a hold-expired booking (spec 7.2) ----------

def expired_cancelled(db, departure, adults=2, **fields):
    """A booking the sweep cancelled for an expired hold (deposit 100.000, nothing recorded yet)."""
    return add_booking(db, departure, adults=adults, status="CANCELLED", deposit_vnd=100_000,
                       cancel_reason=core.HOLD_EXPIRED, cancelled_by="SYSTEM", cancelled_at=NOW, **fields)


def pay(db, booking_id, amount=100_000):
    return core.record_payment(db, HTX, booking_id, amount, "TRANSFER", "Chuyển muộn", MANAGER)


def test_late_deposit_restores_a_hold_expired_booking(world):
    db, _, departure = world
    booking = expired_cancelled(db, departure)
    restored = pay(db, booking)
    assert (restored.status, restored.cancel_reason, restored.cancelled_by, restored.cancelled_at) == (
        "CONFIRMED", None, None, None)
    assert restored.paid_vnd == 100_000 and restored.payment_state == "DEPOSITED"
    assert events(db, booking)[-2:] == [("PAYMENT", "MANAGER", "Quản trị TC"), ("RESTORED", "MANAGER", "Quản trị TC")]
    assert db.execute("SELECT detail FROM booking_events WHERE booking_id = %s AND kind = 'RESTORED'",
                      (booking,)).fetchone()[0] == "Khôi phục: tiền cọc về sau hạn giữ chỗ"
    assert seats_used(db, departure) == 2 and ledger_matches(db, booking)


def test_late_deposit_does_not_restore_when_the_seats_were_taken(world):
    db, _, departure = world
    booking = expired_cancelled(db, departure, adults=2)
    assert isinstance(create(db, departure, adults=4), core.Booking)  # 4 of 5 seats gone; 2 do not fit
    late = pay(db, booking)
    assert (late.status, late.payment_state, late.refund_due_vnd) == ("CANCELLED", "REFUND_DUE", 100_000)
    assert [e[0] for e in events(db, booking)].count("RESTORED") == 0


def test_late_deposit_does_not_restore_after_the_departure_started(world):
    db, tour, _ = world
    started = add_departure(db, tour, starts_at=NOW - timedelta(hours=1))
    late = pay(db, expired_cancelled(db, started))
    assert late.status == "CANCELLED" and late.refund_due_vnd == 100_000
    cancelled = add_departure(db, tour, status="CANCELLED")
    assert pay(db, expired_cancelled(db, cancelled)).status == "CANCELLED"


def test_late_deposit_does_not_restore_a_booking_cancelled_by_the_guest_or_the_manager(world):
    db, _, departure = world
    add_settings(db, deposit_percent=40)
    for actor in (GUEST, MANAGER):
        booking = create(db, departure, adults=1)
        core.cancel_booking(db, HTX, booking.id, "Đổi ý", actor)
        late = pay(db, booking.id, booking.deposit_vnd)
        assert (late.status, late.refund_due_vnd) == ("CANCELLED", booking.deposit_vnd)
    stale = add_booking(db, departure, status="CANCELLED", deposit_vnd=100_000, cancel_reason=core.STALE_PENDING,
                        cancelled_by="SYSTEM")
    assert pay(db, stale).status == "CANCELLED"  # only an expired hold is restored


def test_late_payment_below_the_deposit_does_not_restore(world):
    db, _, departure = world
    booking = expired_cancelled(db, departure)
    part = pay(db, booking, 60_000)
    assert (part.status, part.paid_vnd) == ("CANCELLED", 60_000)
    assert pay(db, booking, 40_000).status == "CONFIRMED"  # the rest of the deposit arrives: restored then


def test_payment_recorded_right_after_the_hold_ran_out_restores_in_the_same_call(world):
    db, _, departure = world
    booking = add_booking(db, departure, adults=2, deposit_vnd=100_000, hold_until=NOW - timedelta(minutes=5))
    restored = pay(db, booking)  # _locked sweeps first (cancels), the payment then restores it
    assert (restored.status, restored.cancelled_by) == ("CONFIRMED", None)
    assert [e[0] for e in events(db, booking)] == ["CANCELLED", "PAYMENT", "RESTORED"]
    assert seats_used(db, departure) == 2


# ---------- request keys per cooperative ----------

def test_same_request_key_in_another_cooperative_creates_its_own_booking(world):
    db, _, departure = world
    other = add_departure(db, add_tour(db, htx="LB"), htx="LB")
    mine = core.create_booking(db, new(departure, request_key="shared-key-0001"), GUEST)
    theirs = core.create_booking(db, new(other, htx="LB", request_key="shared-key-0001"), GUEST)
    assert isinstance(mine, core.Booking) and isinstance(theirs, core.Booking) and mine.id != theirs.id
    assert (mine.htx_code, theirs.htx_code) == ("TC", "LB")
    assert core.create_booking(db, new(departure, request_key="shared-key-0001"), GUEST).id == mine.id


def test_a_unique_violation_that_is_not_the_code_is_not_retried(world, monkeypatch):
    db, _, departure = world
    add_booking(db, departure, request_key="dup-key-000001")
    calls = []
    monkeypatch.setattr(core.secrets, "choice", lambda alphabet: calls.append(1) or "A")
    dep = core._lock_departures(db, HTX, [departure])[departure]
    import psycopg
    with pytest.raises(psycopg.errors.UniqueViolation):
        core._insert_booking(db, new(departure, request_key="dup-key-000001"), dep, 500_000, 0, None, "PENDING")
    assert len(calls) == 8  # one code drawn, no second attempt
