# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Migration 002 on top of a database that holds tea-tour 0.2.0 data (spec 8, "Chuyển dữ liệu")."""
import shutil
from datetime import datetime, timedelta, timezone

import psycopg
import pytest
from conftest import APP_DIR
from dxos_cli.database import drop_app_database, ensure_app_database, missing_htx_columns
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row

APP_ID = "tea-tour-mig"  # its own schema, so the shared fixture's database is never touched
NOW = datetime.now(timezone.utc)
FUTURE, PAST = NOW + timedelta(days=9), NOW - timedelta(days=9)
CANCELLED_TOUR_REASON = "HTX huỷ chuyến"
STALE_REASON = "Chuyến đã khởi hành mà chưa được xác nhận"


@pytest.fixture
def old_db(pg_url, tmp_path):
    """A schema with migration 001 only; yields (admin connection, app connection, migrations directory)."""
    only_001 = tmp_path / "migrations"
    only_001.mkdir()
    shutil.copy(APP_DIR / "migrations" / "001_init.sql", only_001)
    with psycopg.connect(pg_url, autocommit=True) as admin:
        drop_app_database(admin, APP_ID)
        password = ensure_app_database(admin, APP_ID, only_001)
        url = make_conninfo(pg_url, user="app_tea_tour_mig", password=password)
        with psycopg.connect(url, autocommit=True, options="-c search_path=app_tea_tour_mig",
                             row_factory=dict_row) as app:
            yield admin, app, only_001
        drop_app_database(admin, APP_ID)


def add_old_tour(app, htx, title, starts_at, status="OPEN", seats=8, price=250_000, guide=("kc-guide", "Hộ ông Ba")):
    return app.execute(
        """INSERT INTO tours (htx_code, title, starts_at, meeting_point, seats, price_vnd, description,
                              guide_user_id, guide_name, status)
           VALUES (%s, %s, %s, 'Nhà văn hoá xóm', %s, %s, 'Mô tả cũ', %s, %s, %s) RETURNING id""",
        (htx, title, starts_at, seats, price, guide[0], guide[1], status)).fetchone()["id"]


def add_old_booking(app, htx, tour, code, party, status):
    return app.execute(
        """INSERT INTO bookings (htx_code, tour_id, code, guest_name, phone, party_size, note, status)
           VALUES (%s, %s, %s, 'Khách cũ', '0912345678', %s, 'ghi chú', %s) RETURNING id""",
        (htx, tour, code, party, status)).fetchone()["id"]


@pytest.fixture
def seeded(old_db):
    admin, app, migrations = old_db
    ids = {
        "open": add_old_tour(app, "TC", "Tour mở", FUTURE),
        "cancelled": add_old_tour(app, "TC", "Tour đã huỷ", FUTURE, status="CANCELLED", price=300_000),
        "past": add_old_tour(app, "TC", "Tour đã qua", PAST, price=100_000, guide=(None, None)),
        "other": add_old_tour(app, "LB", "Tour La Bằng", FUTURE, seats=20, price=180_000),
    }
    ids["open_pending"] = add_old_booking(app, "TC", ids["open"], "AAAA2222", 2, "PENDING")
    ids["open_confirmed"] = add_old_booking(app, "TC", ids["open"], "AAAA3333", 3, "CONFIRMED")
    ids["cancelled_pending"] = add_old_booking(app, "TC", ids["cancelled"], "BBBB2222", 1, "PENDING")
    ids["cancelled_confirmed"] = add_old_booking(app, "TC", ids["cancelled"], "BBBB3333", 4, "CONFIRMED")
    ids["cancelled_cancelled"] = add_old_booking(app, "TC", ids["cancelled"], "BBBB4444", 2, "CANCELLED")
    ids["past_pending"] = add_old_booking(app, "TC", ids["past"], "CCCC2222", 2, "PENDING")
    ids["past_confirmed"] = add_old_booking(app, "TC", ids["past"], "CCCC3333", 5, "CONFIRMED")
    ids["other_confirmed"] = add_old_booking(app, "LB", ids["other"], "DDDD2222", 6, "CONFIRMED")
    ensure_app_database(admin, APP_ID, APP_DIR / "migrations")  # applies 002 as the app role
    return app, ids


