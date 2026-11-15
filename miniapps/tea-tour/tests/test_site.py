# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Customer site under /public/<htx>: catalogue, booking flow, my booking, ticket, reviews, inquiry, policy."""
import re
from datetime import timedelta
from urllib.parse import parse_qs, urlparse
from uuid import UUID

import pytest
from factories import (EARLIER, LATER, NOW, add_booking, add_departure, add_inquiry, add_media, add_payment, add_review,
                       add_settings, add_tour, add_tour_media)

from tea_tour.store import core

PUB = "/public/TC"
BANK = dict(display_name="HTX Chè Tân Cương", hotline="0912 345 678", bank_bin="970405", bank_account="8600201001234",
            bank_holder="HTX CHE TAN CUONG", deposit_percent=30)
GUEST = core.Actor("GUEST", "Khách")


def count(db, table, where="true"):
    return db.execute(f"SELECT count(*) FROM {table} WHERE {where}").fetchone()[0]


def make(db, **tour):
    """A published tour with one open departure next week; returns (tour_id, departure_id, slug)."""
    tour_id = add_tour(db, **tour)
    slug = db.execute("SELECT slug FROM tours WHERE id = %s", (tour_id,)).fetchone()[0]
    return tour_id, add_departure(db, tour_id), slug


def book_through_core(db, departure_id, adults=2, children=0, key="request-key-0001", phone="0912345678", name="Lê Văn A"):
    booking = core.create_booking(db, core.NewBooking("TC", departure_id, adults, children, name, phone, None, None, key), GUEST)
    assert isinstance(booking, core.Booking), booking
    return booking


def booking_url(booking, path="/booking", **extra):
    query = "&".join(f"{k}={v}" for k, v in {"code": booking.code, "key": booking.access_key, **extra}.items())
    return f"{PUB}{path}?{query}"


# ---------- home ----------

def test_home_shows_cooperative_cover_and_published_tours(client, db):
    add_settings(db, tagline="Chè ngon từ đồi", intro="Chúng tôi làm chè ba đời.", **BANK)
    cover = add_media(db)
    db.execute("UPDATE settings SET cover_media_id = %s WHERE htx_code = 'TC'", (cover,))
    tour_id, _, slug = make(db, title="Hái chè buổi sáng")
    add_tour(db, title="Bản nháp ẩn", status="DRAFT")
    add_tour(db, title="Tour đã lưu trữ", status="ARCHIVED")
    add_tour(db, htx="LB", title="Tour của HTX khác")
    html = client.get(f"{PUB}/").text
    assert "HTX Chè Tân Cương" in html and "Chè ngon từ đồi" in html and "Chúng tôi làm chè ba đời." in html
    assert f"/public/TC/media/{cover}-large.jpg" in html
    assert "Hái chè buổi sáng" in html and f"/public/TC/tours/{slug}" in html
    assert "Bản nháp ẩn" not in html and "Tour đã lưu trữ" not in html and "Tour của HTX khác" not in html
    assert client.get(PUB).status_code == 200  # without the slash


def test_home_features_at_most_six_tours_with_upcoming_first(client, db):
    for index in range(7):
        add_tour(db, title=f"Tour không chuyến {index}")
    bookable = add_tour(db, title="Tour có chuyến sắp tới")
    add_departure(db, bookable)
    html = client.get(f"{PUB}/").text
    assert html.count('class="tour-card"') == 6
    assert "Tour có chuyến sắp tới" in html


def test_home_of_empty_cooperative_has_empty_state(client, db):
    response = client.get(f"{PUB}/")
    assert response.status_code == 200 and "Chưa có tour nào đang mở bán" in response.text


def test_home_shows_recent_published_reviews_only(client, db):
    tour_id, departure, _ = make(db)
    past = add_departure(db, tour_id, starts_at=EARLIER)
    for status, comment in (("PUBLISHED", "Khung cảnh tuyệt vời"), ("PENDING", "Chờ duyệt kín"), ("HIDDEN", "Bị ẩn đi")):
        booking = add_booking(db, past, status="CONFIRMED", checked_in_count=1, phone="0911000001")
        add_review(db, booking, tour_id, status=status, comment=comment)
    html = client.get(f"{PUB}/").text
    assert "Khung cảnh tuyệt vời" in html and "Chờ duyệt kín" not in html and "Bị ẩn đi" not in html


@pytest.mark.parametrize("path", ["", "/", "/tours", "/policy", "/inquiry", "/booking"])
def test_every_page_has_no_referrer_meta_no_script_and_no_inline_style(client, db, path):
    add_settings(db, **BANK)
    make(db)
    response = client.get(f"{PUB}{path}")
    assert response.status_code == 200
    html = response.text
    assert '<meta name="referrer" content="no-referrer">' in html
    assert "<script" not in html and "style=" not in html and "<style" not in html


def test_invalid_cooperative_code_is_not_found(client, db):
    assert client.get("/public/a%20b/tours").status_code == 404
    assert client.get(f"{PUB}/nowhere").status_code == 404


# ---------- catalogue ----------

def titles(html):
    return re.findall(r'<h3 class="tour-card-title"><a [^>]*>([^<]+)</a>', html)


