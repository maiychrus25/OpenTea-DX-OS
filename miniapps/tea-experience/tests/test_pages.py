# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from decimal import Decimal
from urllib.parse import parse_qs, urlsplit

import pytest
from conftest import add_experience, add_intro, add_site, bearer
from fastapi.testclient import TestClient

from tea_experience import core_client, main, store
from tea_experience.core_client import CoreError, Parcel, Profile, Snapshot

MANAGER = bearer()
OTHER_MANAGER = bearer(sub="kc-manager-lb", htx="LB", name="Quản trị LB")
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nông hộ Một")
SECRET_PARCEL = "TC-SECRET-01"


def snapshot(name="HTX Tân Cương", parcels=()):
    profile = Profile(htx_code="TC", name=name, address="Xóm Hồng Thái, Tân Cương, Đại Từ (số nhà 12)",
                      crop_types="Chè Trung du", season_label="Lứa 1/2026", total_area_ha=Decimal("12.50"),
                      member_count=40)
    return Snapshot(profile=profile, parcels=tuple(parcels), skipped=0)


def parcel(code=SECRET_PARCEL, crop="Chè"):
    return Parcel(parcel_code=code, lat=Decimal("21.7777777"), lng=Decimal("105.1234567"),
                  crop=crop, season="Đông Xuân", planting=True)


@pytest.fixture
def client(db):
    with TestClient(main.app, root_path=main.PREFIX, raise_server_exceptions=False, follow_redirects=False) as c:
        yield c


@pytest.fixture
def core(monkeypatch):
    """Stands in for the core: set state['snapshot'] or state['error'] (a fixed code) before a refresh."""
    state = {"snapshot": snapshot(parcels=[parcel()]), "error": None, "calls": []}

    def fake(authorization, htx):
        state["calls"].append((authorization, htx))
        if state["error"]:
            raise CoreError(state["error"])
        return state["snapshot"]

    monkeypatch.setattr(core_client, "fetch_snapshot", fake)
    return state


def location(response):
    parts = urlsplit(response.headers["location"])
    return parts.path, parse_qs(parts.query)


# ---------- Quyền và cách ly HTX ----------

def test_healthz(client):
    assert client.get("/healthz").text == "ok"


def test_manager_pages_refuse_other_roles_and_no_token(client):
    assert client.get("/", headers=FARMER).status_code == 403
    assert client.get("/sites", headers=FARMER).status_code == 403
    assert client.get("/").status_code == 401
    assert client.get("/guide", headers=MANAGER).status_code == 403
    assert client.get("/guide", headers=FARMER).status_code == 200


def test_token_without_htx_code_is_forbidden(client):
    no_htx = bearer(htx="")
    assert client.get("/", headers=no_htx).status_code == 403


def test_manager_sees_only_own_htx(client, db):
    add_site(db, htx="TC", name="Đồi của Tân Cương", is_public=False)
    add_site(db, htx="LB", name="Đồi của La Bằng", is_public=False)
    page = client.get("/sites", headers=MANAGER).text
    assert "Đồi của Tân Cương" in page and "Đồi của La Bằng" not in page


def test_other_htx_ids_are_not_found_and_not_changed(client, db):
    their_site = add_site(db, htx="LB", name="Điểm LB", is_public=False)
    their_exp = add_experience(db, htx="LB", name="Gói LB", is_visible=False)
    assert client.get(f"/sites/{their_site}/edit", headers=MANAGER).status_code == 404
    assert client.post(f"/sites/{their_site}/edit", headers=MANAGER,
                       data={"name": "Bị đổi", "public": "1"}).status_code == 404
    assert client.post(f"/sites/{their_site}/public", headers=MANAGER, data={"to": "1"}).status_code == 404
    assert client.post(f"/sites/{their_site}/delete", headers=MANAGER).status_code == 404
    assert client.get(f"/experiences/{their_exp}/edit", headers=MANAGER).status_code == 404
    assert client.post(f"/experiences/{their_exp}/visible", headers=MANAGER, data={"to": "1"}).status_code == 404
    assert client.post(f"/experiences/{their_exp}/delete", headers=MANAGER).status_code == 404
    assert db.execute("SELECT name, is_public FROM sites WHERE id = %s", (their_site,)).fetchone() == ("Điểm LB", False)
    assert db.execute("SELECT count(*) FROM experiences WHERE id = %s", (their_exp,)).fetchone()[0] == 1


