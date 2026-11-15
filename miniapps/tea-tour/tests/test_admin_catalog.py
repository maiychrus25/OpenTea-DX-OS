# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Back office of the catalogue: tours, photos, departures, settings (spec 6, 7.7, 7.9)."""
import io
import re
from datetime import date, datetime, timedelta

import pytest
from factories import (LATER, NOW, add_booking, add_departure, add_media, add_settings, add_tour, add_tour_media, bearer,
                       sample_image)
from PIL import Image

from tea_tour import core_client
from tea_tour.domain import tour_templates
from tea_tour.domain.policy import VN_TZ

MANAGER = bearer()
OTHER = bearer(sub="kc-manager-lb", htx="LB", name="Quản trị LB")
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nông hộ Một")


def location(reply) -> str:
    assert reply.status_code == 303, reply.text[:300]
    return reply.headers["location"]


def tour_data(**over) -> dict:
    """A valid tour form, as a browser would post it."""
    data = {"title": "Chiều trên đồi chè", "summary": "Một buổi chiều.", "description": "Đi bộ trên đồi.",
            "category": "SIGHTSEEING", "duration_minutes": "150", "meeting_point": "Nhà văn hoá xóm Hồng Thái",
            "map_url": "https://maps.example/hong-thai", "price_adult_vnd": "200000", "price_child_vnd": "100000",
            "default_seats": "12"}
    return {**data, **over}


def row(db, sql, *params):
    return db.execute(sql, params).fetchone()


# ---------- tours: list ----------

def test_tour_pages_need_the_manager_role(client):
    for path in ("/tours", "/tours/new", "/departures", "/settings"):
        assert client.get(path).status_code == 401, path
        assert client.get(path, headers=FARMER).status_code == 403, path


def test_tour_list_shows_only_own_tours_and_filters_by_status(client, db):
    add_tour(db, title="Tour đang bán", status="PUBLISHED")
    add_tour(db, title="Tour nháp", status="DRAFT")
    add_tour(db, title="Tour ngừng bán", status="ARCHIVED")
    add_tour(db, htx="LB", title="Tour của HTX khác")
    page = client.get("/tours", headers=MANAGER).text
    assert "Tour đang bán" in page and "Tour nháp" in page and "Tour ngừng bán" in page
    assert "Tour của HTX khác" not in page
    draft = client.get("/tours?status=DRAFT", headers=MANAGER).text
    assert "Tour nháp" in draft and "Tour đang bán" not in draft
    assert "Tour đang bán" in client.get("/tours?status=nonsense", headers=MANAGER).text  # unknown filter = all


def test_tour_list_pages_by_25(client, db):
    for n in range(26):
        add_tour(db, title=f"Tour số {n:02d}")
    first = client.get("/tours", headers=MANAGER).text
    second = client.get("/tours?page=2", headers=MANAGER).text
    assert first.count('class="tour-row"') == 25 and second.count('class="tour-row"') == 1
    assert "Trang 2/2" in second


def test_tour_list_empty_state_offers_the_templates(client):
    page = client.get("/tours", headers=MANAGER).text
    assert "Chưa có tour nào" in page and "/tours/new" in page


def test_tour_list_shows_hostile_text_escaped(client, db):
    add_tour(db, title="<script>alert(1)</script> & \"quote\"")
    page = client.get("/tours", headers=MANAGER).text
    assert "<script>alert(1)" not in page and "&lt;script&gt;alert(1)&lt;/script&gt;" in page


# ---------- tours: create ----------

def test_new_tour_form_is_blank_and_offers_the_four_templates(client):
    page = client.get("/tours/new", headers=MANAGER).text
    for template in tour_templates.TEMPLATES.values():
        assert f"/tours/new?template={template.key}" in page
    assert 'name="title"' in page and 'value=""' in page


@pytest.mark.parametrize("key", sorted(tour_templates.TEMPLATES))
def test_new_tour_form_is_prefilled_from_a_template(client, key):
    template = tour_templates.TEMPLATES[key]
    page = client.get(f"/tours/new?template={key}", headers=MANAGER).text
    assert template.title in page and template.summary in page
    assert template.itinerary[0]["title"] in page and template.includes[0] in page and template.faq[0]["q"] in page
    assert f'value="{template.price_adult_vnd}"' in page and f'value="{template.default_seats}"' in page


def test_unknown_template_gives_the_blank_form(client):
    assert client.get("/tours/new?template=nope", headers=MANAGER).status_code == 200


def test_create_tour_stores_a_draft_and_redirects_to_it(client, db):
    reply = client.post("/tours", data=tour_data(), headers=MANAGER)
    tour = row(db, "SELECT id, status, slug, htx_code, title, price_child_vnd, category FROM tours")
    assert location(reply) == f"/apps/tea-tour/tours/{tour[0]}"
    assert tour[1:] == ("DRAFT", "chieu-tren-doi-che", "TC", "Chiều trên đồi chè", 100_000, "SIGHTSEEING")


def test_create_tour_keeps_the_theme_in_the_redirect(client):
    assert "theme=dark" in location(client.post("/tours?theme=dark", data=tour_data(), headers=MANAGER))


def test_slug_is_unique_within_the_cooperative_only(client, db):
    for _ in range(3):
        client.post("/tours", data=tour_data(), headers=MANAGER)
    client.post("/tours", data=tour_data(), headers=OTHER)
    slugs = [r[0] for r in db.execute("SELECT slug FROM tours WHERE htx_code = 'TC' ORDER BY slug").fetchall()]
    assert slugs == ["chieu-tren-doi-che", "chieu-tren-doi-che-2", "chieu-tren-doi-che-3"]
    assert row(db, "SELECT slug FROM tours WHERE htx_code = 'LB'")[0] == "chieu-tren-doi-che"


def test_rows_are_saved_as_lists_and_spare_rows_are_dropped(client, db):
    data = tour_data(itinerary_time=["07:00", "", "09:30"], itinerary_title=["Đón khách", "", "Hái chè"],
                     itinerary_detail=["Tại xóm", "", "Một tôm hai lá"], includes=["Nước uống", "", "Bảo hiểm"],
                     excludes=["Đồ ăn"], bring=["", "Mũ nón"], faq_q=["Có cho trẻ em không?", ""], faq_a=["Có.", ""])
    client.post("/tours", data=data, headers=MANAGER)
    t = row(db, "SELECT itinerary, includes, excludes, bring, faq FROM tours")
    assert t[0] == [{"time": "07:00", "title": "Đón khách", "detail": "Tại xóm"},
                    {"time": "09:30", "title": "Hái chè", "detail": "Một tôm hai lá"}]
    assert t[1:4] == (["Nước uống", "Bảo hiểm"], ["Đồ ăn"], ["Mũ nón"])
    assert t[4] == [{"q": "Có cho trẻ em không?", "a": "Có."}]


