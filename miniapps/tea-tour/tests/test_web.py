# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Scaffolding: health, static files, photos, error pages, the admin shell, the connection gate, URL helpers."""
import re
import threading
from datetime import timedelta

import pytest
from factories import (NOW, add_booking, add_departure, add_media, add_settings, add_tour, add_tour_media, bearer,
                       sample_image)

from tea_tour import assets, web
from tea_tour.claims import Claims

MANAGER = bearer()
FARMER = bearer(sub="kc-farmer-1", roles=("farmer",), name="Nông hộ Một")
OTHER_MANAGER = bearer(sub="kc-manager-lb", htx="LB", name="Quản trị LB")
CACHE = "public, max-age=31536000, immutable"


def test_healthz(client):
    reply = client.get("/healthz")
    assert reply.status_code == 200 and reply.text == "ok"


# ---------- static files ----------

def test_a_static_file_is_served_under_its_hashed_name_with_the_immutable_header(client):
    name = assets.static_url("tokens.css")
    assert re.fullmatch(r"tokens\.[0-9a-f]{10}\.css", name)
    reply = client.get(f"/public/TC/assets/{name}")
    assert reply.status_code == 200 and reply.headers["cache-control"] == CACHE
    assert reply.headers["content-type"].startswith("text/css") and "--color-primary" in reply.text


def test_the_same_file_is_reachable_under_all_three_prefixes_with_the_right_role(client):
    name = assets.static_url("admin.css")
    assert client.get(f"/assets/{name}", headers=MANAGER).status_code == 200
    assert client.get(f"/guide/assets/{name}", headers=FARMER).status_code == 200
    assert client.get(f"/public/TC/assets/{name}").status_code == 200
    assert client.get(f"/assets/{name}").status_code == 401
    assert client.get(f"/assets/{name}", headers=FARMER).status_code == 403
    assert client.get(f"/guide/assets/{name}", headers=MANAGER).status_code == 403


def test_unhashed_wrong_hash_unknown_and_private_files_are_not_found(client):
    for path in ("tokens.css", "tokens.0000000000.css", "nothing.css", "../main.py", "icons.html", "fonts/OFL.txt",
                 "fonts/OFL.0123456789.txt", "%2e%2e/main.py"):
        reply = client.get(f"/public/TC/assets/{path}")
        assert reply.status_code == 404 and "Không có trang này." in reply.text, path


def test_hash_follows_the_content(tmp_path):
    (tmp_path / "a.css").write_text("a { color: red }", encoding="utf-8")
    first = assets.build(tmp_path)[0]["a.css"]
    (tmp_path / "a.css").write_text("a { color: blue }", encoding="utf-8")
    assert assets.build(tmp_path)[0]["a.css"] != first


def test_urls_inside_css_point_at_the_hashed_files(tmp_path):
    (tmp_path / "fonts").mkdir()
    (tmp_path / "fonts" / "f.woff2").write_bytes(b"font-bytes")
    (tmp_path / "s.css").write_text("@font-face { src: url(fonts/f.woff2) format('woff2'); } a { b: url('./fonts/f.woff2'); }"
                                    " c { d: url(data:image/png;base64,AAAA) }", encoding="utf-8")
    names, built = assets.build(tmp_path)
    css = built[names["s.css"]].body.decode()
    hashed_font = names["fonts/f.woff2"].removeprefix("fonts/")
    assert f"url(fonts/{hashed_font})" in css and f"url('fonts/{hashed_font}')" in css and "url(data:image/png" in css
    assert "fonts/f.woff2" not in css


def test_tokens_css_declares_the_fonts_and_every_font_url_resolves(client):
    css = client.get(f"/public/TC/assets/{assets.static_url('tokens.css')}").text
    urls = re.findall(r"url\((fonts/[^)]+)\)", css)
    assert len(urls) == 12 and len(set(urls)) == 12
    assert css.count("font-display: swap") == 12 and "Be Vietnam Pro" in css
    assert all(re.fullmatch(r"fonts/be-vietnam-pro-(latin|latin-ext|vietnamese)-(400|500|600|700)-normal\.[0-9a-f]{10}\.woff2", u)
               for u in urls)
    for url in urls:
        reply = client.get(f"/public/TC/assets/{url}")
        assert reply.status_code == 200 and reply.headers["content-type"] == "font/woff2" and reply.content[:4] == b"wOF2"


def test_tokens_css_has_light_and_both_dark_forms_and_the_brand_colour(client):
    css = client.get(f"/public/TC/assets/{assets.static_url('tokens.css')}").text
    assert "--color-primary: var(--primary)" in css and "#176c4b" in css and "#4cc38a" in css
    assert "@media (prefers-color-scheme: dark)" in css and ':root[data-theme="dark"]' in css
    assert ':root:not([data-theme="light"])' in css