def test_experience_cannot_link_another_htxs_site(client, db):
    their_site = add_site(db, htx="LB", name="Điểm LB")
    response = client.post("/experiences", headers=MANAGER, data={
        "name": "Gói thử", "duration_min": "60", "price_vnd": "0", "months": ["3"], "sites": [str(their_site)],
        "visible": "1"})
    assert response.status_code == 400 and "không thuộc HTX" in response.text
    assert db.execute("SELECT count(*) FROM experiences").fetchone()[0] == 0


# ---------- Soạn nội dung ----------

def test_create_site_redirects_with_prefix_and_theme(client, db):
    response = client.post("/sites?theme=dark", headers=MANAGER, data={
        "name": "Xưởng sao chè", "latitude": "21,0285", "longitude": "105,8542", "public": "1", "description": "Mở cửa 7h"})
    path, query = location(response)
    assert response.status_code == 303
    assert path == "/apps/tea-experience/sites" and query == {"notice": ["saved"], "theme": ["dark"]}
    row = db.execute("SELECT name, latitude, longitude, is_public FROM sites WHERE htx_code = 'TC'").fetchone()
    assert row == ("Xưởng sao chè", Decimal("21.0285000"), Decimal("105.8542000"), True)


def test_site_errors_keep_what_was_typed(client, db):
    response = client.post("/sites", headers=MANAGER, data={
        "name": "Điểm có lỗi", "latitude": "95", "longitude": "105.8", "public": "1"})
    assert response.status_code == 400
    assert "Vĩ độ phải là số từ -90 đến 90." in response.text
    assert 'value="Điểm có lỗi"' in response.text and 'value="105.8"' in response.text
    assert db.execute("SELECT count(*) FROM sites").fetchone()[0] == 0


def test_site_copies_coordinates_from_a_synced_parcel(client, db, core):
    client.post("/sync", headers=MANAGER)
    response = client.post("/sites", headers=MANAGER, data={"name": "Đồi chè cổ", "parcel_code": SECRET_PARCEL})
    assert response.status_code == 303
    row = db.execute("SELECT latitude, parcel_code FROM sites WHERE name = 'Đồi chè cổ'").fetchone()
    assert row == (Decimal("21.7777777"), SECRET_PARCEL)


def test_visibility_toggle_and_delete_site(client, db):
    site = add_site(db, is_public=True)
    client.post(f"/sites/{site}/public", headers=MANAGER, data={"to": "0"})
    assert db.execute("SELECT is_public FROM sites WHERE id = %s", (site,)).fetchone()[0] is False
    client.post(f"/sites/{site}/public", headers=MANAGER, data={"to": "1"})
    assert db.execute("SELECT is_public FROM sites WHERE id = %s", (site,)).fetchone()[0] is True
    response = client.post(f"/sites/{site}/delete", headers=MANAGER)
    assert location(response)[1]["notice"] == ["deleted"]
    assert db.execute("SELECT count(*) FROM sites").fetchone()[0] == 0


def test_experience_create_edit_and_public_detail(client, db):
    shown = add_site(db, name="Điểm công khai", is_public=True)
    hidden = add_site(db, name="Điểm đang ẩn", is_public=False)
    response = client.post("/experiences", headers=MANAGER, data={
        "name": "Sao chè thủ công", "description": "Tự tay sao chè trên chảo gang", "duration_min": "120",
        "price_vnd": "150000", "months": ["4", "3"], "sites": [str(shown), str(hidden)], "visible": "1"})
    assert response.status_code == 303
    exp_id = db.execute("SELECT id FROM experiences WHERE name = 'Sao chè thủ công'").fetchone()[0]
    detail = client.get(f"/public/TC/experiences/{exp_id}").text
    assert "Tháng 3, Tháng 4" in detail and "Điểm công khai" in detail
    assert "Điểm đang ẩn" not in detail
    assert "150.000 ₫" in detail and "không phải giá tour" in detail
    assert "/apps/tea-tour/public/TC" in detail

    response = client.post(f"/experiences/{exp_id}/edit", headers=MANAGER, data={
        "name": "Sao chè thủ công", "duration_min": "90", "price_vnd": "0", "months": ["5"],
        "sites": [str(hidden)], "visible": "1"})
    assert response.status_code == 303
    assert store.linked_site_ids(db, "TC", exp_id) == [hidden]
    assert db.execute("SELECT months, duration_min FROM experiences WHERE id = %s", (exp_id,)).fetchone() == ([5], 90)


def test_hidden_experience_is_not_found_for_guests(client, db):
    exp_id = add_experience(db, is_visible=False)
    assert client.get(f"/public/TC/experiences/{exp_id}").status_code == 404
    assert "Gói trải nghiệm" in client.get("/public/TC/experiences").text
    assert f"/experiences/{exp_id}" not in client.get("/public/TC/experiences").text