LIMIT_CASES = [
    ({"title": ""}, "Tên tour"), ({"title": "x" * 121}, "Tên tour"), ({"summary": "x" * 201}, "Tóm tắt"),
    ({"description": "x" * 4001}, "Mô tả"), ({"meeting_point": ""}, "Điểm hẹn"), ({"meeting_point": "x" * 201}, "Điểm hẹn"),
    ({"map_url": "http://x.example/map"}, "bản đồ"), ({"map_url": "https://" + "a" * 300}, "bản đồ"),
    ({"category": "WRONG"}, "loại tour"), ({"duration_minutes": "29"}, "Thời lượng"),
    ({"duration_minutes": "2881"}, "Thời lượng"), ({"duration_minutes": "abc"}, "Thời lượng"),
    ({"price_adult_vnd": "-1"}, "Giá người lớn"), ({"price_adult_vnd": "10000001"}, "Giá người lớn"),
    ({"price_child_vnd": "1.5"}, "Giá trẻ em"), ({"default_seats": "0"}, "Số chỗ mặc định"),
    ({"default_seats": "201"}, "Số chỗ mặc định"), ({"itinerary_title": ["a"] * 13}, "Lịch trình tối đa 12"),
    ({"itinerary_title": ["x" * 81]}, "Mỗi mục lịch trình"),
    ({"itinerary_title": ["Đón khách"], "itinerary_time": ["x" * 21]}, "Mỗi mục lịch trình"),
    ({"itinerary_title": ["Đón khách"], "itinerary_detail": ["x" * 301]}, "Mỗi mục lịch trình"),
    ({"includes": ["a"] * 11}, "Bao gồm"), ({"excludes": ["x" * 121]}, "Không bao gồm"),
    ({"bring": ["a"] * 11}, "Cần mang theo"), ({"faq_q": ["q"] * 9, "faq_a": ["a"] * 9}, "Hỏi đáp tối đa 8"),
    ({"faq_q": ["x" * 161], "faq_a": ["a"]}, "Mỗi mục hỏi đáp"), ({"faq_q": ["Hỏi?"], "faq_a": [""]}, "Mỗi mục hỏi đáp"),
]


@pytest.mark.parametrize(("override", "message"), LIMIT_CASES)
def test_every_field_limit_rerenders_the_form_with_422_and_writes_nothing(client, db, override, message):
    reply = client.post("/tours", data=tour_data(**override), headers=MANAGER)
    assert reply.status_code == 422 and message in reply.text
    assert row(db, "SELECT count(*) FROM tours")[0] == 0
    if "description" not in override:
        assert "Đi bộ trên đồi." in reply.text  # what was typed comes back


def test_a_failed_create_keeps_every_entered_value_and_row(client, db):
    data = tour_data(price_adult_vnd="abc", itinerary_title=["Đón khách", "Hái chè"], itinerary_time=["07:00", "08:00"],
                     includes=["Nước uống"], faq_q=["Hỏi gì?"], faq_a=["Đáp vậy."])
    page = client.post("/tours", data=data, headers=MANAGER).text
    for kept in ("Chiều trên đồi chè", "Một buổi chiều.", "Đón khách", "Hái chè", "07:00", "Nước uống", "Hỏi gì?", "Đáp vậy.",
                 'value="abc"'):
        assert kept in page, kept


def test_an_itinerary_row_without_a_title_is_refused(client, db):
    reply = client.post("/tours", data=tour_data(itinerary_time=["07:00"], itinerary_title=[""], itinerary_detail=["x"]),
                        headers=MANAGER)
    assert reply.status_code == 422 and row(db, "SELECT count(*) FROM tours")[0] == 0


def test_create_cannot_set_status_slug_or_cooperative(client, db):
    client.post("/tours", data=tour_data(status="PUBLISHED", slug="hack", htx_code="LB"), headers=MANAGER)
    assert row(db, "SELECT status, slug, htx_code FROM tours") == ("DRAFT", "chieu-tren-doi-che", "TC")


# ---------- tours: page, edit ----------

def test_tour_page_shows_the_tour_and_404s_for_other_cooperatives(client, db):
    tour = add_tour(db, title="Tour xem thử", itinerary=[{"time": "07:00", "title": "Đón khách", "detail": ""}])
    other = add_tour(db, htx="LB", title="Tour của LB")
    page = client.get(f"/tours/{tour}", headers=MANAGER).text
    assert "Tour xem thử" in page and f"/tours/{tour}/edit" in page
    assert client.get(f"/tours/{other}", headers=MANAGER).status_code == 404
    assert client.get(f"/tours/{other}/edit", headers=MANAGER).status_code == 404
    assert client.get("/tours/not-a-uuid", headers=MANAGER).status_code == 404


def test_edit_form_shows_stored_values_and_spare_rows(client, db):
    tour = add_tour(db, title="Tour sửa", includes=["Nước uống"], faq=[{"q": "Hỏi?", "a": "Đáp."}])
    page = client.get(f"/tours/{tour}/edit", headers=MANAGER).text
    assert 'value="Tour sửa"' in page and "Nước uống" in page and "Hỏi?" in page
    assert page.count('name="includes"') == 4  # one stored line and three spare rows


def test_edit_saves_everything_and_keeps_the_slug(client, db):
    tour = add_tour(db, title="Tên cũ", slug="ten-cu")
    data = tour_data(title="Tên mới hoàn toàn", includes=["Trà"], itinerary_title=["Điểm một"])
    assert location(client.post(f"/tours/{tour}", data=data, headers=MANAGER)) == f"/apps/tea-tour/tours/{tour}"
    t = row(db, "SELECT title, slug, includes, itinerary, status, updated_at > created_at FROM tours WHERE id = %s", tour)
    assert t[:3] == ("Tên mới hoàn toàn", "ten-cu", ["Trà"]) and t[3][0]["title"] == "Điểm một"
    assert t[4:] == ("PUBLISHED", True)  # editing never changes the status


def test_edit_with_an_error_is_422_and_changes_nothing(client, db):
    tour = add_tour(db, title="Giữ nguyên")
    reply = client.post(f"/tours/{tour}", data=tour_data(default_seats="0"), headers=MANAGER)
    assert reply.status_code == 422 and "Số chỗ mặc định" in reply.text
    assert row(db, "SELECT title FROM tours WHERE id = %s", tour)[0] == "Giữ nguyên"


def test_edit_of_another_cooperatives_tour_is_404_and_changes_nothing(client, db):
    other = add_tour(db, htx="LB", title="Của LB")
    assert client.post(f"/tours/{other}", data=tour_data(), headers=MANAGER).status_code == 404
    assert row(db, "SELECT title FROM tours WHERE id = %s", other)[0] == "Của LB"


# ---------- tours: publish, unpublish, archive ----------

def test_publish_is_one_click(client, db):
    tour = add_tour(db, status="DRAFT")
    assert location(client.post(f"/tours/{tour}/status", data={"status": "PUBLISHED"}, headers=MANAGER)) == f"/apps/tea-tour/tours/{tour}"
    assert row(db, "SELECT status FROM tours WHERE id = %s", tour)[0] == "PUBLISHED"


@pytest.mark.parametrize("target", ["DRAFT", "ARCHIVED"])
def test_leaving_published_asks_first_and_names_the_departures_that_keep_running(client, db, target):
    tour = add_tour(db, status="PUBLISHED")
    busy = add_departure(db, tour, starts_at=LATER)
    add_booking(db, busy, status="CONFIRMED")
    add_departure(db, tour, starts_at=LATER + timedelta(days=1))  # empty: not counted
    reply = client.post(f"/tours/{tour}/status", data={"status": target}, headers=MANAGER)
    assert reply.status_code == 200 and "1 chuyến sắp tới" in reply.text and 'name="confirm"' in reply.text
    assert row(db, "SELECT status FROM tours WHERE id = %s", tour)[0] == "PUBLISHED"
    reply = client.post(f"/tours/{tour}/status", data={"status": target, "confirm": "1"}, headers=MANAGER)
    assert location(reply) == f"/apps/tea-tour/tours/{tour}"
    assert row(db, "SELECT status FROM tours WHERE id = %s", tour)[0] == target
    assert row(db, "SELECT status FROM departures WHERE id = %s", busy)[0] == "OPEN"  # the departures keep running