def test_tours_filter_by_category(client, db):
    add_tour(db, title="Hái chè", category="PICKING")
    add_tour(db, title="Sao chè", category="CRAFTING")
    assert titles(client.get(f"{PUB}/tours?category=CRAFTING").text) == ["Sao chè"]
    assert sorted(titles(client.get(f"{PUB}/tours").text)) == ["Hái chè", "Sao chè"]
    assert sorted(titles(client.get(f"{PUB}/tours?category=BOGUS").text)) == ["Hái chè", "Sao chè"]  # unknown value is ignored


def test_tours_filter_by_month_of_a_bookable_departure(client, db):
    near, far = add_tour(db, title="Gần"), add_tour(db, title="Xa")
    add_departure(db, near, starts_at=NOW + timedelta(days=3))
    add_departure(db, far, starts_at=NOW + timedelta(days=75))
    month = (NOW + timedelta(days=75)).astimezone(core.policy.VN_TZ).strftime("%Y-%m")
    assert titles(client.get(f"{PUB}/tours?month={month}").text) == ["Xa"]
    assert sorted(titles(client.get(f"{PUB}/tours?month=nonsense").text)) == ["Gần", "Xa"]


def test_tours_filter_without_result_offers_to_clear(client, db):
    add_tour(db, title="Hái chè", category="PICKING")
    html = client.get(f"{PUB}/tours?category=EDUCATION").text
    assert "Không có tour phù hợp" in html and "Xoá bộ lọc" in html


def test_tours_sort_soon_puts_bookable_first_then_by_name(client, db):
    later, sooner, none_b, none_a = (add_tour(db, title=t) for t in ("Chuyến muộn", "Chuyến sớm", "B không chuyến", "A không chuyến"))
    add_departure(db, later, starts_at=NOW + timedelta(days=9))
    add_departure(db, sooner, starts_at=NOW + timedelta(days=2))
    assert titles(client.get(f"{PUB}/tours?sort=soon").text) == ["Chuyến sớm", "Chuyến muộn", "A không chuyến", "B không chuyến"]
    assert titles(client.get(f"{PUB}/tours").text) == titles(client.get(f"{PUB}/tours?sort=soon").text)  # default


def test_tours_sort_price_uses_lowest_bookable_adult_price(client, db):
    cheap_tour = add_tour(db, title="Giá tour cao", price_adult_vnd=900_000)
    add_departure(db, cheap_tour, price_adult_vnd=100_000)
    add_departure(db, cheap_tour, price_adult_vnd=50_000, status="CLOSED")  # closed does not count
    add_departure(db, cheap_tour, price_adult_vnd=40_000, starts_at=EARLIER)  # past does not count
    mid = add_tour(db, title="Không chuyến", price_adult_vnd=300_000)
    full = add_tour(db, title="Chuyến đầy", price_adult_vnd=200_000)
    full_departure = add_departure(db, full, seats=1, price_adult_vnd=20_000)
    add_booking(db, full_departure, status="CONFIRMED")
    html = client.get(f"{PUB}/tours?sort=price").text
    assert titles(html) == ["Giá tour cao", "Chuyến đầy", "Không chuyến"]
    assert "100.000 ₫" in html and "300.000 ₫" in html and "200.000 ₫" in html  # tour price when nothing is bookable
    assert "20.000 ₫" not in html and "40.000 ₫" not in html


def test_tours_sort_rating_best_first_unrated_last_ties_by_name(client, db):
    past = {}
    names = ("Điểm cao", "Điểm thấp", "Chưa có điểm", "Bằng điểm cao")
    ids = {name: add_tour(db, title=name) for name in names}
    for name, rating, status in (("Điểm cao", 5, "PUBLISHED"), ("Bằng điểm cao", 5, "PUBLISHED"), ("Điểm thấp", 3, "PUBLISHED"),
                                 ("Chưa có điểm", 1, "PENDING")):
        departure = add_departure(db, ids[name], starts_at=EARLIER)
        booking = add_booking(db, departure, status="CONFIRMED", checked_in_count=1)
        add_review(db, booking, ids[name], rating=rating, status=status)
    html = client.get(f"{PUB}/tours?sort=rating").text
    assert titles(html) == ["Bằng điểm cao", "Điểm cao", "Điểm thấp", "Chưa có điểm"]
    assert "5,0" in html and "3,0" in html


def test_tours_paging_twelve_per_page(client, db):
    for index in range(14):
        add_tour(db, title=f"Tour số {index:02d}")
    first, second = client.get(f"{PUB}/tours").text, client.get(f"{PUB}/tours?page=2").text
    assert len(titles(first)) == 12 and len(titles(second)) == 2
    assert "page=2" in first and set(titles(first)).isdisjoint(titles(second))
    assert len(titles(client.get(f"{PUB}/tours?page=99").text)) == 2  # beyond the end is the last page


def test_tour_card_shows_next_departure_and_seats_left(client, db):
    tour_id = add_tour(db)
    departure = add_departure(db, tour_id, seats=10)
    add_booking(db, departure, adults=3, status="CONFIRMED")
    html = client.get(f"{PUB}/tours").text
    assert "Còn 7 chỗ" in html


# ---------- tour page ----------