def test_experience_visibility_and_delete(client, db):
    exp_id = add_experience(db, is_visible=True)
    client.post(f"/experiences/{exp_id}/visible", headers=MANAGER, data={"to": "0"})
    assert db.execute("SELECT is_visible FROM experiences WHERE id = %s", (exp_id,)).fetchone()[0] is False
    response = client.post(f"/experiences/{exp_id}/delete", headers=MANAGER)
    assert location(response)[1]["notice"] == ["deleted"]


def test_experience_errors_keep_the_form(client, db):
    response = client.post("/experiences", headers=MANAGER, data={
        "name": "Gói lỗi", "duration_min": "10", "price_vnd": "-5", "months": ["13"]})
    assert response.status_code == 400
    assert "Thời lượng phải từ 15 đến 1440 phút." in response.text
    assert "Giá tham khảo phải là số đồng" in response.text
    assert 'value="Gói lỗi"' in response.text


def test_intro_text_is_saved_and_limited(client, db):
    response = client.post("/intro", headers=MANAGER, data={"intro_text": "Chào mừng bạn đến đồi chè."})
    assert location(response) == ("/apps/tea-experience/intro", {"notice": ["saved"]})
    assert store.get_intro(db, "TC").intro_text == "Chào mừng bạn đến đồi chè."
    response = client.post("/intro", headers=MANAGER, data={"intro_text": "x" * 2001})
    assert response.status_code == 400 and "tối đa 2000 ký tự" in response.text
    assert store.get_intro(db, "TC").intro_text == "Chào mừng bạn đến đồi chè."


def test_seasons_save_and_show_publicly(client, db):
    notes = ["Tết, ít việc"] + [""] * 10 + ["Hái chè xuân, búp non nhất"]
    response = client.post("/seasons", headers=MANAGER, data={"notes": notes})
    assert response.status_code == 303
    public = client.get("/public/TC/seasons").text
    assert "Tết, ít việc" in public and "Hái chè xuân, búp non nhất" in public
    assert public.count("Chưa có ghi chú") == 10


def test_seasons_need_twelve_months(client, db):
    response = client.post("/seasons", headers=MANAGER, data={"notes": ["a"] * 11})
    assert response.status_code == 400 and "không đủ 12 tháng" in response.text


def test_seasons_reject_a_long_note(client, db):
    response = client.post("/seasons", headers=MANAGER, data={"notes": ["x" * 301] + [""] * 11})
    assert response.status_code == 400 and "tối đa 300 ký tự" in response.text
    assert db.execute("SELECT count(*) FROM season_notes").fetchone()[0] == 0


# ---------- Làm mới từ lõi (DL-11) ----------

def test_sync_success_fills_the_copy_and_keeps_the_intro_text(client, db, core):
    add_intro(db, name=None, intro_text="Lời của trưởng HTX", synced=False)
    response = client.post("/sync", headers=MANAGER)
    assert location(response) == ("/apps/tea-experience/intro", {"notice": ["synced"]})
    assert core["calls"] == [(MANAGER["Authorization"], "TC")]
    page = client.get("/intro", headers=MANAGER).text
    assert "HTX Tân Cương" in page and "Lời của trưởng HTX" in page
    assert "Cập nhật lúc" in page and "thửa có vụ đang trồng" in page
    assert [p.parcel_code for p in store.core_parcels(db, "TC")] == [SECRET_PARCEL]


def test_sync_failure_keeps_old_data_and_every_page_still_renders(client, db, core):
    client.post("/sync", headers=MANAGER)
    core["error"] = core_client.UNAVAILABLE
    response = client.post("/sync", headers=MANAGER)
    assert location(response) == ("/apps/tea-experience/intro", {"notice": ["sync_failed"]})
    page = client.get("/intro", headers=MANAGER)
    assert page.status_code == 200
    assert "Lõi không trả lời trong 5 giây." in page.text and "HTX Tân Cương" in page.text
    assert client.get("/", headers=MANAGER).status_code == 200
    assert client.get("/public/TC").status_code == 200
    assert store.last_sync(db, "TC").result == "ERROR"
    assert [p.parcel_code for p in store.core_parcels(db, "TC")] == [SECRET_PARCEL]


def test_sync_refused_profile_is_logged_and_nothing_changes(client, db, core):
    core["error"] = core_client.WRONG_HTX
    response = client.post("/sync", headers=MANAGER)
    assert location(response)[1]["notice"] == ["sync_failed"]
    assert store.get_intro(db, "TC") is None
    assert store.last_sync(db, "TC").detail == core_client.WRONG_HTX