def test_archived_tour_can_go_back_to_draft_without_asking(client, db):
    tour = add_tour(db, status="ARCHIVED")
    client.post(f"/tours/{tour}/status", data={"status": "DRAFT"}, headers=MANAGER)
    assert row(db, "SELECT status FROM tours WHERE id = %s", tour)[0] == "DRAFT"


def test_unknown_status_and_other_cooperatives_are_refused(client, db):
    tour = add_tour(db)
    other = add_tour(db, htx="LB")
    assert client.post(f"/tours/{tour}/status", data={"status": "BOGUS", "confirm": "1"}, headers=MANAGER).status_code == 422
    assert client.post(f"/tours/{other}/status", data={"status": "ARCHIVED", "confirm": "1"}, headers=MANAGER).status_code == 404
    assert row(db, "SELECT status FROM tours WHERE id = %s", other)[0] == "PUBLISHED"


# ---------- photos ----------

def image_bytes(fmt="JPEG", size=(320, 240)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, (30, 120, 70)).save(out, fmt)
    return out.getvalue()


def upload(client, tour, data: bytes | None, name="a.jpg", headers=MANAGER, kind="image/jpeg"):
    files = {"photo": (name, data, kind)} if data is not None else {}
    return client.post(f"/tours/{tour}/photos", files=files or {"other": ("x", b"x")}, headers=headers)


def gallery(db, tour) -> list:
    return [r[0] for r in db.execute("SELECT media_id FROM tour_media WHERE tour_id = %s ORDER BY position", (tour,)).fetchall()]


def test_upload_stores_a_photo_and_the_first_one_becomes_the_cover(client, db):
    tour = add_tour(db)
    assert location(upload(client, tour, image_bytes())) == f"/apps/tea-tour/tours/{tour}"
    first = gallery(db, tour)
    assert len(first) == 1 and row(db, "SELECT cover_media_id FROM tours WHERE id = %s", tour)[0] == first[0]
    upload(client, tour, image_bytes("PNG"), "b.png", kind="image/png")
    assert len(gallery(db, tour)) == 2 and row(db, "SELECT cover_media_id FROM tours WHERE id = %s", tour)[0] == first[0]


def test_tour_page_shows_the_gallery_through_the_protected_media_route_and_states_the_limits(client, db):
    tour = add_tour(db)
    photo = add_tour_media(db, tour, add_media(db), 0)
    page = client.get(f"/tours/{tour}", headers=MANAGER).text
    assert f"/apps/tea-tour/media/{photo}-thumb.jpg" in page
    assert "JPEG tối đa 16 triệu điểm ảnh; PNG và WebP tối đa 6 triệu điểm ảnh" in page and "5 MB" in page
    assert 'enctype="multipart/form-data"' in page and 'name="photo"' in page


def test_upload_refusals_show_the_message_and_store_nothing(client, db):
    tour = add_tour(db)
    big_png = image_bytes("PNG", (3000, 2100))  # 6.3 million pixels, a few KB: only PNG and WebP are held to 6 million
    cases = [(b"not an image at all", "Tệp này không phải ảnh"), (big_png, "PNG và WebP tối đa 6 triệu điểm ảnh"),
             (b"\0" * (5 * 1024 * 1024 + 1), "Tệp ảnh tối đa 5 MB"), (b"", "Hãy chọn một ảnh")]
    for data, message in cases:
        reply = upload(client, tour, data)
        assert reply.status_code == 422 and message in reply.text, message
    assert upload(client, tour, None).status_code == 422
    assert row(db, "SELECT count(*) FROM media")[0] == 0


def test_a_jpeg_above_6_megapixels_but_below_16_is_accepted(client, db):
    tour = add_tour(db)
    assert location(upload(client, tour, image_bytes("JPEG", (3200, 2400)))).endswith(f"/tours/{tour}")  # 7.7 MP


def test_the_thirteenth_photo_is_refused(client, db):
    tour = add_tour(db)
    for position in range(12):
        add_tour_media(db, tour, add_media(db), position)
    reply = upload(client, tour, image_bytes())
    assert reply.status_code == 409 and "tối đa 12 ảnh" in reply.text
    assert len(gallery(db, tour)) == 12


def test_upload_to_another_cooperatives_tour_is_404(client, db):
    other = add_tour(db, htx="LB")
    assert upload(client, other, image_bytes()).status_code == 404
    assert row(db, "SELECT count(*) FROM media")[0] == 0


def photo_action(client, tour, media_id, action, headers=MANAGER):
    return client.post(f"/tours/{tour}/photos/{media_id}/{action}", headers=headers)


def three_photos(db):
    tour = add_tour(db)
    return tour, [add_tour_media(db, tour, add_media(db), n) for n in range(3)]


def test_cover_up_down_and_remove(client, db):
    tour, (a, b, c) = three_photos(db)
    db.execute("UPDATE tours SET cover_media_id = %s WHERE id = %s", (a, tour))
    assert location(photo_action(client, tour, c, "cover")).endswith(f"/tours/{tour}")
    assert row(db, "SELECT cover_media_id FROM tours WHERE id = %s", tour)[0] == c
    photo_action(client, tour, c, "up")
    assert gallery(db, tour) == [a, c, b]
    photo_action(client, tour, a, "down")
    assert gallery(db, tour) == [c, a, b]
    photo_action(client, tour, c, "up")  # already first: nothing moves, still a redirect
    assert gallery(db, tour) == [c, a, b]
    photo_action(client, tour, c, "remove")  # the cover goes: the next photo takes over
    assert gallery(db, tour) == [a, b] and row(db, "SELECT cover_media_id FROM tours WHERE id = %s", tour)[0] == a
    assert row(db, "SELECT count(*) FROM media WHERE id = %s", c)[0] == 0


def test_photo_actions_refuse_foreign_photos_and_unknown_actions(client, db):
    tour, (a, _, _) = three_photos(db)
    other_tour = add_tour(db, htx="LB")
    foreign = add_tour_media(db, other_tour, add_media(db, htx="LB"), 0, htx="LB")
    assert photo_action(client, tour, foreign, "remove").status_code == 404
    assert photo_action(client, other_tour, foreign, "remove").status_code == 404
    assert photo_action(client, tour, a, "explode").status_code == 404
    assert photo_action(client, tour, "00000000-0000-0000-0000-000000000000", "cover").status_code == 404
    assert row(db, "SELECT count(*) FROM media")[0] == 4


def test_the_media_route_serves_the_thumbnail_the_page_links_to(client, db):
    tour = add_tour(db, status="DRAFT")  # an unpublished tour's photo is visible to its own manager
    photo = add_tour_media(db, tour, add_media(db), 0)
    assert client.get(f"/media/{photo}-thumb.jpg", headers=MANAGER).headers["content-type"] == "image/jpeg"
    assert client.get(f"/media/{photo}-thumb.jpg", headers=OTHER).status_code == 404


# ---------- departures ----------

TODAY = datetime.now(VN_TZ).date()
HOUSEHOLDS = [core_client.Household("h-ba", "Hộ ông Ba", "kc-farmer-1"), core_client.Household("h-tu", "Hộ bà Tư", "kc-farmer-2"),
              core_client.Household("h-moi", "Hộ chưa có tài khoản", None)]