def test_tour_page_content(client, db):
    media = add_media(db)
    tour_id, departure, slug = make(
        db, title="Sao chè truyền thống", description="Học sao chè trên chảo gang.",
        itinerary=[{"time": "08:00", "title": "Đón khách", "detail": "Tại nhà văn hoá"}], includes=["Bữa trưa"],
        excludes=["Đồ uống riêng"], bring=["Mũ rộng vành"], faq=[{"q": "Trời mưa thì sao?", "a": "Dời sang ngày khác."}],
        map_url="https://maps.example.com/x")
    add_tour_media(db, tour_id, media)
    db.execute("UPDATE departures SET guide_name = 'Hộ ông Ba' WHERE id = %s", (departure,))
    add_settings(db, cancel_free_hours=48, deposit_percent=30)
    html = client.get(f"{PUB}/tours/{slug}").text
    for text in ("Sao chè truyền thống", "Học sao chè trên chảo gang.", "Đón khách", "Tại nhà văn hoá", "Bữa trưa",
                 "Đồ uống riêng", "Mũ rộng vành", "Trời mưa thì sao?", "Dời sang ngày khác.", "Nhà văn hoá xóm Hồng Thái",
                 "Hộ ông Ba", "Còn 10 chỗ", "48 giờ"):
        assert text in html, text
    assert f"/public/TC/media/{media}-large.jpg" in html
    assert f"/public/TC/tours/{slug}/book?departure={departure}" in html
    assert 'rel="noopener noreferrer"' in html and "https://maps.example.com/x" in html


@pytest.mark.parametrize("status", ["DRAFT", "ARCHIVED"])
def test_unpublished_tour_page_is_404(client, db, status):
    tour_id = add_tour(db, status=status)
    slug = db.execute("SELECT slug FROM tours WHERE id = %s", (tour_id,)).fetchone()[0]
    assert client.get(f"{PUB}/tours/{slug}").status_code == 404
    assert client.get(f"{PUB}/tours/{slug}/book").status_code == 404


def test_other_cooperatives_tour_is_404(client, db):
    other = add_tour(db, htx="LB")
    slug = db.execute("SELECT slug FROM tours WHERE id = %s", (other,)).fetchone()[0]
    assert client.get(f"{PUB}/tours/{slug}").status_code == 404
    assert client.get(f"/public/LB/tours/{slug}").status_code == 200


def test_tour_page_seats_left_come_from_the_load_view(client, db):
    tour_id = add_tour(db)
    departure = add_departure(db, tour_id, seats=10)
    slug = db.execute("SELECT slug FROM tours WHERE id = %s", (tour_id,)).fetchone()[0]
    add_booking(db, departure, adults=2, children=1, status="CONFIRMED")
    add_booking(db, departure, adults=4, status="PENDING", deposit_vnd=100_000, hold_until=NOW + timedelta(hours=5))
    add_booking(db, departure, adults=1, status="PENDING", deposit_vnd=100_000, hold_until=NOW - timedelta(hours=1))  # expired
    add_booking(db, departure, adults=1, status="CANCELLED")
    assert "Còn 3 chỗ" in client.get(f"{PUB}/tours/{slug}").text
    add_booking(db, departure, adults=3, status="CONFIRMED")
    html = client.get(f"{PUB}/tours/{slug}").text
    assert "Hết chỗ" in html and f"book?departure={departure}" not in html


def test_tour_page_lists_closed_departure_as_not_bookable_and_hides_cancelled_and_past(client, db):
    tour_id = add_tour(db)
    slug = db.execute("SELECT slug FROM tours WHERE id = %s", (tour_id,)).fetchone()[0]
    closed = add_departure(db, tour_id, status="CLOSED")
    cancelled = add_departure(db, tour_id, status="CANCELLED", starts_at=LATER + timedelta(days=1))
    past = add_departure(db, tour_id, starts_at=EARLIER)
    html = client.get(f"{PUB}/tours/{slug}").text
    assert "Đã đóng đặt chỗ" in html
    for departure in (closed, cancelled, past):
        assert f"book?departure={departure}" not in html


def test_tour_page_without_departures_offers_inquiry(client, db):
    tour_id = add_tour(db)
    slug = db.execute("SELECT slug FROM tours WHERE id = %s", (tour_id,)).fetchone()[0]
    html = client.get(f"{PUB}/tours/{slug}").text
    assert "Chưa có chuyến sắp tới" in html and f"{PUB}/inquiry" in html


def test_tour_page_shows_only_published_reviews_and_their_average(client, db):
    tour_id, _, slug = make(db)
    past = add_departure(db, tour_id, starts_at=EARLIER)
    for rating, status, comment, reply in ((5, "PUBLISHED", "Rất tuyệt", "Cảm ơn bạn"), (4, "PUBLISHED", "Khá tốt", None),
                                           (1, "PENDING", "Chờ duyệt", None), (1, "HIDDEN", "Đã ẩn", None)):
        booking = add_booking(db, past, status="CONFIRMED", checked_in_count=1, guest_name="Trần Tên Thật", phone="0933000111")
        add_review(db, booking, tour_id, rating=rating, status=status, comment=comment, reply=reply, display_name="Hoa")
    html = client.get(f"{PUB}/tours/{slug}").text
    assert "Rất tuyệt" in html and "Khá tốt" in html and "Cảm ơn bạn" in html
    assert "Chờ duyệt" not in html and "Đã ẩn" not in html
    assert "4,5" in html and "2 đánh giá" in html
    assert "Trần Tên Thật" not in html and "0933000111" not in html and "Hoa" in html