def booking(app, booking_id):
    return app.execute("SELECT * FROM bookings WHERE id = %s", (booking_id,)).fetchone()


def test_upgrade_from_0_2_0_keeps_every_booking(seeded):
    app, ids = seeded
    # Item 4: no row is deleted.
    assert app.execute("SELECT count(*) AS n FROM tours").fetchone()["n"] == 4
    assert app.execute("SELECT count(*) AS n FROM departures").fetchone()["n"] == 4
    assert app.execute("SELECT count(*) AS n FROM bookings").fetchone()["n"] == 8


def test_each_old_tour_becomes_a_tour_and_one_departure(seeded):
    app, ids = seeded
    expected = {"open": ("PUBLISHED", "OPEN", 250_000, 8), "cancelled": ("ARCHIVED", "CANCELLED", 300_000, 8),
                "past": ("PUBLISHED", "OPEN", 100_000, 8), "other": ("PUBLISHED", "OPEN", 180_000, 20)}
    for key, (tour_status, departure_status, price, seats) in expected.items():
        tour = app.execute("SELECT * FROM tours WHERE id = %s", (ids[key],)).fetchone()
        assert tour["status"] == tour_status
        assert tour["price_adult_vnd"] == tour["price_child_vnd"] == price
        assert tour["default_seats"] == seats and tour["category"] == "SIGHTSEEING" and tour["duration_minutes"] == 180
        assert tour["slug"] == "tour-" + str(ids[key])[:8]
        assert tour["meeting_point"] == "Nhà văn hoá xóm" and tour["description"] == "Mô tả cũ"
        assert tour["itinerary"] == [] and tour["faq"] == [] and tour["cover_media_id"] is None
        departures = app.execute("SELECT * FROM departures WHERE tour_id = %s", (ids[key],)).fetchall()
        assert len(departures) == 1
        departure = departures[0]
        assert departure["status"] == departure_status and departure["seats"] == seats
        assert departure["price_adult_vnd"] == departure["price_child_vnd"] == price
        assert departure["htx_code"] == tour["htx_code"]
    old_open = app.execute("SELECT * FROM tours t JOIN departures d ON d.tour_id = t.id WHERE t.id = %s",
                           (ids["open"],)).fetchone()
    assert old_open["guide_user_id"] == "kc-guide" and old_open["guide_name"] == "Hộ ông Ba"
    assert abs((old_open["starts_at"] - FUTURE).total_seconds()) < 1
    columns = {r["column_name"] for r in app.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'app_tea_tour_mig' "
        "AND table_name = 'tours'").fetchall()}
    assert not columns & {"starts_at", "seats", "price_vnd", "guide_user_id", "guide_name"}


def test_each_booking_points_to_the_departure_of_its_old_tour(seeded):
    app, ids = seeded
    price = {"open": 250_000, "cancelled": 300_000, "past": 100_000, "other": 180_000}
    for name, tour_key, party in (("open_pending", "open", 2), ("open_confirmed", "open", 3),
                                  ("cancelled_confirmed", "cancelled", 4), ("past_confirmed", "past", 5),
                                  ("other_confirmed", "other", 6)):
        row = booking(app, ids[name])
        departure = app.execute("SELECT tour_id FROM departures WHERE id = %s", (row["departure_id"],)).fetchone()
        assert departure["tour_id"] == ids[tour_key]
        assert (row["adults"], row["children"], row["party_size"]) == (party, 0, party)
        assert row["price_adult_vnd"] == row["price_child_vnd"] == price[tour_key]
        assert row["total_vnd"] == party * price[tour_key]
        assert (row["deposit_vnd"], row["paid_vnd"], row["hold_until"], row["source"]) == (0, 0, None, "WEB")
        assert row["note"] == "ghi chú" and row["guest_name"] == "Khách cũ" and row["phone"] == "0912345678"
        assert len(row["access_key"]) == 22 and row["request_key"]