def test_sync_without_token_is_refused_before_the_core(client, core):
    assert client.post("/sync").status_code == 401
    assert core["calls"] == []


# ---------- Trang công khai ----------

SENSITIVE = [SECRET_PARCEL, "Thửa bí mật", "21.7777777", "105.1234567", "Quản trị TC", "Điểm đang ẩn",
             "Gói đang ẩn", "Nguyễn Văn Hộ", "0912345678", "Thửa đã chọn", "số nhà 12", "Xóm Hồng Thái",
             "Lứa 1/2026"]


def seed_public(db, core):
    """A synced HTX with one public site, one hidden site, one shown and one hidden experience."""
    add_intro(db, intro_text="Đồi chè Tân Cương, sao chè thủ công.")
    store.save_snapshot(db, "TC", "Quản trị TC", snapshot(parcels=[parcel()]))
    public_site = add_site(db, name="Đồi chè Hồng Thái", lat=Decimal("21.5000000"), lng=Decimal("105.6000000"),
                           parcel_code=SECRET_PARCEL, is_public=True, description="Đồi cao, nhìn xa")
    add_site(db, name="Điểm đang ẩn", is_public=False)
    shown = add_experience(db, name="Hái chè buổi sáng", sites=[public_site], months=(3, 4))
    add_experience(db, name="Gói đang ẩn", is_visible=False)
    return public_site, shown


def test_public_pages_never_show_private_data(client, db, core):
    seed_public(db, core)
    exp_id = db.execute("SELECT id FROM experiences WHERE name = 'Hái chè buổi sáng'").fetchone()[0]
    pages = ["/public/TC", "/public/TC/sites", "/public/TC/experiences", f"/public/TC/experiences/{exp_id}",
             "/public/TC/seasons"]
    for path in pages:
        response = client.get(path)
        assert response.status_code == 200, path
        for text in SENSITIVE:
            assert text not in response.text, f"{text!r} leaked on {path}"


def test_public_pages_show_the_copy_with_its_time(client, db, core):
    seed_public(db, core)
    home = client.get("/public/TC").text
    assert "HTX Tân Cương" in home and "Đồi chè Tân Cương" in home
    assert "12,5 ha" in home and "Cập nhật lúc" in home
    assert 'href="/apps/tea-tour/public/TC"' in home  # DL-5
    assert "Quét mã QR trên gói chè" in home  # DL-6, a line only


def test_public_sites_show_the_map_link_only_with_coordinates(client, db, core):
    seed_public(db, core)
    add_site(db, name="Cây chè cổ", is_public=True)  # no coordinates
    page = client.get("/public/TC/sites").text
    assert "Đồi chè Hồng Thái" in page and "Đồi cao, nhìn xa" in page
    assert page.count("Mở trên bản đồ") == 1
    assert "https://www.openstreetmap.org/?mlat=21.500000&amp;mlon=105.600000" in page
    assert "Cây chè cổ" in page and "Điểm đang ẩn" not in page


def test_public_experience_hides_hidden_sites_and_shows_months(client, db, core):
    _, exp_id = seed_public(db, core)
    page = client.get(f"/public/TC/experiences/{exp_id}").text
    assert "Tháng 3, Tháng 4" in page and "Đồi chè Hồng Thái" in page
    assert "Hái chè buổi sáng" in page


def test_public_home_without_any_data(client):
    page = client.get("/public/NEW")
    assert page.status_code == 200 and "HTX đang cập nhật, mời quay lại sau." in page.text
    assert page.text.count("HTX đang cập nhật, mời quay lại sau.") >= 3  # lời giới thiệu và hai mục trống
    assert 'class="tp-hero"' in page.text and "Xem lịch tour và đặt chỗ" in page.text
    assert "Cập nhật lúc" not in page.text and "tp-facts" not in page.text
    assert page.text.count("Xem tất cả") == 1  # chỉ mục lịch mùa vụ; mục trống không dẫn tới trang trống


def test_public_refuses_bad_ids_and_codes(client, db):
    assert client.get("/public/bad%24code").status_code == 404
    assert client.get("/public/TC/experiences/not-a-uuid").status_code == 404
    assert client.get(f"/public/TC/experiences/{'0' * 8}-0000-0000-0000-000000000000").status_code == 404


def test_user_text_is_escaped_everywhere(client, db, core):
    add_intro(db, intro_text="<img src=x onerror=alert(1)>")
    add_site(db, name="<script>alert(1)</script>", is_public=True)
    for path in ("/public/TC", "/public/TC/sites"):
        page = client.get(path).text
        assert "<script>alert(1)</script>" not in page and "<img src=x" not in page
        assert "&lt;img src=x onerror=alert(1)&gt;" in page or "&lt;script&gt;" in page
    manager_page = client.get("/sites", headers=MANAGER).text
    assert "<script>alert(1)</script>" not in manager_page