def test_hostile_text_is_escaped_everywhere_on_the_tour_page(client, db):
    hostile = "<script>alert(1)</script>"
    tour_id, _, slug = make(db, title=hostile, summary=hostile, description=hostile,
                            itinerary=[{"time": "1", "title": hostile, "detail": hostile}], includes=[hostile],
                            faq=[{"q": hostile, "a": hostile}])
    past = add_departure(db, tour_id, starts_at=EARLIER)
    booking = add_booking(db, past, status="CONFIRMED", checked_in_count=1)
    add_review(db, booking, tour_id, comment=hostile, display_name=hostile)
    html = client.get(f"{PUB}/tours/{slug}").text
    assert "<script>alert(1)" not in html and "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<script" not in client.get(f"{PUB}/tours").text and "<script>alert" not in client.get(f"{PUB}/").text


# ---------- booking step 1 and 2 ----------

def valid_form(chosen, **override):
    return {"departure": str(chosen), "adults": "2", "children": "1", "guest_name": "Nguyễn Thị Hoa",
            "phone": "0912 345 678", "email": "hoa@example.com", "note": "Có bé 5 tuổi", **override}


def test_step_one_form_lists_bookable_departures_and_preselects(client, db):
    add_settings(db, **BANK)
    tour_id, departure, slug = make(db)
    other = add_departure(db, tour_id, starts_at=LATER + timedelta(days=2))
    html = client.get(f"{PUB}/tours/{slug}/book?departure={other}").text
    assert f'value="{departure}"' in html and f'value="{other}"' in html
    assert re.search(rf'value="{other}"[^>]*checked', html) and not re.search(rf'value="{departure}"[^>]*checked', html)
    assert 'name="adults"' in html and 'name="guest_name"' in html and 'name="phone"' in html


def test_step_one_form_without_bookable_departure_says_so(client, db):
    tour_id = add_tour(db)
    slug = db.execute("SELECT slug FROM tours WHERE id = %s", (tour_id,)).fetchone()[0]
    assert "Chưa có chuyến nào để đặt" in client.get(f"{PUB}/tours/{slug}/book").text


@pytest.mark.parametrize("override,message", [
    ({"guest_name": " "}, "Vui lòng nhập họ tên"),
    ({"phone": "123"}, "Số điện thoại gồm 10 chữ số"),
    ({"adults": "0", "children": "2"}, "ít nhất một người lớn"),
    ({"adults": "20", "children": "1"}, "tối đa 20 người"),
    ({"adults": "abc"}, "Số người lớn không hợp lệ"),
    ({"children": "-1"}, "Số trẻ em không hợp lệ"),
    ({"email": "khong-hop-le"}, "Email không hợp lệ"),
    ({"departure": "not-a-uuid"}, "Vui lòng chọn một chuyến"),
    ({"note": "x" * 501}, "tối đa 500 ký tự"),
])
def test_step_one_invalid_input_is_422_keeps_values_and_writes_nothing(client, db, override, message):
    tour_id, departure, slug = make(db)
    form = valid_form(departure, **override)
    response = client.post(f"{PUB}/tours/{slug}/book", data=form)
    assert response.status_code == 422 and message in response.text
    assert count(db, "bookings") == 0
    if override.get("guest_name", "x").strip():
        assert "Nguyễn Thị Hoa" in response.text


def test_step_one_with_a_full_departure_is_422_with_the_refusal_message(client, db):
    tour_id, departure, slug = make(db)
    db.execute("UPDATE departures SET seats = 2 WHERE id = %s", (departure,))
    add_booking(db, departure, adults=2, status="CONFIRMED")
    response = client.post(f"{PUB}/tours/{slug}/book", data=valid_form(departure))
    assert response.status_code == 422 and core.Refusal.FULL.message in response.text and count(db, "bookings") == 1


def test_step_one_with_closed_or_past_or_foreign_departure_is_refused(client, db):
    tour_id, departure, slug = make(db)
    closed = add_departure(db, tour_id, status="CLOSED")
    past = add_departure(db, tour_id, starts_at=EARLIER)
    other_tour = add_tour(db)
    foreign = add_departure(db, other_tour)
    for chosen in (closed, past, foreign):
        response = client.post(f"{PUB}/tours/{slug}/book", data=valid_form(chosen))
        assert response.status_code == 422, chosen
    assert count(db, "bookings") == 0


def test_valid_step_one_shows_step_two_and_writes_nothing(client, db):
    add_settings(db, **BANK)
    tour_id, departure, slug = make(db)
    response = client.post(f"{PUB}/tours/{slug}/book", data=valid_form(departure))
    assert response.status_code == 200 and count(db, "bookings") == 0
    html = response.text
    assert "650.000 ₫" in html and "195.000 ₫" in html and "Giữ chỗ" in html and "Xác nhận đặt chỗ" in html
    assert 'name="agree"' in html and 'name="request_key"' in html and 'name="expected_total"' in html
    assert "Nguyễn Thị Hoa" in html and "0912345678" in html
    assert f'name="departure" value="{departure}"' in html