@pytest.fixture
def households(monkeypatch):
    monkeypatch.setattr(core_client, "list_households", lambda authorization: HOUSEHOLDS)


@pytest.fixture
def core_down(monkeypatch):
    def fail(authorization):
        raise core_client.CoreError("down")
    monkeypatch.setattr(core_client, "list_households", fail)


def vn(day: date, clock: str = "07:30") -> datetime:
    hour, minute = map(int, clock.split(":"))
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=VN_TZ)


def departure_data(tour_id, **over) -> dict:
    day = TODAY + timedelta(days=10)
    return {"tour": str(tour_id), "date": day.isoformat(), "time": "07:30", "seats": "", "price_adult_vnd": "",
            "price_child_vnd": "", "guide": "", **over}


def test_departure_list_shows_own_upcoming_departures_and_filters(client, db, households):
    tour = add_tour(db, title="Tour A")
    other_tour = add_tour(db, title="Tour B")
    add_departure(db, tour, starts_at=NOW + timedelta(days=2), guide_name="Hộ ông Ba")
    add_departure(db, other_tour, starts_at=NOW + timedelta(days=3))
    add_departure(db, tour, starts_at=NOW - timedelta(days=2))
    add_departure(db, tour, starts_at=NOW + timedelta(days=4), status="CANCELLED", cancel_reason="Mưa lớn")
    add_departure(db, add_tour(db, htx="LB", title="Tour LB"), htx="LB", starts_at=NOW + timedelta(days=2))
    upcoming = client.get("/departures", headers=MANAGER).text
    assert upcoming.count('class="departure-row"') == 2 and "Tour LB" not in upcoming and "Hộ ông Ba" in upcoming
    assert client.get("/departures?show=past", headers=MANAGER).text.count('class="departure-row"') == 1
    assert client.get("/departures?show=cancelled", headers=MANAGER).text.count('class="departure-row"') == 1
    assert client.get("/departures?show=all", headers=MANAGER).text.count('class="departure-row"') == 4
    only = client.get(f"/departures?tour={other_tour}", headers=MANAGER).text
    assert only.count('class="departure-row"') == 1
    assert client.get("/departures?tour=not-a-uuid&show=bogus", headers=MANAGER).status_code == 200


def test_departure_list_pages_by_25_and_shows_seats_from_the_load_view(client, db, households):
    tour = add_tour(db)
    first = add_departure(db, tour, starts_at=NOW + timedelta(days=1), seats=10)
    add_booking(db, first, adults=2, children=1, status="CONFIRMED")
    add_booking(db, first, adults=4, status="PENDING", deposit_vnd=50_000, hold_until=NOW - timedelta(hours=1))  # expired: holds nothing
    for n in range(2, 27):
        add_departure(db, tour, starts_at=NOW + timedelta(days=n))
    page = client.get("/departures", headers=MANAGER).text
    assert page.count('class="departure-row"') == 25 and "3/10" in page and "Trang 1/2" in page
    assert client.get("/departures?page=2", headers=MANAGER).text.count('class="departure-row"') == 1


def test_departure_list_empty_state(client, households):
    assert "Chưa có chuyến nào" in client.get("/departures", headers=MANAGER).text


def test_calendar_shows_the_month_with_departures_on_their_vietnam_day(client, db, households):
    tour = add_tour(db, title="Tour lịch")
    add_departure(db, tour, starts_at=datetime(2031, 5, 17, 0, 30, tzinfo=VN_TZ), seats=8)  # 17:30 UTC on the 16th
    add_departure(db, tour, starts_at=datetime(2031, 6, 2, 9, 0, tzinfo=VN_TZ))
    page = client.get("/departures?view=calendar&month=2031-05", headers=MANAGER).text
    assert "Tháng 5/2031" in page and page.count('class="cal-chip') == 1 and "00:30" in page and "Tour lịch" in page
    assert page.count('class="cal-day') >= 35 and "month=2031-04" in page and "month=2031-06" in page
    for weekday in ("T2", "T3", "T4", "T5", "T6", "T7", "CN"):
        assert f">{weekday}<" in page
    assert client.get("/departures?view=calendar&month=2031-06", headers=MANAGER).text.count('class="cal-chip') == 1
    this_month = client.get("/departures?view=calendar&month=garbage", headers=MANAGER).text
    assert f"Tháng {TODAY.month}/{TODAY.year}" in this_month


def test_calendar_marks_cancelled_and_filters_by_tour(client, db, households):
    a, b = add_tour(db, title="Tour một"), add_tour(db, title="Tour hai")
    day = datetime(2031, 5, 10, 8, 0, tzinfo=VN_TZ)
    add_departure(db, a, starts_at=day, status="CANCELLED", cancel_reason="Mưa")
    add_departure(db, b, starts_at=day)
    page = client.get(f"/departures?view=calendar&month=2031-05&tour={a}", headers=MANAGER).text
    assert page.count('class="cal-chip') == 1 and 'class="cal-chip cancelled' in page


def test_create_one_departure_copies_the_tour_defaults(client, db, households):
    tour = add_tour(db, price_adult_vnd=300_000, price_child_vnd=120_000, default_seats=14)
    reply = client.post("/departures", data=departure_data(tour), headers=MANAGER)
    d = row(db, "SELECT id, starts_at, seats, price_adult_vnd, price_child_vnd, status, guide_user_id, htx_code FROM departures")
    assert location(reply) == f"/apps/tea-tour/departures/{d[0]}"
    assert d[1] == vn(TODAY + timedelta(days=10)) and d[2:] == (14, 300_000, 120_000, "OPEN", None, "TC")


def test_create_one_departure_with_own_values_and_a_guide(client, db, households):
    tour = add_tour(db)
    client.post("/departures", data=departure_data(tour, seats="6", price_adult_vnd="0", price_child_vnd="50000", guide="h-tu"),
                headers=MANAGER)
    assert row(db, "SELECT seats, price_adult_vnd, price_child_vnd, guide_user_id, guide_name FROM departures") == \
        (6, 0, 50_000, "kc-farmer-2", "Hộ bà Tư")


DEPARTURE_ERRORS = [({"date": "2031-02-30"}, "Ngày khởi hành"), ({"date": ""}, "Ngày khởi hành"), ({"time": "25:00"}, "Giờ khởi hành"),
                    ({"time": "7h30"}, "Giờ khởi hành"), ({"date": "2000-01-01"}, "tương lai"), ({"seats": "0"}, "Số chỗ"),
                    ({"seats": "201"}, "Số chỗ"), ({"price_adult_vnd": "-5"}, "Giá người lớn"), ({"price_child_vnd": "x"}, "Giá trẻ em"),
                    ({"tour": "nope"}, "Hãy chọn tour"), ({"guide": "h-khong-co"}, "người dẫn"), ({"guide": "h-moi"}, "chưa có tài khoản")]


@pytest.mark.parametrize(("override", "message"), DEPARTURE_ERRORS)
def test_create_one_departure_errors_rerender_with_422_and_values_kept(client, db, households, override, message):
    tour = add_tour(db)
    reply = client.post("/departures", data=departure_data(tour, **{"seats": "9", **override}), headers=MANAGER)
    assert reply.status_code == 422 and message in reply.text
    assert row(db, "SELECT count(*) FROM departures")[0] == 0
    assert 'value="9"' in reply.text or "seats" in override