def test_public_pages_have_no_script_or_style_attributes(client, db, core):
    seed_public(db, core)
    exp_id = db.execute("SELECT id FROM experiences WHERE name = 'Hái chè buổi sáng'").fetchone()[0]
    for path in ("/public/TC", "/public/TC/sites", "/public/TC/experiences", f"/public/TC/experiences/{exp_id}",
                 "/public/TC/seasons", "/", "/sites", "/intro", "/experiences", "/seasons", "/guide"):
        headers = FARMER if path == "/guide" else MANAGER
        page = client.get(path, headers=headers).text
        assert "<script" not in page and ' style="' not in page, path


# ---------- Theme và prefix ----------

def test_theme_is_kept_on_links_and_only_valid_values_reach_the_page(client, db):
    page = client.get("/?theme=dark", headers=MANAGER).text
    assert 'data-theme="dark"' in page
    assert 'href="/apps/tea-experience/intro?theme=dark"' in page
    page = client.get("/?theme=evil", headers=MANAGER).text
    assert "data-theme" not in page and "evil" not in page


def test_redirects_keep_the_prefix_and_theme(client, db):
    response = client.post("/experiences/" + str(add_experience(db)) + "/delete?theme=light", headers=MANAGER)
    assert response.headers["location"].startswith("/apps/tea-experience/experiences?")
    assert "theme=light" in response.headers["location"]


# ---------- Nông dân ----------

def test_farmer_guide_shows_only_public_content(client, db, core):
    seed_public(db, core)
    page = client.get("/guide", headers=FARMER)
    assert page.status_code == 200
    assert "Đồi chè Hồng Thái" in page.text and "Hái chè buổi sáng" in page.text
    for text in SENSITIVE:
        assert text not in page.text, text
    assert "Trang này chỉ hiện nội dung đang công khai" in page.text


# ---------- Trang nội bộ hiện được khi chưa có dữ liệu ----------

def test_manager_pages_render_with_no_data(client):
    for path in ("/", "/intro", "/sites", "/experiences", "/seasons"):
        assert client.get(path, headers=MANAGER).status_code == 200, path
    assert "Chưa làm mới lần nào" in client.get("/intro", headers=MANAGER).text


# ---------- Giao diện trang khách (hero, xem trước, lưới tháng, trạng thái trống) ----------

def test_public_home_has_hero_and_previews(client, db, core):
    seed_public(db, core)
    home = client.get("/public/TC").text
    assert 'class="tp-hero"' in home
    assert "HTX Tân Cương" in home and "Đồi chè Tân Cương, sao chè thủ công." in home
    assert "Xem các trải nghiệm" in home and "/apps/tea-experience/public/TC/experiences" in home
    assert "Đồi chè Hồng Thái" in home and "Đồi cao, nhìn xa" in home  # điểm công khai, xem trước
    assert "Hái chè buổi sáng" in home and "150.000 ₫" in home and "120 phút" in home
    assert home.count("Xem tất cả") == 2 and "Tất cả trải nghiệm" in home  # điểm và mùa vụ
    assert "tp-facts" in home and "Cập nhật lúc" in home and 'class="tp-footer"' in home


def test_public_home_shows_each_month_and_marks_fit_and_notes(client, db, core):
    seed_public(db, core)  # gói có tháng 3 và 4
    store.save_season_notes(db, "TC", {3: "Búp non nhất, đi sớm"})
    home = client.get("/public/TC").text
    assert home.count('class="tp-month"') == 12
    assert home.count('data-fit="1"') == 2  # tháng 3, 4
    assert 'data-fit="1" data-note="1"' in home  # tháng 3 vừa hợp đi vừa có ghi chú
    assert "Búp non nhất, đi sớm" in home


def test_public_home_previews_are_at_most_three_cards(client, db, core):
    seed_public(db, core)
    for i in range(4):
        add_site(db, name=f"Đồi thêm {i}", is_public=True, sort_order=i + 1)
    home = client.get("/public/TC").text
    assert home.count('class="tp-card tp-card--site"') == 3
    assert "Đồi thêm 3" not in home