def test_step_two_without_deposit_says_no_deposit_needed(client, db):
    add_settings(db, deposit_percent=0)
    tour_id, departure, slug = make(db)
    html = client.post(f"{PUB}/tours/{slug}/book", data=valid_form(departure)).text
    assert "Không cần đặt cọc" in html


def test_step_two_back_button_returns_to_step_one_with_values(client, db):
    tour_id, departure, slug = make(db)
    response = client.post(f"{PUB}/tours/{slug}/book", data={**valid_form(departure), "back": "1"})
    assert response.status_code == 200 and 'name="guest_name"' in response.text and "Nguyễn Thị Hoa" in response.text
    assert count(db, "bookings") == 0


# ---------- confirming ----------

def confirm_form(chosen, **override):
    return {**valid_form(chosen), "request_key": "key-from-step-two-1", "expected_total": "650000", "agree": "on", **override}


def test_confirming_creates_the_booking_and_redirects_to_its_page(client, db):
    add_settings(db, **BANK)
    tour_id, departure, slug = make(db)
    response = client.post(f"{PUB}/bookings", data=confirm_form(departure))
    assert response.status_code == 303
    location = urlparse(response.headers["location"])
    assert location.path == "/apps/tea-tour/public/TC/booking"
    query = parse_qs(location.query)
    assert query["booked"] == ["1"] and len(query["code"][0]) == 8 and len(query["key"][0]) == 22
    row = db.execute("SELECT adults, children, total_vnd, deposit_vnd, phone, source, status FROM bookings").fetchone()
    assert row == (2, 1, 650_000, 195_000, "0912345678", "WEB", "PENDING")


def test_confirming_twice_creates_one_booking_and_both_redirect_to_it(client, db):
    tour_id, departure, slug = make(db)
    first = client.post(f"{PUB}/bookings", data=confirm_form(departure))
    second = client.post(f"{PUB}/bookings", data=confirm_form(departure))
    assert first.status_code == second.status_code == 303 and first.headers["location"] == second.headers["location"]
    assert count(db, "bookings") == 1


def test_price_change_after_step_two_shows_step_two_again_with_the_new_total(client, db):
    add_settings(db, **BANK)
    tour_id, departure, slug = make(db)
    db.execute("UPDATE departures SET price_adult_vnd = 300000 WHERE id = %s", (departure,))
    response = client.post(f"{PUB}/bookings", data=confirm_form(departure))
    assert response.status_code == 200 and count(db, "bookings") == 0
    assert core.Refusal.PRICE_CHANGED.message in response.text and "750.000 ₫" in response.text
    assert 'name="expected_total" value="750000"' in response.text
    again = client.post(f"{PUB}/bookings", data=confirm_form(departure, expected_total="750000"))
    assert again.status_code == 303 and count(db, "bookings") == 1


def test_confirming_without_agreeing_to_the_policy_is_422(client, db):
    tour_id, departure, slug = make(db)
    form = confirm_form(departure)
    del form["agree"]
    response = client.post(f"{PUB}/bookings", data=form)
    assert response.status_code == 422 and "đồng ý" in response.text and count(db, "bookings") == 0


@pytest.mark.parametrize("override", [{"adults": "0"}, {"adults": "20", "children": "1"}, {"phone": "12"},
                                      {"guest_name": ""}, {"request_key": "short"}, {"expected_total": "abc"}])
def test_confirming_with_bad_input_is_422_and_creates_nothing(client, db, override):
    tour_id, departure, slug = make(db)
    response = client.post(f"{PUB}/bookings", data=confirm_form(departure, **override))
    assert response.status_code == 422 and count(db, "bookings") == 0


def test_confirming_a_departure_that_filled_up_is_refused_with_the_message(client, db):
    tour_id, departure, slug = make(db)
    db.execute("UPDATE departures SET seats = 2 WHERE id = %s", (departure,))
    add_booking(db, departure, adults=1, status="CONFIRMED")
    response = client.post(f"{PUB}/bookings", data=confirm_form(departure))
    assert response.status_code == 409 and core.Refusal.FULL.message in response.text and count(db, "bookings") == 1


@pytest.mark.parametrize("fields,refusal", [({"status": "CLOSED"}, core.Refusal.NOT_BOOKABLE),
                                             ({"status": "CANCELLED"}, core.Refusal.NOT_BOOKABLE),
                                             ({"starts_at": EARLIER}, core.Refusal.NOT_BOOKABLE)])
def test_confirming_a_closed_cancelled_or_past_departure_is_refused(client, db, fields, refusal):
    tour_id = add_tour(db)
    departure = add_departure(db, tour_id, **fields)
    response = client.post(f"{PUB}/bookings", data=confirm_form(departure))
    assert response.status_code == 409 and refusal.message in response.text and count(db, "bookings") == 0