def test_a_departure_needs_a_tour_of_this_cooperative_that_is_not_archived(client, db, households):
    archived = add_tour(db, status="ARCHIVED")
    foreign = add_tour(db, htx="LB")
    for tour in (archived, foreign):
        assert client.post("/departures", data=departure_data(tour), headers=MANAGER).status_code == 422
    assert row(db, "SELECT count(*) FROM departures")[0] == 0
    draft = add_tour(db, status="DRAFT")
    assert client.post("/departures", data=departure_data(draft), headers=MANAGER).status_code == 303  # prepare ahead


def test_core_down_the_list_still_shows_and_the_form_reports_it(client, db, core_down):
    tour = add_tour(db)
    page = client.get("/departures", headers=MANAGER)
    assert page.status_code == 200 and "danh sách nông hộ" in page.text
    assert client.post("/departures", data=departure_data(tour), headers=MANAGER).status_code == 303  # no guide asked: fine
    refused = client.post("/departures", data=departure_data(tour, guide="h-ba"), headers=MANAGER)
    assert refused.status_code == 422 and "danh sách nông hộ" in refused.text
    assert row(db, "SELECT count(*) FROM departures")[0] == 1


def bulk_data(tour_id, **over) -> dict:
    return {"tour": str(tour_id), "weekdays": ["0", "1", "2", "3", "4", "5", "6"], "time": "07:30",
            "first": (TODAY + timedelta(days=1)).isoformat(), "last": (TODAY + timedelta(days=14)).isoformat(),
            "seats": "", "price_adult_vnd": "", "price_child_vnd": "", "guide": "", **over}


def test_bulk_creates_one_departure_per_chosen_weekday_at_the_given_vietnam_time(client, db, households):
    tour = add_tour(db, default_seats=11)
    first, last = TODAY + timedelta(days=1), TODAY + timedelta(days=28)
    reply = client.post("/departures/bulk", data=bulk_data(tour, weekdays=["5", "6"], first=first.isoformat(), last=last.isoformat()),
                        headers=MANAGER)
    weekend = [first + timedelta(days=n) for n in range(28) if (first + timedelta(days=n)).weekday() in (5, 6)]
    assert f"created={len(weekend)}" in location(reply)
    starts = [r[0] for r in db.execute("SELECT starts_at FROM departures ORDER BY starts_at").fetchall()]
    assert starts == [vn(day) for day in weekend]
    assert row(db, "SELECT DISTINCT seats FROM departures") == (11,)


def test_bulk_skips_days_with_a_departure_at_that_time_and_past_times(client, db, households):
    tour = add_tour(db)
    tomorrow = TODAY + timedelta(days=1)
    add_departure(db, tour, starts_at=vn(tomorrow))  # same day and time: skipped
    add_departure(db, tour, starts_at=vn(tomorrow + timedelta(days=1)), status="CANCELLED", cancel_reason="Mưa")  # cancelled: no block
    add_departure(db, tour, starts_at=vn(tomorrow + timedelta(days=2), "09:00"))  # other time: no block
    reply = client.post("/departures/bulk", data=bulk_data(tour, first=(TODAY - timedelta(days=3)).isoformat(),
                                                          last=(tomorrow + timedelta(days=2)).isoformat()), headers=MANAGER)
    created = int(re.search(r"created=(\d+)", location(reply))[1])
    assert "taken=1" in location(reply)
    assert row(db, "SELECT count(*) FROM departures")[0] == 3 + created
    assert row(db, "SELECT count(*) FROM departures WHERE starts_at < now() AND status = 'OPEN'")[0] == 0


def test_bulk_above_60_creates_nothing(client, db, households):
    tour = add_tour(db)
    first = TODAY + timedelta(days=1)
    reply = client.post("/departures/bulk", data=bulk_data(tour, first=first.isoformat(), last=(first + timedelta(days=60)).isoformat()),
                        headers=MANAGER)  # 61 days, every weekday
    assert reply.status_code == 422 and "61 chuyến" in reply.text and "60" in reply.text
    assert row(db, "SELECT count(*) FROM departures")[0] == 0
    ok = client.post("/departures/bulk", data=bulk_data(tour, first=first.isoformat(), last=(first + timedelta(days=59)).isoformat()),
                     headers=MANAGER)  # exactly 60 is fine
    assert ok.status_code == 303 and row(db, "SELECT count(*) FROM departures")[0] == 60


BULK_ERRORS = [({"weekdays": []}, "ít nhất một thứ"), ({"weekdays": ["9"]}, "ít nhất một thứ"), ({"time": "99:99"}, "Giờ khởi hành"),
               ({"first": "x"}, "Ngày đầu"), ({"last": ""}, "Ngày cuối"), ({"last": (TODAY - timedelta(days=5)).isoformat()}, "sau ngày đầu"),
               ({"last": (TODAY + timedelta(days=1 + 181)).isoformat()}, "180 ngày"), ({"seats": "0"}, "Số chỗ"),
               ({"tour": "nope"}, "Hãy chọn tour"), ({"guide": "h-moi"}, "chưa có tài khoản")]


@pytest.mark.parametrize(("override", "message"), BULK_ERRORS)
def test_bulk_validation_errors_are_422_and_create_nothing(client, db, households, override, message):
    tour = add_tour(db)
    reply = client.post("/departures/bulk", data=bulk_data(tour, **override), headers=MANAGER)
    assert reply.status_code == 422 and message in reply.text
    assert row(db, "SELECT count(*) FROM departures")[0] == 0


def test_bulk_span_of_exactly_180_days_is_allowed(client, db, households):
    tour = add_tour(db)
    first = TODAY + timedelta(days=1)
    reply = client.post("/departures/bulk", data=bulk_data(tour, weekdays=["0"], first=first.isoformat(),
                                                         last=(first + timedelta(days=180)).isoformat()), headers=MANAGER)
    assert reply.status_code == 303


def test_bulk_with_nothing_to_create_says_so(client, db, households):
    tour = add_tour(db)
    day = TODAY + timedelta(days=3)
    add_departure(db, tour, starts_at=vn(day))
    reply = client.post("/departures/bulk", data=bulk_data(tour, first=day.isoformat(), last=day.isoformat()), headers=MANAGER)
    assert reply.status_code == 422 and "Không có ngày nào để tạo" in reply.text


def test_the_list_after_a_bulk_creation_reports_it(client, db, households):
    page = client.get("/departures?created=12&taken=2&past=1", headers=MANAGER).text
    assert "Đã tạo 12 chuyến" in page and "2 ngày đã có chuyến" in page and "1 ngày đã qua" in page


# ---------- one departure ----------

def guests_departure(db, **over):
    tour = add_tour(db, title="Tour có khách", duration_minutes=180)
    departure = add_departure(db, tour, seats=10, guide_user_id="kc-farmer-1", guide_name="Hộ ông Ba", **over)
    return tour, departure


def test_departure_page_shows_the_guests_and_the_seat_numbers(client, db, households):
    _, departure = guests_departure(db)
    confirmed = add_booking(db, departure, adults=2, children=1, status="CONFIRMED", guest_name="Chị Lan", phone="0911111111",
                            code="LANDKMT2", total_vnd=650_000, paid_vnd=200_000)
    add_booking(db, departure, adults=1, status="PENDING", guest_name="Anh Minh", code="MNHKPQR3")
    add_booking(db, departure, adults=3, status="CANCELLED", guest_name="Khách đã huỷ", code="HUYKMN23")
    page = client.get(f"/departures/{departure}", headers=MANAGER).text
    assert "Chị Lan" in page and "0911111111" in page and "LANDKMT2" in page and "Anh Minh" in page
    assert f"/apps/tea-tour/bookings/{confirmed}" in page  # the booking page belongs to the sales area
    assert "4/10" in page and "Hộ ông Ba" in page and "Khách đã huỷ" in page
    assert "Đã trả một phần" in page and "export.csv" in page and "/print" in page