def test_public_home_preview_shows_only_public_names_of_experiences(client, db, core):
    seed_public(db, core)
    hidden_site = add_site(db, name="Điểm liên kết ẩn", is_public=False)
    exp = db.execute("SELECT id FROM experiences WHERE name = 'Hái chè buổi sáng'").fetchone()[0]
    db.execute("INSERT INTO experience_sites (htx_code, experience_id, site_id) VALUES ('TC', %s, %s)",
               (exp, hidden_site))
    home = client.get("/public/TC").text
    assert "Gần: Đồi chè Hồng Thái" in home
    assert "Điểm liên kết ẩn" not in home


def test_public_pages_use_the_stylesheet_under_the_htx_and_the_public_class(client, db, core):
    seed_public(db, core)
    exp_id = db.execute("SELECT id FROM experiences WHERE name = 'Hái chè buổi sáng'").fetchone()[0]
    for path in ("/public/TC", "/public/TC/sites", "/public/TC/experiences", f"/public/TC/experiences/{exp_id}",
                 "/public/TC/seasons"):
        page = client.get(path).text
        assert 'href="/apps/tea-experience/public/TC/style.css"' in page, path
        assert 'class="tp"' in page and "<style" not in page, path
        assert 'class="tp-footer"' in page and "Quét mã QR trên gói chè" in page, path


def test_stylesheet_is_served_only_under_a_valid_htx(client):
    response = client.get("/public/TC/style.css")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/css")
    css = response.text
    assert "@import" not in css and "expression(" not in css and "javascript:" not in css
    # Only inline SVG images: every url() is a data: URI, so the CSP img-src 'self' data: holds.
    assert css.count("url(") == css.count('url("data:image/svg+xml,')
    assert client.get("/public/bad%24code/style.css").status_code == 404


def test_public_seasons_page_marks_the_months_of_experiences(client, db, core):
    seed_public(db, core)
    store.save_season_notes(db, "TC", {4: "Hái chè xuân"})
    page = client.get("/public/TC/seasons").text
    assert page.count('data-fit="1"') == 2
    assert 'data-fit="1" data-note="1"' in page  # tháng 4
    assert page.count("Chưa có ghi chú") == 11
    assert "Hái chè xuân" in page


def test_public_subpages_show_a_friendly_empty_state(client, db):
    add_intro(db, intro_text=None)
    for path in ("/public/TC/sites", "/public/TC/experiences"):
        page = client.get(path).text
        assert "HTX đang cập nhật, mời quay lại sau." in page, path


def test_public_experience_names_are_escaped_on_every_page(client, db, core):
    seed_public(db, core)
    exp_id = add_experience(db, name="<b>Hái</b> <i>chè</i>", is_visible=True)
    for path in ("/public/TC", "/public/TC/experiences", f"/public/TC/experiences/{exp_id}"):
        page = client.get(path).text
        assert "<b>Hái</b>" not in page and "<i>chè</i>" not in page, path
        assert "&lt;b&gt;Hái&lt;/b&gt;" in page, path


def test_public_theme_is_kept_on_the_new_links(client, db, core):
    seed_public(db, core)
    home = client.get("/public/TC?theme=dark").text
    assert 'data-theme="dark"' in home
    assert 'href="/apps/tea-experience/public/TC/experiences?theme=dark"' in home
    assert 'href="/apps/tea-tour/public/TC?theme=dark"' in home
    assert client.get("/public/TC?theme=evil").text.count("data-theme") == 0


# ---------- Gói nổi bật và trang chủ (tour và trải nghiệm) ----------

def feature(db, exp_id, on=True):
    db.execute("UPDATE experiences SET is_featured = %s WHERE id = %s", (on, exp_id))


def test_featured_is_off_by_default_and_toggled_by_the_manager(client, db):
    exp = add_experience(db)
    assert db.execute("SELECT is_featured FROM experiences WHERE id = %s", (exp,)).fetchone()[0] is False
    response = client.post(f"/experiences/{exp}/featured?theme=dark", headers=MANAGER, data={"to": "1"})
    assert response.status_code == 303 and location(response)[1]["notice"] == ["featured"]
    assert location(response)[1]["theme"] == ["dark"]
    assert db.execute("SELECT is_featured FROM experiences WHERE id = %s", (exp,)).fetchone()[0] is True
    client.post(f"/experiences/{exp}/featured", headers=MANAGER, data={"to": "0"})
    assert db.execute("SELECT is_featured FROM experiences WHERE id = %s", (exp,)).fetchone()[0] is False