def test_confirming_for_an_unpublished_or_foreign_tour_is_404(client, db):
    draft = add_departure(db, add_tour(db, status="DRAFT"))
    foreign = add_departure(db, add_tour(db, htx="LB"), htx="LB")
    for departure in (draft, foreign, "not-a-uuid"):
        assert client.post(f"{PUB}/bookings", data=confirm_form(departure)).status_code == 404
    assert count(db, "bookings") == 0


def test_auto_confirm_without_deposit_makes_a_confirmed_booking(client, db):
    add_settings(db, auto_confirm=True, deposit_percent=0)
    tour_id, departure, slug = make(db)
    client.post(f"{PUB}/bookings", data=confirm_form(departure))
    assert db.execute("SELECT status FROM bookings").fetchone()[0] == "CONFIRMED"


# ---------- my booking ----------

def test_booking_page_shows_state_trip_and_qr_while_money_is_due(client, db):
    add_settings(db, **BANK)
    tour_id, departure, slug = make(db, title="Hái chè buổi sáng")
    booking = book_through_core(db, departure, adults=2)  # total 500.000, deposit 150.000
    html = client.get(booking_url(booking, booked=1)).text
    assert booking.code in html and "Hái chè buổi sáng" in html and "Nhà văn hoá xóm Hồng Thái" in html
    assert "Đặt chỗ thành công" in html and "Chờ đặt cọc" in html
    assert "data:image/svg+xml" in html
    for text in ("150.000 ₫", "Agribank", "8600201001234", "HTX CHE TAN CUONG", f"TOUR {booking.code}", "Tôi đã chuyển khoản"):
        assert text in html, text
    assert "Vé vào tour" not in html


def test_booking_page_without_bank_shows_the_hotline_instead_of_a_qr(client, db):
    add_settings(db, hotline="0912 345 678", deposit_percent=30)
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure)
    html = client.get(booking_url(booking)).text
    assert "data:image/svg+xml" not in html and "Liên hệ HTX để thanh toán" in html and "0912 345 678" in html


def test_booking_page_has_no_qr_once_everything_is_paid_or_cancelled(client, db):
    add_settings(db, **BANK)
    tour_id, departure, slug = make(db)
    paid = book_through_core(db, departure, key="request-key-paid-1")
    core.record_payment(db, "TC", paid.id, 500_000, "TRANSFER", None, core.Actor("MANAGER", "Chị Lan"))
    cancelled = book_through_core(db, departure, key="request-key-cancel-1", phone="0912345679")
    core.cancel_booking(db, "TC", cancelled.id, "", GUEST)
    assert "data:image/svg+xml" not in client.get(booking_url(paid)).text
    html = client.get(booking_url(cancelled)).text
    assert "data:image/svg+xml" not in html and "Đã huỷ" in html and "Khách tự huỷ" in html


def test_booking_page_after_deposit_asks_for_the_rest(client, db):
    add_settings(db, **BANK)
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure)
    core.record_payment(db, "TC", booking.id, 150_000, "TRANSFER", None, core.Actor("MANAGER", "Chị Lan"))
    html = client.get(booking_url(booking)).text
    assert "350.000 ₫" in html and "data:image/svg+xml" in html and "Vé vào tour" in html


def test_ticket_link_and_page_only_when_confirmed(client, db):
    add_settings(db, **BANK)
    tour_id, departure, slug = make(db, title="Hái chè buổi sáng")
    booking = book_through_core(db, departure)
    assert "/ticket?" not in client.get(booking_url(booking)).text
    assert client.get(booking_url(booking, "/ticket")).status_code == 404
    core.confirm_booking(db, "TC", booking.id, core.Actor("MANAGER", "Chị Lan"))
    assert "/ticket?" in client.get(booking_url(booking)).text
    ticket = client.get(booking_url(booking, "/ticket"))
    assert ticket.status_code == 200 and booking.code in ticket.text and "Hái chè buổi sáng" in ticket.text
    assert "data:image/svg+xml" in ticket.text and "Nhà văn hoá xóm Hồng Thái" in ticket.text


def test_wrong_key_is_the_same_answer_as_an_unknown_code(client, db):
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure)
    wrong_key = client.get(f"{PUB}/booking?code={booking.code}&key=wrong")
    unknown = client.get(f"{PUB}/booking?code=ZZZZZZZZ&key=wrong")
    assert wrong_key.status_code == unknown.status_code == 404
    assert wrong_key.text == unknown.text and booking.guest_name not in wrong_key.text
    assert client.get(f"{PUB}/ticket?code={booking.code}&key=wrong").status_code == 404
    assert client.get(f"{PUB}/ticket?code={booking.code}").status_code == 404


def test_booking_of_another_cooperative_is_not_found(client, db):
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure)
    assert client.get(booking_url(booking).replace("/public/TC", "/public/LB")).status_code == 404


def test_booking_page_shows_no_phone_email_or_other_guests(client, db):
    tour_id, departure, slug = make(db)
    mine = book_through_core(db, departure, name="Lê Văn A", phone="0912345678", key="request-key-mine-01")
    other = book_through_core(db, departure, name="Phạm Thị Khác", phone="0987111222", key="request-key-other-1")
    html = client.get(booking_url(mine)).text
    assert "Lê Văn A" in html
    assert "Phạm Thị Khác" not in html and "0987111222" not in html and "0912345678" not in html