def test_departure_page_escapes_hostile_guest_text(client, db, households):
    _, departure = guests_departure(db)
    add_booking(db, departure, status="CONFIRMED", guest_name="<img src=x onerror=alert(1)>", note="<b>ghi chú</b>")
    page = client.get(f"/departures/{departure}", headers=MANAGER).text
    assert "<img src=x" not in page and "&lt;img src=x onerror=alert(1)&gt;" in page


def test_other_cooperatives_departures_are_404_everywhere(client, db, households):
    other = add_departure(db, add_tour(db, htx="LB"), htx="LB")
    for method, path in (("get", ""), ("get", "/print"), ("get", "/guests/export.csv"), ("post", ""), ("post", "/status"),
                         ("post", "/checkin")):
        assert getattr(client, method)(f"/departures/{other}{path}", headers=MANAGER).status_code == 404, path
    assert client.get("/departures/not-a-uuid", headers=MANAGER).status_code == 404


def edit_data(**over) -> dict:
    return {"seats": "10", "price_adult_vnd": "250000", "price_child_vnd": "150000", "guide": "keep", **over}


def test_edit_changes_seats_prices_and_guide_but_not_existing_bookings(client, db, households):
    _, departure = guests_departure(db)
    booking = add_booking(db, departure, adults=2, status="CONFIRMED")
    reply = client.post(f"/departures/{departure}", data=edit_data(seats="20", price_adult_vnd="300000", guide="h-tu"), headers=MANAGER)
    assert location(reply) == f"/apps/tea-tour/departures/{departure}"
    assert row(db, "SELECT seats, price_adult_vnd, guide_user_id, guide_name FROM departures WHERE id = %s", departure) == \
        (20, 300_000, "kc-farmer-2", "Hộ bà Tư")
    assert row(db, "SELECT price_adult_vnd, total_vnd FROM bookings WHERE id = %s", booking) == (250_000, 500_000)


def test_edit_keeps_or_clears_the_guide(client, db, households):
    _, departure = guests_departure(db)
    client.post(f"/departures/{departure}", data=edit_data(guide="keep"), headers=MANAGER)
    assert row(db, "SELECT guide_user_id FROM departures WHERE id = %s", departure)[0] == "kc-farmer-1"
    client.post(f"/departures/{departure}", data=edit_data(guide=""), headers=MANAGER)
    assert row(db, "SELECT guide_user_id, guide_name FROM departures WHERE id = %s", departure) == (None, None)


def test_edit_with_the_core_down_keeps_the_guide(client, db, core_down):
    _, departure = guests_departure(db)
    page = client.get(f"/departures/{departure}", headers=MANAGER)
    assert page.status_code == 200 and "danh sách nông hộ" in page.text and "Hộ ông Ba" in page.text
    data = edit_data(seats="12")
    del data["guide"]  # the select is not drawn when the core does not answer
    assert client.post(f"/departures/{departure}", data=data, headers=MANAGER).status_code == 303
    assert row(db, "SELECT seats, guide_user_id FROM departures WHERE id = %s", departure) == (12, "kc-farmer-1")
    assert client.post(f"/departures/{departure}", data=edit_data(guide="h-tu"), headers=MANAGER).status_code == 422


def test_seats_cannot_go_below_the_seats_held(client, db, households):
    _, departure = guests_departure(db)
    add_booking(db, departure, adults=4, status="CONFIRMED")
    reply = client.post(f"/departures/{departure}", data=edit_data(seats="3", price_adult_vnd="1"), headers=MANAGER)
    assert reply.status_code == 409 and "ít hơn số chỗ khách đã giữ" in reply.text
    assert row(db, "SELECT seats, price_adult_vnd FROM departures WHERE id = %s", departure) == (10, 250_000)  # nothing applied


@pytest.mark.parametrize(("override", "message"), [({"seats": "0"}, "Số chỗ"), ({"seats": "abc"}, "Số chỗ"), ({"price_adult_vnd": "-1"}, "Giá người lớn"),
                                                   ({"price_child_vnd": ""}, "Giá trẻ em"), ({"guide": "h-moi"}, "chưa có tài khoản")])
def test_edit_validation_errors_are_422_with_values_kept(client, db, households, override, message):
    _, departure = guests_departure(db)
    reply = client.post(f"/departures/{departure}", data=edit_data(**override), headers=MANAGER)
    assert reply.status_code == 422 and message in reply.text
    assert row(db, "SELECT seats FROM departures WHERE id = %s", departure)[0] == 10


def post_status(client, departure, **data):
    return client.post(f"/departures/{departure}/status", data=data, headers=MANAGER)


def test_close_and_reopen(client, db, households):
    _, departure = guests_departure(db)
    assert location(post_status(client, departure, status="CLOSED")) == f"/apps/tea-tour/departures/{departure}"
    assert row(db, "SELECT status FROM departures WHERE id = %s", departure)[0] == "CLOSED"
    post_status(client, departure, status="CLOSED")  # again: still fine
    post_status(client, departure, status="OPEN")
    assert row(db, "SELECT status FROM departures WHERE id = %s", departure)[0] == "OPEN"
    assert post_status(client, departure, status="BOGUS").status_code == 422


def test_a_started_departure_cannot_be_reopened(client, db, households):
    _, departure = guests_departure(db, starts_at=NOW - timedelta(hours=1), status="CLOSED")
    assert post_status(client, departure, status="OPEN").status_code == 409
    assert row(db, "SELECT status FROM departures WHERE id = %s", departure)[0] == "CLOSED"


def test_cancel_asks_first_and_says_how_many_bookings_it_cancels(client, db, households):
    _, departure = guests_departure(db)
    add_booking(db, departure, adults=2, status="CONFIRMED")
    add_booking(db, departure, adults=1, status="PENDING")
    add_booking(db, departure, adults=5, status="CANCELLED")
    reply = post_status(client, departure, status="CANCELLED")
    assert reply.status_code == 200 and "2 lượt đặt" in reply.text and "3 khách" in reply.text and 'name="reason"' in reply.text
    assert row(db, "SELECT status FROM departures WHERE id = %s", departure)[0] == "OPEN"


def test_cancel_with_a_reason_cancels_the_departure_and_its_bookings_through_the_core(client, db, households):
    _, departure = guests_departure(db)
    confirmed = add_booking(db, departure, adults=2, status="CONFIRMED")
    reply = post_status(client, departure, status="CANCELLED", confirm="1", reason="Mưa lớn, đường sạt lở")
    assert "cancelled=1" in location(reply)
    assert row(db, "SELECT status, cancel_reason FROM departures WHERE id = %s", departure) == ("CANCELLED", "Mưa lớn, đường sạt lở")
    assert row(db, "SELECT status, cancelled_by FROM bookings WHERE id = %s", confirmed) == ("CANCELLED", "MANAGER")
    assert row(db, "SELECT count(*) FROM booking_events WHERE booking_id = %s AND kind = 'CANCELLED'", confirmed)[0] == 1
    assert "Mưa lớn, đường sạt lở" in client.get(f"/departures/{departure}", headers=MANAGER).text