def test_licences_ship_next_to_their_files():
    from pathlib import Path
    fonts = Path(assets.STATIC_DIR, "fonts")
    assert "SIL OPEN FONT LICENSE" in (fonts / "OFL.txt").read_text(encoding="utf-8").upper()
    assert "ISC" in Path(assets.STATIC_DIR, "icons.html").read_text(encoding="utf-8")


# ---------- photos ----------

def photo_path(media_id, variant="large", base="/public/TC/media"):
    return f"{base}/{media_id}-{variant}.jpg"


def test_media_is_public_only_for_published_tours(client, db):
    tour = add_tour(db, status="DRAFT")
    media_id = add_media(db)
    add_tour_media(db, tour, media_id)
    assert client.get(photo_path(media_id)).status_code == 404  # a draft's photo
    db.execute("UPDATE tours SET status = 'PUBLISHED' WHERE id = %s", (tour,))
    reply = client.get(photo_path(media_id))
    assert reply.status_code == 200 and reply.headers["content-type"] == "image/jpeg"
    assert reply.headers["cache-control"] == CACHE and reply.content == sample_image()[0]
    assert client.get(photo_path(media_id, "thumb")).content == sample_image()[1]
    assert client.get(photo_path(media_id, base="/public/LB/media")).status_code == 404  # another cooperative
    db.execute("UPDATE tours SET status = 'ARCHIVED' WHERE id = %s", (tour,))
    assert client.get(photo_path(media_id)).status_code == 404


def test_the_cooperative_cover_is_public_and_a_loose_photo_is_not(client, db):
    cover, loose = add_media(db), add_media(db)
    add_settings(db, cover_media_id=cover)
    assert client.get(photo_path(cover)).status_code == 200
    assert client.get(photo_path(loose)).status_code == 404


def test_media_names_are_strict(client, db):
    media_id = add_media(db)
    add_settings(db, cover_media_id=media_id)
    for name in (f"{media_id}-huge.jpg", f"{media_id}-large.png", f"{media_id}.jpg", "not-a-uuid-large.jpg",
                 f"{media_id}-large.jpg.exe", f"{str(media_id).upper()}-large.jpg"):
        assert client.get(f"/public/TC/media/{name}").status_code == 404, name


def test_the_protected_media_route_serves_only_the_managers_own_cooperative(client, db):
    draft = add_tour(db, status="DRAFT")
    mine = add_media(db)
    add_tour_media(db, draft, mine)
    theirs = add_media(db, htx="LB")
    reply = client.get(photo_path(mine, base="/media"), headers=MANAGER)
    assert reply.status_code == 200 and reply.content == sample_image()[0]
    assert reply.headers["cache-control"].startswith("private")
    assert client.get(photo_path(mine, base="/media"), headers=OTHER_MANAGER).status_code == 404
    assert client.get(photo_path(theirs, base="/media"), headers=MANAGER).status_code == 404
    assert client.get(photo_path(mine, base="/media")).status_code == 401
    assert client.get(photo_path(mine, base="/media"), headers=FARMER).status_code == 403


# ---------- errors ----------

def test_unknown_paths_give_the_vietnamese_not_found_page(client):
    reply = client.get("/no/such/page", headers=MANAGER)
    assert reply.status_code == 404 and "Không có trang này." in reply.text and 'lang="vi"' in reply.text
    assert "dxos-app.css" in reply.text
    assert client.get("/tours/not-a-number/extra", headers=MANAGER).status_code == 404
    wrong_method = client.post("/healthz")
    assert wrong_method.status_code == 405 and "Không có trang này." in wrong_method.text  # shown as "no such page"


def test_a_public_not_found_uses_the_customer_shell(client):
    reply = client.get("/public/TC/nothing-here")
    assert reply.status_code == 404 and "Không có trang này." in reply.text
    assert 'name="referrer" content="no-referrer"' in reply.text and "tokens." in reply.text
    assert client.get("/public/bad%20htx!").status_code == 404
    assert client.get("/public/" + "x" * 33).status_code == 404


def test_missing_and_wrong_role_give_401_and_403_pages(client):
    assert client.get("/").status_code == 401
    forbidden = client.get("/", headers=FARMER)
    assert forbidden.status_code == 403 and "không được vào trang này" in forbidden.text
    assert client.get("/guide", headers=MANAGER).status_code == 403
    no_htx = bearer(htx="")
    assert client.get("/", headers=no_htx).status_code == 403