def test_featured_is_capped_at_six_and_says_so(client, db):
    exps = [add_experience(db, name=f"Gói {i}") for i in range(7)]
    for exp in exps[:6]:
        feature(db, exp, True)
    response = client.post(f"/experiences/{exps[6]}/featured", headers=MANAGER, data={"to": "1"})
    assert location(response)[1]["notice"] == ["featured_full"]
    assert db.execute("SELECT is_featured FROM experiences WHERE id = %s", (exps[6],)).fetchone()[0] is False
    # bỏ nổi bật một gói rồi mới đặt được gói khác
    client.post(f"/experiences/{exps[0]}/featured", headers=MANAGER, data={"to": "0"})
    client.post(f"/experiences/{exps[6]}/featured", headers=MANAGER, data={"to": "1"})
    assert db.execute("SELECT is_featured FROM experiences WHERE id = %s", (exps[6],)).fetchone()[0] is True


def test_create_and_edit_refuse_a_seventh_featured_but_not_a_resave(client, db):
    for i in range(6):
        feature(db, add_experience(db, name=f"Nổi bật {i}"), True)
    form = {"name": "Gói mới", "duration_min": "60", "price_vnd": "100000", "visible": "1", "featured": "1"}
    response = client.post("/experiences", headers=MANAGER, data=form)
    assert response.status_code == 400 and "tối đa 6 gói" in response.text
    assert db.execute("SELECT count(*) FROM experiences WHERE name = 'Gói mới'").fetchone()[0] == 0
    # gói đã nổi bật lưu lại không bị tính thành gói thứ bảy
    already = db.execute("SELECT id FROM experiences WHERE name = 'Nổi bật 0'").fetchone()[0]
    form.update({"name": "Nổi bật 0"})
    response = client.post(f"/experiences/{already}/edit", headers=MANAGER, data=form)
    assert response.status_code == 303


def test_featured_and_toggle_stay_inside_the_htx(client, db):
    their = add_experience(db, htx="LB", name="Gói LB")
    assert client.post(f"/experiences/{their}/featured", headers=MANAGER, data={"to": "1"}).status_code == 404
    assert db.execute("SELECT is_featured FROM experiences WHERE id = %s", (their,)).fetchone()[0] is False
    assert client.post(f"/experiences/{their}/featured", headers=FARMER, data={"to": "1"}).status_code == 403


def test_home_shows_featured_packages_before_the_season_and_sites(client, db, core):
    seed_public(db, core)
    feature(db, db.execute("SELECT id FROM experiences WHERE name = 'Hái chè buổi sáng'").fetchone()[0], True)
    home = client.get("/public/TC").text
    order = [home.index(x) for x in ("tp-hero", "tp-facts", "Tour và trải nghiệm nổi bật", "Điểm tham quan",
                                       "Lịch mùa vụ")]
    assert order == sorted(order)
    assert "Từ 150.000 ₫" in home and "Xem chi tiết" in home and "Đặt chỗ" in home
    assert 'href="/apps/tea-tour/public/TC"' in home
    assert "Gói đang ẩn" not in home


def test_home_falls_back_to_the_three_newest_visible_packages(client, db):
    add_intro(db)
    for i, name in enumerate(["Cũ nhất", "Giữa", "Mới", "Mới nhất", "Đang ẩn"]):
        exp = add_experience(db, name=name, is_visible=name != "Đang ẩn")
        db.execute("UPDATE experiences SET created_at = now() - make_interval(days => %s) WHERE id = %s",
                   (10 - i, exp))
    home = client.get("/public/TC").text
    assert "Mới nhất" in home and "Mới" in home and "Giữa" in home
    assert "Cũ nhất" not in home and "Đang ẩn" not in home


def test_experience_list_filters_by_month_price_and_sort(client, db):
    add_experience(db, name="Sáng hái", months=(3,), price=150000, duration=120)
    add_experience(db, name="Chiều sao", months=(4,), price=220000, duration=150)
    add_experience(db, name="Trà tối", months=(3, 4), price=90000, duration=60)
    add_experience(db, name="Ẩn", months=(3,), is_visible=False)
    def names(page):  # theo vị trí trên trang: thứ tự là điều đang kiểm
        found = [(page.index(n), n) for n in ("Sáng hái", "Chiều sao", "Trà tối") if n in page]
        return [n for _, n in sorted(found)]
    assert names(client.get("/public/TC/experiences?month=4").text) == ["Chiều sao", "Trà tối"]
    assert names(client.get("/public/TC/experiences?max_price=150000").text) == ["Sáng hái", "Trà tối"]
    assert names(client.get("/public/TC/experiences?sort=price").text) == ["Trà tối", "Sáng hái", "Chiều sao"]
    assert names(client.get("/public/TC/experiences?sort=duration").text) == ["Trà tối", "Sáng hái", "Chiều sao"]
    page = client.get("/public/TC/experiences?month=4&max_price=150000").text
    assert names(page) == ["Trà tối"] and "1 gói trong 3 gói đang hiện" in page
    assert "Ẩn" not in client.get("/public/TC/experiences?month=3").text