def test_cancel_needs_a_reason_and_a_future_departure(client, db, households):
    _, departure = guests_departure(db)
    reply = post_status(client, departure, status="CANCELLED", confirm="1", reason="   ")
    assert reply.status_code == 422 and "Cần ghi lý do" in reply.text
    assert row(db, "SELECT status FROM departures WHERE id = %s", departure)[0] == "OPEN"
    _, started = guests_departure(db, starts_at=NOW - timedelta(hours=1))
    assert post_status(client, started, status="CANCELLED", confirm="1", reason="Muộn rồi").status_code == 409


def test_a_cancelled_departure_cannot_be_reopened_or_edited(client, db, households):
    _, departure = guests_departure(db, status="CANCELLED", cancel_reason="Mưa")
    assert post_status(client, departure, status="OPEN").status_code == 409
    assert client.post(f"/departures/{departure}", data=edit_data(seats="20"), headers=MANAGER).status_code == 409
    page = client.get(f"/departures/{departure}", headers=MANAGER).text
    assert "Mưa" in page and 'name="seats"' not in page


# ---------- check-in ----------

def started_departure(db, hours_ago=1):
    return guests_departure(db, starts_at=NOW - timedelta(hours=hours_ago))[1]


def checkin(client, departure, **data):
    return client.post(f"/departures/{departure}/checkin", data=data, headers=MANAGER)


def test_check_in_by_button_records_the_whole_party_or_a_count(client, db, households):
    departure = started_departure(db)
    whole = add_booking(db, departure, adults=2, children=1, status="CONFIRMED", code="WHKLMN23")
    part = add_booking(db, departure, adults=3, status="CONFIRMED", code="PARTKM23")
    assert location(checkin(client, departure, booking_id=str(whole), count="")) == f"/apps/tea-tour/departures/{departure}?done=checkin&code=WHKLMN23"
    checkin(client, departure, booking_id=str(part), count="2")
    assert row(db, "SELECT checked_in_count, checked_in_by FROM bookings WHERE id = %s", whole) == (3, "Quản trị TC")
    assert row(db, "SELECT checked_in_count FROM bookings WHERE id = %s", part)[0] == 2
    assert row(db, "SELECT count(*) FROM booking_events WHERE kind = 'CHECKED_IN'")[0] == 2
    page = client.get(f"/departures/{departure}?done=checkin&code=WHKLMN23", headers=MANAGER).text
    assert "Đã điểm danh" in page and "3/3" in page


def test_check_in_by_code_is_case_insensitive_and_stays_in_this_departure(client, db, households):
    departure = started_departure(db)
    other = started_departure(db)
    booking = add_booking(db, departure, adults=1, status="CONFIRMED", code="ABCD2345")
    foreign = add_booking(db, other, adults=1, status="CONFIRMED", code="ZZZZ9999")
    assert checkin(client, departure, code=" abcd2345 ").status_code == 303
    assert row(db, "SELECT checked_in_count FROM bookings WHERE id = %s", booking)[0] == 1
    unknown = checkin(client, departure, code="ZZZZ9999")
    assert unknown.status_code == 422 and "Không có mã này" in unknown.text
    assert row(db, "SELECT checked_in_count FROM bookings WHERE id = %s", foreign)[0] is None
    assert checkin(client, departure, booking_id=str(foreign)).status_code == 404
    assert checkin(client, departure).status_code == 422


def test_check_in_undo(client, db, households):
    departure = started_departure(db)
    booking = add_booking(db, departure, adults=2, status="CONFIRMED", checked_in_at=NOW, checked_in_count=2, checked_in_by="Ai đó")
    assert checkin(client, departure, booking_id=str(booking), undo="1").status_code == 303
    assert row(db, "SELECT checked_in_at, checked_in_count FROM bookings WHERE id = %s", booking) == (None, None)
    assert row(db, "SELECT count(*) FROM booking_events WHERE kind = 'CHECK_IN_UNDONE'")[0] == 1


def test_check_in_refusals_come_from_the_core(client, db, households):
    _, future = guests_departure(db, starts_at=NOW + timedelta(days=3))
    early = add_booking(db, future, status="CONFIRMED")
    reply = checkin(client, future, booking_id=str(early))
    assert reply.status_code == 409 and "Chưa tới hoặc đã quá thời gian điểm danh" in reply.text
    departure = started_departure(db)
    pending = add_booking(db, departure, status="PENDING")
    confirmed = add_booking(db, departure, adults=2, status="CONFIRMED")
    assert checkin(client, departure, booking_id=str(pending)).status_code == 409
    assert checkin(client, departure, booking_id=str(confirmed), count="3").status_code == 422
    assert checkin(client, departure, booking_id=str(confirmed), count="0").status_code == 422
    assert checkin(client, departure, booking_id=str(confirmed), count="abc").status_code == 422
    assert row(db, "SELECT checked_in_count FROM bookings WHERE id = %s", confirmed)[0] is None


def test_the_page_shows_absent_guests_once_the_trip_is_over(client, db, households):
    departure = guests_departure(db, starts_at=NOW - timedelta(hours=10))[1]
    add_booking(db, departure, status="CONFIRMED", guest_name="Khách vắng")
    assert "Vắng mặt" in client.get(f"/departures/{departure}", headers=MANAGER).text
    upcoming = guests_departure(db)[1]
    add_booking(db, upcoming, status="CONFIRMED", guest_name="Khách chờ")
    assert "Vắng mặt" not in client.get(f"/departures/{upcoming}", headers=MANAGER).text


# ---------- CSV and print sheet ----------

def test_guest_csv_has_bom_crlf_formula_guard_and_a_dated_file_name(client, db, households):
    departure = guests_departure(db, starts_at=datetime(2031, 5, 17, 8, 0, tzinfo=VN_TZ))[1]
    add_booking(db, departure, adults=2, children=1, status="CONFIRMED", guest_name="=HYPERLINK(\"x\")", phone="0912345678",
                code="CSVKMN45", note="@note", paid_vnd=100_000, total_vnd=650_000, checked_in_at=NOW, checked_in_count=3)
    add_booking(db, departure, status="PENDING", guest_name="Chờ xác nhận")
    add_booking(db, departure, status="CANCELLED", guest_name="Đã huỷ")
    reply = client.get(f"/departures/{departure}/guests/export.csv", headers=MANAGER)
    assert reply.headers["content-type"].startswith("text/csv")
    assert reply.headers["content-disposition"] == 'attachment; filename="tea-tour-TC-khach-chuyen-2031-05-17.csv"'
    text = reply.content.decode("utf-8")
    assert text.startswith("﻿") and "\r\n" in text and "\n" not in text.replace("\r\n", "")
    assert "'=HYPERLINK" in text and "'@note" in text and "CSVKMN45" in text and "Chờ xác nhận" in text and "Đã huỷ" not in text
    assert "Có mặt 3/3" in text


def test_print_sheet_lists_confirmed_guests_and_links_back_outside_the_frame(client, db, households):
    _, departure = guests_departure(db)
    add_booking(db, departure, adults=2, children=1, status="CONFIRMED", guest_name="Chị Lan", phone="0911111111", total_vnd=650_000, paid_vnd=200_000)
    add_booking(db, departure, status="PENDING", guest_name="Anh Chờ")
    page = client.get(f"/departures/{departure}/print", headers=MANAGER).text
    assert "print-sheet" in page and "Chị Lan" in page and "0911111111" in page and "Anh Chờ" not in page
    assert f'href="/manager/apps/tea-tour/departures/{departure}"' in page and 'target="_top"' in page
    assert "450.000 ₫" in page and "Tour có khách" in page and "Hộ ông Ba" in page and "Ký tên" in page
    assert "tabs" not in page  # a print page is not inside the admin shell


