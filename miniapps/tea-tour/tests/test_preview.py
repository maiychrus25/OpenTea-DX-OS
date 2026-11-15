# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The preview server's seed and wrapper (the server itself needs Docker for its own database, so it is not started here)."""
import re

import pytest
from fastapi.testclient import TestClient

import preview
from tea_tour import web
from tea_tour.store import core, media as media_store


@pytest.fixture
def demo(db, app_db_url):
    ids = preview.seed(db)
    with TestClient(preview.make_app(app_db_url), follow_redirects=False, raise_server_exceptions=False) as client:
        yield db, ids, client


def count(db, table, where="true"):
    return db.execute(f"SELECT count(*) FROM {table} WHERE {where}").fetchone()[0]


def test_the_seed_covers_every_table_and_every_state(demo):
    db, ids, _ = demo
    assert count(db, "tours", "htx_code = 'TC'") == 4
    assert {r[0] for r in db.execute("SELECT status FROM tours WHERE htx_code = 'TC'")} == {"PUBLISHED", "DRAFT"}
    assert {r[0] for r in db.execute("SELECT status FROM departures")} == {"OPEN", "CLOSED", "CANCELLED"}
    assert {r[0] for r in db.execute("SELECT status FROM bookings")} == {"PENDING", "CONFIRMED", "CANCELLED"}
    assert {r[0] for r in db.execute("SELECT status FROM reviews")} == {"PENDING", "PUBLISHED", "HIDDEN"}
    assert {r[0] for r in db.execute("SELECT status FROM inquiries")} == {"NEW", "CONTACTED", "CLOSED"}
    assert count(db, "payments") > 5 and count(db, "booking_events") > 20 and count(db, "settings", "htx_code = 'TC'") == 1
    assert count(db, "media", "htx_code = 'TC'") >= 10 and count(db, "bookings", "htx_code = 'LB'") == 1
    assert count(db, "bookings", "guest_paid_reported_at IS NOT NULL") >= 1
    assert count(db, "bookings", "checked_in_at IS NOT NULL") >= 3


def test_the_seed_shows_each_money_state(demo):
    db, ids, _ = demo
    states = {core.get_booking(db, "TC", i).payment_state for i in ids["bookings"].values()}
    assert {"UNPAID", "DEPOSITED", "PAID", "REFUND_DUE"} <= states


def test_the_seed_has_a_full_departure_and_an_expired_hold_that_frees_its_seats(demo):
    db, ids, _ = demo
    load = lambda name: db.execute("SELECT seats_used FROM departure_load WHERE departure_id = %s",  # noqa: E731
                                   (ids["departures"][name],)).fetchone()[0]
    assert load("crafting_full") == 10 == db.execute("SELECT seats FROM departures WHERE id = %s",
                                                     (ids["departures"]["crafting_full"],)).fetchone()[0]
    before = load("picking_soon")
    assert core.sweep(db, "TC") >= 1
    assert load("picking_soon") == before  # the expired hold was already free: sweeping changes no seat count


def test_the_wrapper_picks_the_role_from_the_path_and_adds_the_csp(demo):
    _, _, client = demo
    manager = client.get("/apps/tea-tour/")
    assert manager.status_code == 200 and "Tổng quan" in manager.text
    assert manager.headers["content-security-policy"].startswith("default-src 'self'; script-src 'none'")
    assert client.get("/apps/tea-tour/guide").status_code == 200
    assert client.get("/apps/tea-tour/?as=farmer").status_code == 403
    assert client.get("/apps/tea-tour/guide?as=manager").status_code == 403
    public = client.get("/apps/tea-tour/public/TC")
    assert public.status_code == 200 and "content-security-policy" in public.headers
    assert client.get("/dxos-app.css").status_code == 200 and client.get("/").status_code == 302


def test_every_public_photo_of_the_seed_is_served_and_drafts_are_not(demo):
    db, ids, client = demo
    published = db.execute("SELECT m.id FROM tour_media tm JOIN tours t ON t.id = tm.tour_id JOIN media m ON m.id = tm.media_id "
                           "WHERE t.status = 'PUBLISHED'").fetchall()
    draft = db.execute("SELECT m.id FROM tour_media tm JOIN tours t ON t.id = tm.tour_id JOIN media m ON m.id = tm.media_id "
                       "WHERE t.status = 'DRAFT'").fetchall()
    assert len(published) >= 9 and draft
    for (media_id,) in published:
        assert client.get(f"/apps/tea-tour/public/TC/media/{media_id}-thumb.jpg").status_code == 200
    for (media_id,) in draft:
        assert client.get(f"/apps/tea-tour/public/TC/media/{media_id}-thumb.jpg").status_code == 404
        assert client.get(f"/apps/tea-tour/media/{media_id}-thumb.jpg").status_code == 200  # the manager still sees it