def test_booking_page_opens_after_the_tour_stopped_selling(client, db):
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure)
    db.execute("UPDATE tours SET status = 'ARCHIVED' WHERE id = %s", (tour_id,))
    response = client.get(booking_url(booking))
    assert response.status_code == 200 and booking.code in response.text


def test_booking_page_sweeps_an_expired_hold(client, db):
    add_settings(db, **BANK)
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure)
    db.execute("UPDATE bookings SET hold_until = now() - interval '1 hour' WHERE id = %s", (booking.id,))
    html = client.get(booking_url(booking)).text
    assert "Đã huỷ" in html and "Quá hạn giữ chỗ" in html


def test_booking_page_without_parameters_is_the_lookup_form(client, db):
    html = client.get(f"{PUB}/booking").text
    assert 'name="code"' in html and 'name="phone"' in html and "Tra cứu" in html


def test_lookup_with_right_code_and_phone_redirects_to_the_key_url(client, db):
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure, phone="0912345678")
    response = client.post(f"{PUB}/booking/lookup", data={"code": booking.code.lower(), "phone": "0912 345 678"})
    assert response.status_code == 303
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query == {"code": [booking.code], "key": [booking.access_key]}


def test_lookup_failures_all_show_one_message(client, db):
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure, phone="0912345678")
    cases = ({"code": booking.code, "phone": "0999999999"}, {"code": "ZZZZZZZZ", "phone": "0912345678"},
             {"code": booking.code, "phone": "abc"}, {"code": "", "phone": ""})
    responses = [client.post(f"{PUB}/booking/lookup", data=data) for data in cases]
    assert {r.status_code for r in responses} == {404}
    assert all("Không tìm thấy lượt đặt nào khớp mã và số điện thoại này." in r.text for r in responses)


def test_lookup_does_not_cross_cooperatives(client, db):
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure, phone="0912345678")
    assert client.post("/public/LB/booking/lookup", data={"code": booking.code, "phone": "0912345678"}).status_code == 404


# ---------- guest actions ----------

def guest_form(booking, **extra):
    return {"code": booking.code, "key": booking.access_key, **extra}


def test_report_paid_marks_the_booking_and_redirects(client, db):
    add_settings(db, **BANK)
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure)
    response = client.post(f"{PUB}/booking/paid", data=guest_form(booking))
    assert response.status_code == 303 and "/booking?" in response.headers["location"]
    assert db.execute("SELECT guest_paid_reported_at FROM bookings").fetchone()[0] is not None
    html = client.get(booking_url(booking)).text
    assert "Đã ghi nhận bạn đã chuyển khoản" in html and "Tôi đã chuyển khoản" not in html
    assert db.execute("SELECT status FROM bookings").fetchone()[0] == "PENDING"  # only the manager records money


def test_guest_actions_with_a_wrong_key_are_not_found_and_change_nothing(client, db):
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure)
    bad = {"code": booking.code, "key": "x" * 22}
    for path, extra in (("/booking/paid", {}), ("/booking/cancel", {}), ("/booking/review", {"rating": "5"})):
        assert client.post(f"{PUB}{path}", data={**bad, **extra}).status_code == 404, path
    assert db.execute("SELECT status, guest_paid_reported_at FROM bookings").fetchone() == ("PENDING", None)


def test_guest_can_cancel_in_time(client, db):
    add_settings(db, cancel_free_hours=24)
    tour_id, departure, slug = make(db)
    booking = book_through_core(db, departure)
    assert "Huỷ lượt đặt" in client.get(booking_url(booking)).text
    response = client.post(f"{PUB}/booking/cancel", data=guest_form(booking, reason="Bận việc"))
    assert response.status_code == 303
    row = db.execute("SELECT status, cancelled_by, cancel_reason FROM bookings").fetchone()
    assert row == ("CANCELLED", "GUEST", "Bận việc")


def test_guest_cancel_after_the_deadline_shows_hotline_instead_of_the_button(client, db):
    add_settings(db, cancel_free_hours=24, hotline="0912 345 678")
    tour_id = add_tour(db)
    departure = add_departure(db, tour_id, starts_at=NOW + timedelta(hours=10))
    booking = book_through_core(db, departure)
    html = client.get(booking_url(booking)).text
    assert 'action="/apps/tea-tour/public/TC/booking/cancel"' not in html and "0912 345 678" in html
    response = client.post(f"{PUB}/booking/cancel", data=guest_form(booking))
    assert response.status_code == 409 and core.Refusal.CANCEL_DEADLINE.message in response.text
    assert db.execute("SELECT status FROM bookings").fetchone()[0] == "PENDING"


def eligible_booking(db):
    tour_id = add_tour(db)
    departure = add_departure(db, tour_id, starts_at=NOW + timedelta(days=1))
    booking = book_through_core(db, departure, name="Lê Văn An", key="request-key-eligible")
    db.execute("UPDATE departures SET starts_at = %s WHERE id = %s", (EARLIER, departure))
    db.execute("UPDATE bookings SET status = 'CONFIRMED', checked_in_count = 2, checked_in_at = now() WHERE id = %s", (booking.id,))
    return booking