# ---------- settings ----------

def settings_data(**over) -> dict:
    data = {"display_name": "HTX Chè Hồng Thái", "tagline": "Chè sạch trên đồi", "intro": "Giới thiệu HTX.", "hotline": "0912 345 678",
            "zalo": "0912345678", "email": "htx@example.vn", "address": "Xóm Hồng Thái, Tân Cương", "map_url": "https://maps.example/htx",
            "bank_bin": "970405", "bank_account": "8600 2010 01234", "bank_holder": "Nguyễn Văn Ba", "deposit_percent": "30",
            "hold_hours": "24", "cancel_free_hours": "48", "auto_confirm": "on", "policy_text": "Huỷ trước 48 giờ được hoàn cọc."}
    return {**data, **over}


def test_settings_form_shows_defaults_when_nothing_is_saved(client):
    page = client.get("/settings", headers=MANAGER).text
    assert 'name="deposit_percent"' in page and 'value="24"' in page
    assert page.count('<option value="97') == len(vietqr_banks())  # every bank of Appendix A can be chosen
    assert "data:image/svg+xml" not in page and "Chưa khai tài khoản" in page


def vietqr_banks():
    from tea_tour.domain import vietqr
    return vietqr.BANKS


def test_settings_save_stores_every_field_and_redirects(client, db):
    assert location(client.post("/settings", data=settings_data(), headers=MANAGER)) == "/apps/tea-tour/settings?saved=1"
    s = row(db, "SELECT display_name, hotline, bank_bin, bank_account, bank_holder, deposit_percent, hold_hours, cancel_free_hours, "
                "auto_confirm, policy_text, map_url FROM settings WHERE htx_code = 'TC'")
    assert s == ("HTX Chè Hồng Thái", "0912 345 678", "970405", "8600201001234", "NGUYEN VAN BA", 30, 24, 48, True,
                 "Huỷ trước 48 giờ được hoàn cọc.", "https://maps.example/htx")
    page = client.get("/settings?saved=1", headers=MANAGER).text
    assert "Đã lưu" in page and 'value="NGUYEN VAN BA"' in page and 'value="8600201001234"' in page
    assert 'name="auto_confirm" checked' in page


def test_unchecked_auto_confirm_is_saved_as_false(client, db):
    add_settings(db, auto_confirm=True)
    data = settings_data()
    del data["auto_confirm"]
    client.post("/settings", data=data, headers=MANAGER)
    assert row(db, "SELECT auto_confirm FROM settings WHERE htx_code = 'TC'")[0] is False


SETTINGS_ERRORS = [({"deposit_percent": "101"}, "Tỉ lệ đặt cọc"), ({"deposit_percent": ""}, "Tỉ lệ đặt cọc"), ({"hold_hours": "0"}, "giữ chỗ"),
                   ({"cancel_free_hours": "721"}, "huỷ miễn phí"), ({"map_url": "http://x.example"}, "https://"),
                   ({"bank_account": ""}, "khai đủ"), ({"bank_bin": "123456"}, "ngân hàng"), ({"bank_account": "12ab"}, "6 đến 19 chữ số"),
                   ({"display_name": "x" * 81}, "Tên hiển thị"), ({"hotline": "abc"}, "Đường dây nóng"), ({"email": "khong-phai-email"}, "Email")]


@pytest.mark.parametrize(("override", "message"), SETTINGS_ERRORS)
def test_settings_errors_rerender_with_422_keep_the_values_and_write_nothing(client, db, override, message):
    reply = client.post("/settings", data=settings_data(**override), headers=MANAGER)
    assert reply.status_code == 422 and message in reply.text
    assert "HTX Chè Hồng Thái" in reply.text or "display_name" in override
    assert row(db, "SELECT count(*) FROM settings")[0] == 0


def test_a_missing_number_field_is_an_error_not_a_crash(client):
    data = settings_data()
    del data["hold_hours"]
    assert client.post("/settings", data=data, headers=MANAGER).status_code == 422


def test_settings_belong_to_the_cooperative_of_the_token(client, db):
    add_settings(db, htx="LB", display_name="HTX khác")
    client.post("/settings", data=settings_data(), headers=MANAGER)
    assert row(db, "SELECT display_name FROM settings WHERE htx_code = 'LB'")[0] == "HTX khác"
    assert "HTX khác" not in client.get("/settings", headers=MANAGER).text


def test_settings_page_escapes_hostile_text(client, db):
    add_settings(db, display_name='"><script>alert(1)</script>', policy_text="</textarea><script>alert(2)</script>")
    page = client.get("/settings", headers=MANAGER).text
    assert "<script>alert" not in page and "&lt;script&gt;alert(1)" in page


def test_a_sample_vietqr_is_drawn_once_the_bank_is_set(client, db):
    add_settings(db, bank_bin="970405", bank_account="8600201001234", bank_holder="NGUYEN VAN BA")
    page = client.get("/settings", headers=MANAGER).text
    assert '<img class="qr-sample" src="data:image/svg+xml' in page and "Agribank" in page and "NGUYEN VAN BA" in page
    assert "style=" not in page


def test_cover_upload_sets_the_cover_and_replaces_the_old_one(client, db):
    add_settings(db, display_name="HTX")
    assert location(client.post("/settings/cover", files={"photo": ("c.jpg", image_bytes(), "image/jpeg")}, headers=MANAGER)) == \
        "/apps/tea-tour/settings?saved=cover"
    first = row(db, "SELECT cover_media_id FROM settings WHERE htx_code = 'TC'")[0]
    assert first is not None and f"/apps/tea-tour/media/{first}-thumb.jpg" in client.get("/settings", headers=MANAGER).text
    assert client.get(f"/public/TC/media/{first}-large.jpg").status_code == 200  # the customer site shows it
    client.post("/settings/cover", files={"photo": ("d.jpg", image_bytes(), "image/jpeg")}, headers=MANAGER)
    second = row(db, "SELECT cover_media_id FROM settings WHERE htx_code = 'TC'")[0]
    assert second != first and row(db, "SELECT count(*) FROM media WHERE id = %s", first)[0] == 0
    assert row(db, "SELECT display_name FROM settings WHERE htx_code = 'TC'")[0] == "HTX"


def test_saving_the_form_keeps_the_cover(client, db):
    cover = add_media(db)
    add_settings(db, cover_media_id=cover)
    client.post("/settings", data=settings_data(), headers=MANAGER)
    assert row(db, "SELECT cover_media_id FROM settings WHERE htx_code = 'TC'")[0] == cover


def test_cover_upload_refusals_show_the_limits(client, db):
    for data, message in ((b"nope", "không phải ảnh"), (image_bytes("PNG", (3000, 2100)), "6 triệu"), (b"", "Hãy chọn một ảnh")):
        reply = client.post("/settings/cover", files={"photo": ("c.png", data, "image/png")}, headers=MANAGER)
        assert reply.status_code == 422 and message in reply.text, message
    assert client.post("/settings/cover", files={"other": ("x", b"x")}, headers=MANAGER).status_code == 422
    assert row(db, "SELECT count(*) FROM media")[0] == 0
    assert "JPEG tối đa 16 triệu điểm ảnh; PNG và WebP tối đa 6 triệu điểm ảnh" in client.get("/settings", headers=MANAGER).text