def test_experience_list_name_search_is_literal_and_parameterised(client, db):
    add_experience(db, name="100% chè đồi")
    add_experience(db, name="Hái chè xuân")
    assert "100% chè đồi" in client.get("/public/TC/experiences?q=100%25").text
    assert "Hái chè xuân" not in client.get("/public/TC/experiences?q=%25").text  # % không phải ký tự đại diện
    injected = client.get("/public/TC/experiences?q='%20OR%201=1--")
    assert injected.status_code == 200 and "Hái chè xuân" not in injected.text
    assert "Không có gói nào khớp bộ lọc" in injected.text
    assert "Hái chè xuân" in client.get("/public/TC/experiences?q=hái%20chè").text


def test_bad_filter_values_are_ignored_with_one_line(client, db):
    add_experience(db, name="Hái chè xuân")
    for query in ("month=13", "month=abc", "max_price=-5", "max_price=99999999999999", "sort=drop_table",
                  "q=" + "x" * 61):
        response = client.get(f"/public/TC/experiences?{query}")
        assert response.status_code == 200, query
        assert "Có bộ lọc không hợp lệ, đã bỏ qua phần đó." in response.text, query
        assert "Hái chè xuân" in response.text, query


def test_experience_list_empty_states_are_friendly(client, db):
    assert "HTX đang cập nhật, mời quay lại sau." in client.get("/public/TC/experiences").text
    add_experience(db, name="Hái chè xuân", months=(3,))
    page = client.get("/public/TC/experiences?max_price=1").text
    assert "Không có gói nào khớp bộ lọc" in page and "Bỏ lọc" in page


def test_filter_chips_keep_the_theme(client, db):
    add_experience(db, name="Hái chè xuân", months=(3,))
    page = client.get("/public/TC/experiences?theme=dark").text
    assert 'name="theme" value="dark"' in page
    assert 'href="/apps/tea-experience/public/TC/experiences?month=3&amp;theme=dark"' in page


def test_manager_list_shows_and_sets_the_featured_mark(client, db):
    add_experience(db, name="Gói quản trị")
    page = client.get("/experiences", headers=MANAGER).text
    assert "Trên trang chủ" in page and "/featured" in page



# ---------- Địa chỉ lõi và địa phương hiển thị (chốt: khách chỉ thấy ô trưởng HTX nhập) ----------

def test_guests_see_only_the_locality_the_manager_typed(client, db, core):
    seed_public(db, core)  # add_intro: address "... số nhà 12", locality "Tân Cương, Đại Từ"
    home = client.get("/public/TC").text
    assert "Tân Cương, Đại Từ" in home
    assert "số nhà 12" not in home and "Xóm Hồng Thái" not in home


def test_no_locality_typed_means_no_place_for_guests(client, db, core):
    seed_public(db, core)
    db.execute("UPDATE htx_intro SET locality_public = NULL WHERE htx_code = 'TC'")
    home = client.get("/public/TC").text
    assert "📍" not in home and "số nhà 12" not in home


def test_manager_sees_the_core_address_and_the_member_count_note(client, db, core):
    seed_public(db, core)
    page = client.get("/intro", headers=MANAGER).text
    assert "số nhà 12" in page  # chỉ trưởng HTX thấy địa chỉ lõi
    assert "Số hộ thành viên (đếm từ lõi): 40" in page
    assert "Địa phương hiển thị cho khách" in page and "Chứng nhận" in page


def test_intro_form_saves_locality_and_certification_by_hand(client, db):
    response = client.post("/intro", headers=MANAGER, data={
        "intro_text": "Đồi chè cao.", "locality": "Tân Cương, Đại Từ", "certification": "VietGAP"})
    assert response.status_code == 303
    intro = store.get_intro(db, "TC")
    assert (intro.locality_public, intro.certification, intro.intro_text) == (
        "Tân Cương, Đại Từ", "VietGAP", "Đồi chè cao.")


def test_intro_form_refuses_long_locality_and_keeps_typed_text(client, db):
    response = client.post("/intro", headers=MANAGER, data={
        "intro_text": "Giữ lại chữ này", "locality": "x" * 201, "certification": ""})
    assert response.status_code == 400 and "Địa phương hiển thị tối đa 200 ký tự." in response.text
    assert 'Giữ lại chữ này' in response.text
    assert db.execute("SELECT count(*) FROM htx_intro").fetchone()[0] == 0