def test_a_crash_shows_a_vietnamese_500_without_a_traceback(client, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("secret detail")
    monkeypatch.setattr("tea_tour.store.core.sweep", broken)
    reply = client.get("/", headers=MANAGER)
    assert reply.status_code == 500 and "Có lỗi xảy ra" in reply.text and "secret detail" not in reply.text


def test_a_full_connection_gate_answers_503_instead_of_waiting(client, monkeypatch):
    monkeypatch.setattr(web, "DB_WAIT_S", 0.1)
    taken = [web.DB_SLOTS.acquire(blocking=False) for _ in range(web.DB_MAX_CONNECTIONS)]
    result = {}
    try:
        request = threading.Thread(target=lambda: result.update(response=client.get("/", headers=MANAGER)))
        request.start()
        request.join(timeout=5)
        assert not request.is_alive(), "the request waited for a free connection instead of answering 503"
        assert result["response"].status_code == 503 and "Hệ thống đang bận" in result["response"].text
    finally:
        for got in taken:
            if got:
                web.DB_SLOTS.release()
    assert client.get("/", headers=MANAGER).status_code == 200  # the gate recovers


# ---------- shells and stubs ----------

TAB_PATHS = [("overview", "Tổng quan", "/"), ("tours", "Tour", "/tours"), ("departures", "Lịch", "/departures"),
             ("bookings", "Lượt đặt", "/bookings"), ("payments", "Thu tiền", "/payments"),
             ("customers", "Khách", "/customers"), ("reviews", "Đánh giá", "/reviews"), ("reports", "Báo cáo", "/reports"),
             ("settings", "Cài đặt", "/settings")]


def test_the_admin_shell_shows_nine_tabs_with_the_current_one_marked(client):
    html = client.get("/", headers=MANAGER).text
    nav = re.search(r'<nav class="tabs".*?</nav>', html, re.S).group(0)
    links = re.findall(r'<a href="([^"]+)"( aria-current="page")?>([^<]+)</a>', nav)
    assert [(label, href) for href, _, label in links] == [(label, f"/apps/tea-tour{path}") for _, label, path in TAB_PATHS]
    assert [label for _, current, label in links if current] == ["Tổng quan"]
    assert "HTX TC" in html and "admin." in html and "dxos-app.css" in html
    assert [label for _, current, label in re.findall(r'<a href="([^"]+)"( aria-current="page")?>([^<]+)</a>',
            re.search(r'<nav class="tabs".*?</nav>', client.get("/tours", headers=MANAGER).text, re.S).group(0))
            if current] == ["Tour"]


def test_theme_is_carried_into_the_tabs_and_set_on_the_page(client):
    html = client.get("/?theme=dark", headers=MANAGER).text
    assert '<html lang="vi" data-theme="dark">' in html
    assert 'href="/apps/tea-tour/tours?theme=dark"' in html
    assert "data-theme" not in client.get("/?theme=neon", headers=MANAGER).text.split("<head>")[0]


def test_the_customer_shell_has_tokens_referrer_meta_and_no_dxos_stylesheet(client, db):
    html = client.get("/public/TC?theme=light").text
    assert 'name="referrer" content="no-referrer"' in html and 'data-theme="light"' in html
    assert re.search(r'href="/apps/tea-tour/public/TC/assets/tokens\.[0-9a-f]{10}\.css"', html)
    assert "dxos-app.css" not in html and '<main id="main">' in html and 'class="skip-link"' in html


def test_the_guide_stub_and_the_overview_stub_render(client):
    assert client.get("/guide", headers=FARMER).status_code == 200
    assert client.get("/tours", headers=MANAGER).status_code == 200


def test_opening_the_overview_sweeps_expired_holds(client, db):
    departure = add_departure(db, add_tour(db))
    expired = add_booking(db, departure, deposit_vnd=50_000, hold_until=NOW - timedelta(hours=1))
    assert client.get("/", headers=MANAGER).status_code == 200
    assert db.execute("SELECT status, cancel_reason FROM bookings WHERE id = %s", (expired,)).fetchone() == (
        "CANCELLED", "Quá hạn giữ chỗ")


# ---------- helpers ----------

def test_href_and_site_href():
    assert web.href("/tours") == "/apps/tea-tour/tours"
    assert web.href("/tours", "dark", page=2, q=None) == "/apps/tea-tour/tours?page=2&theme=dark"
    assert web.href("/bookings", q="a b&c") == "/apps/tea-tour/bookings?q=a+b%26c"
    assert web.site_href("TC", "/tours/x", "light", month="2030-05") == "/apps/tea-tour/public/TC/tours/x?month=2030-05&theme=light"
    assert web.site_href("TC", "/") == "/apps/tea-tour/public/TC/"


def test_static_url_fails_loudly_for_an_unknown_file():
    with pytest.raises(KeyError):
        assets.static_url("typo.css")


def test_actor_of_takes_the_name_from_the_token():
    claims = Claims(sub="kc-1", name="Trưởng HTX", htx_code="TC", roles=("manager",))
    actor = web.actor_of(claims, "MANAGER")
    assert (actor.kind, actor.name, actor.user_id) == ("MANAGER", "Trưởng HTX", "kc-1")
    assert web.actor_of(Claims("kc-2", "", "TC", ()), "GUIDE").name == "kc-2"


def test_every_stub_router_exposes_router():
    from tea_tour.routes import admin_catalog, admin_sales, guide, public
    from tea_tour.routes import assets as asset_routes
    for module in (admin_catalog, admin_sales, guide, public, asset_routes):
        assert hasattr(module, "router")
