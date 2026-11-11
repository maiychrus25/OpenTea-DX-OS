# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import threading
import uuid
from datetime import datetime, timedelta, timezone

import psycopg
import pytest
from conftest import add_booking, add_tour

from tea_tour import store
from tea_tour.store import Booking, BookingRefusal, normalize_phone


def test_twenty_concurrent_bookings_fill_five_seats_exactly(db, pg_url):
    """Review Focus 1: 20 guests race for 5 seats; the row lock lets exactly 5 through."""
    tour_id = add_tour(db, seats=5)
    start = threading.Barrier(20)
    results = []

    def guest(n):
        # One connection each, so the race is real; as the superuser because the app role allows 10 connections.
        with store.connect(pg_url) as conn:
            start.wait()
            results.append(store.book(conn, "TC", tour_id, f"Khách {n}", "0912345678", 1, None))

    threads = [threading.Thread(target=guest, args=(n,)) for n in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sum(isinstance(r, Booking) for r in results) == 5
    assert results.count(BookingRefusal.FULL) == 15
    assert db.execute("SELECT count(*), sum(party_size) FROM bookings").fetchone() == (5, 5)
    assert len({r.code for r in results if isinstance(r, Booking)}) == 5


def test_refuses_past_cancelled_and_other_htx_tours(db):
    """Review Focus 4: refused with a Vietnamese message, nothing stored."""
    past = add_tour(db, starts_at=datetime.now(timezone.utc) - timedelta(minutes=1))
    cancelled = add_tour(db, status="CANCELLED")
    other_htx = add_tour(db, htx="LB")
    cases = [(past, BookingRefusal.CLOSED), (cancelled, BookingRefusal.CLOSED),
             (other_htx, BookingRefusal.NOT_FOUND), (uuid.uuid4(), BookingRefusal.NOT_FOUND)]
    for tour_id, refusal in cases:
        assert store.book(db, "TC", tour_id, "Khách", "0912345678", 2, None) is refusal
    assert BookingRefusal.FULL.message == "Tour đã hết chỗ."
    assert BookingRefusal.CLOSED.message == "Tour đã đóng hoặc đã diễn ra."
    assert BookingRefusal.NOT_FOUND.message == "Không tìm thấy tour."
    assert db.execute("SELECT count(*) FROM bookings").fetchone()[0] == 0


def test_party_larger_than_seats_left_is_full_and_cancelled_bookings_free_seats(db):
    tour_id = add_tour(db, seats=3)
    add_booking(db, tour_id, code="AAAA2222", party_size=2, status="CONFIRMED")
    add_booking(db, tour_id, code="BBBB3333", party_size=1, status="CANCELLED")
    assert store.book(db, "TC", tour_id, "Khách", "0912345678", 2, None) is BookingRefusal.FULL
    booking = store.book(db, "TC", tour_id, "Khách", "0912345678", 1, "Đi cùng trẻ nhỏ")
    assert isinstance(booking, Booking) and booking.status == "PENDING" and booking.note == "Đi cùng trẻ nhỏ"


def test_booking_code_retries_a_taken_code(db, monkeypatch):
    tour_id = add_tour(db)
    add_booking(db, tour_id, code="AAAAAAAA")
    picks = iter("A" * 8 + "B" * 8)
    monkeypatch.setattr(store.secrets, "choice", lambda alphabet: next(picks))
    booking = store.book(db, "TC", tour_id, "Khách", "0912345678", 1, None)
    assert isinstance(booking, Booking) and booking.code == "BBBBBBBB"


def test_booking_code_gives_up_after_five_taken_codes(db, monkeypatch):
    tour_id = add_tour(db)
    add_booking(db, tour_id, code="AAAAAAAA")
    monkeypatch.setattr(store.secrets, "choice", lambda alphabet: "A")
    with pytest.raises(psycopg.errors.UniqueViolation):
        store.book(db, "TC", tour_id, "Khách", "0912345678", 1, None)
    assert db.execute("SELECT count(*) FROM bookings").fetchone()[0] == 1


def test_booking_code_alphabet():
    assert set(store.new_code()) <= set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") and len(store.new_code()) == 8


def test_normalize_phone():
    for raw in ("0912 345 678", "+84912345678", "0912.345.678", "0912-345-678", " 0912345678 "):
        assert normalize_phone(raw) == "0912345678", raw
    for raw in ("12345", "", "091234567", "09123456789", "+8491234567", "0912a45678", "84912345678"):
        assert normalize_phone(raw) is None, raw


def test_app_role_cannot_read_core_tables(db):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        db.execute("SELECT 1 FROM platform.installed_apps LIMIT 1")


def test_booking_must_belong_to_its_tours_htx(db):
    tour_id = add_tour(db)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        add_booking(db, tour_id, htx="LB")


def test_confirm_needs_an_open_tour(db):
    tour_id = add_tour(db, status="CANCELLED")
    booking_id = add_booking(db, tour_id)
    assert store.set_booking_status(db, "TC", booking_id, "CONFIRMED", ("PENDING",), open_tour=True) == (tour_id, False)
    assert store.set_booking_status(db, "TC", booking_id, "CANCELLED", ("PENDING",)) == (tour_id, True)


def test_edit_tour_is_refused_for_closed_missing_or_overbooked_tours(db):
    """The store checks again under the row lock: the page's own check can race with a cancel or a booking."""
    values = dict(title="Mới", starts_at=datetime.now(timezone.utc) + timedelta(days=3), meeting_point="Đồi",
                  seats=2, price_vnd=0, description=None, guide_user_id=None, guide_name="Hộ ông Ba")
    cancelled = add_tour(db, title="Cũ", status="CANCELLED")
    past = add_tour(db, title="Cũ", starts_at=datetime.now(timezone.utc) - timedelta(minutes=1))
    booked = add_tour(db, title="Cũ", seats=5)
    add_booking(db, booked, party_size=3)
    assert store.edit_tour(db, "TC", cancelled, **values) is store.EditRefusal.CLOSED
    assert store.edit_tour(db, "TC", past, **values) is store.EditRefusal.CLOSED
    assert store.edit_tour(db, "LB", booked, **values) is store.EditRefusal.NOT_FOUND
    assert store.edit_tour(db, "TC", booked, **values) is store.EditRefusal.SEATS
    assert db.execute("SELECT count(*) FROM tours WHERE title = 'Cũ'").fetchone()[0] == 3
    assert store.edit_tour(db, "TC", booked, **{**values, "seats": 3}) is None
    assert db.execute("SELECT title, seats FROM tours WHERE id = %s", (booked,)).fetchone() == ("Mới", 3)