def test_keys_are_random_and_unique(seeded):
    app, _ = seeded
    rows = app.execute("SELECT request_key, access_key, code FROM bookings").fetchall()
    assert len({r["request_key"] for r in rows}) == 8 and len({r["access_key"] for r in rows}) == 8
    assert {r["code"] for r in rows} >= {"AAAA2222", "DDDD2222"}  # codes are kept


def test_statuses_follow_the_new_rules(seeded):
    app, ids = seeded
    assert booking(app, ids["open_pending"])["status"] == "PENDING"
    assert booking(app, ids["open_confirmed"])["status"] == "CONFIRMED"
    assert booking(app, ids["past_confirmed"])["status"] == "CONFIRMED"
    assert booking(app, ids["other_confirmed"])["status"] == "CONFIRMED"
    for name, reason in (("cancelled_pending", CANCELLED_TOUR_REASON), ("cancelled_confirmed", CANCELLED_TOUR_REASON),
                         ("past_pending", STALE_REASON)):
        row = booking(app, ids[name])
        assert (row["status"], row["cancel_reason"], row["cancelled_by"]) == ("CANCELLED", reason, "SYSTEM")
        assert row["cancelled_at"] is not None
        events = app.execute("SELECT * FROM booking_events WHERE booking_id = %s", (ids[name],)).fetchall()
        assert len(events) == 1
        assert (events[0]["actor_kind"], events[0]["kind"], events[0]["detail"]) == ("SYSTEM", "CANCELLED", reason)
        assert events[0]["htx_code"] == "TC"
    already = booking(app, ids["cancelled_cancelled"])
    assert already["status"] == "CANCELLED" and already["cancel_reason"] is None
    assert app.execute("SELECT count(*) AS n FROM booking_events").fetchone()["n"] == 3


def test_departure_load_counts_only_holding_seats(seeded):
    app, ids = seeded
    load = {r["departure_id"]: r for r in app.execute("SELECT * FROM departure_load").fetchall()}
    by_tour = {k: app.execute("SELECT id FROM departures WHERE tour_id = %s", (ids[k],)).fetchone()["id"]
               for k in ("open", "cancelled", "past", "other")}
    assert (load[by_tour["open"]]["seats_used"], load[by_tour["open"]]["confirmed_guests"]) == (5, 3)
    assert (load[by_tour["cancelled"]]["seats_used"], load[by_tour["cancelled"]]["confirmed_guests"]) == (0, 0)
    assert (load[by_tour["past"]]["seats_used"], load[by_tour["past"]]["confirmed_guests"]) == (5, 5)
    assert load[by_tour["other"]]["htx_code"] == "LB"


def test_every_table_has_htx_code_not_null(seeded, old_db):
    admin, _, _ = old_db
    assert missing_htx_columns(admin, "app_tea_tour_mig") == []
    tables = {r[0] for r in admin.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'app_tea_tour_mig' "
        "AND table_type = 'BASE TABLE'").fetchall()}
    assert tables >= {"settings", "media", "tours", "tour_media", "departures", "bookings", "payments",
                      "booking_events", "reviews", "inquiries", "schema_migrations"}


def test_composite_foreign_keys_keep_cooperatives_apart(seeded):
    app, ids = seeded
    departure = app.execute("SELECT id FROM departures WHERE tour_id = %s", (ids["other"],)).fetchone()["id"]
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        app.execute("""INSERT INTO bookings (htx_code, departure_id, code, guest_name, phone, adults, children,
                                             price_adult_vnd, price_child_vnd, total_vnd, deposit_vnd,
                                             request_key, access_key)
                       VALUES ('TC', %s, 'ZZZZ2222', 'x', '0912345678', 1, 0, 0, 0, 0, 0, 'r' || gen_random_uuid(),
                               'abcdefghijklmnopqrstuv')""", (departure,))