def test_review_form_only_for_a_checked_in_booking(client, db):
    tour_id, departure, slug = make(db)
    waiting = book_through_core(db, departure)
    assert 'name="rating"' not in client.get(booking_url(waiting)).text
    ready = eligible_booking(db)
    assert 'name="rating"' in client.get(booking_url(ready)).text


def test_guest_sends_a_review_that_waits_for_the_manager(client, db):
    ready = eligible_booking(db)
    response = client.post(f"{PUB}/booking/review", data=guest_form(ready, rating="5", comment="Rất vui", display_name=""))
    assert response.status_code == 303
    row = db.execute("SELECT rating, comment, display_name, status FROM reviews").fetchone()
    assert row == (5, "Rất vui", "An", "PENDING")
    html = client.get(booking_url(ready)).text
    assert 'name="rating"' not in html and "đang chờ HTX duyệt" in html


def test_review_with_invalid_rating_is_422_and_keeps_the_text(client, db):
    ready = eligible_booking(db)
    for rating in ("0", "6", "x", ""):
        response = client.post(f"{PUB}/booking/review", data=guest_form(ready, rating=rating, comment="Giữ lại nhé"))
        assert response.status_code == 422 and "Giữ lại nhé" in response.text, rating
    assert count(db, "reviews") == 0


def test_review_for_a_booking_that_did_not_go_is_refused(client, db):
    tour_id, departure, slug = make(db)
    waiting = book_through_core(db, departure)
    response = client.post(f"{PUB}/booking/review", data=guest_form(waiting, rating="5"))
    assert response.status_code == 409 and core.Refusal.NOT_ELIGIBLE.message in response.text and count(db, "reviews") == 0


def test_second_review_is_refused(client, db):
    ready = eligible_booking(db)
    client.post(f"{PUB}/booking/review", data=guest_form(ready, rating="5"))
    response = client.post(f"{PUB}/booking/review", data=guest_form(ready, rating="4"))
    assert response.status_code == 409 and core.Refusal.ALREADY_REVIEWED.message in response.text


# ---------- inquiry and policy ----------

def inquiry_form(**override):
    return {"name": "Cô giáo Lan", "phone": "0987 654 321", "group_size": "30", "desired_date": "2027-03-05",
            "message": "Đoàn học sinh lớp 5.", **override}


def test_inquiry_form_renders(client, db):
    html = client.get(f"{PUB}/inquiry").text
    for name in ("name", "phone", "group_size", "desired_date", "message"):
        assert f'name="{name}"' in html


def test_inquiry_is_saved_and_redirects_to_a_thank_you(client, db):
    response = client.post(f"{PUB}/inquiry", data=inquiry_form())
    assert response.status_code == 303 and response.headers["location"].endswith("/public/TC/inquiry?sent=1")
    row = db.execute("SELECT htx_code, name, phone, group_size, desired_date::text, message, status FROM inquiries").fetchone()
    assert row == ("TC", "Cô giáo Lan", "0987654321", 30, "2027-03-05", "Đoàn học sinh lớp 5.", "NEW")
    assert "Đã gửi yêu cầu" in client.get(f"{PUB}/inquiry?sent=1").text


@pytest.mark.parametrize("override,message", [({"name": ""}, "Vui lòng nhập họ tên"), ({"phone": "12"}, "Số điện thoại gồm 10 chữ số"),
                                              ({"group_size": "0"}, "Số người từ 1 đến 500"), ({"group_size": "501"}, "Số người từ 1 đến 500"),
                                              ({"desired_date": "05/03"}, "Ngày mong muốn không hợp lệ"),
                                              ({"message": "x" * 1001}, "tối đa 1000 ký tự")])
def test_inquiry_errors_are_422_with_values_kept(client, db, override, message):
    response = client.post(f"{PUB}/inquiry", data=inquiry_form(**override))
    assert response.status_code == 422 and message in response.text and count(db, "inquiries") == 0
    if override.get("name", "x"):
        assert "Cô giáo Lan" in response.text


def test_inquiry_belongs_to_the_cooperative_of_the_url(client, db):
    client.post("/public/LB/inquiry", data=inquiry_form())
    assert db.execute("SELECT htx_code FROM inquiries").fetchone()[0] == "LB"


def test_policy_page_shows_the_cooperative_rules(client, db):
    add_settings(db, policy_text="Huỷ trước 48 giờ được hoàn đủ.", deposit_percent=30, hold_hours=12, cancel_free_hours=48,
                 hotline="0912 345 678")
    html = client.get(f"{PUB}/policy").text
    assert "Huỷ trước 48 giờ được hoàn đủ." in html and "30%" in html and "12 giờ" in html and "48 giờ" in html


def test_policy_page_without_text_still_explains_the_defaults(client, db):
    html = client.get(f"{PUB}/policy").text
    assert "đặt cọc" in html.lower() and "huỷ" in html.lower()


def test_error_pages_of_the_site_are_styled_and_keep_the_referrer_meta(client, db):
    response = client.get(f"{PUB}/tours/does-not-exist")
    assert response.status_code == 404 and "Không có trang này" in response.text
    assert '<meta name="referrer" content="no-referrer">' in response.text and "site." in response.text
