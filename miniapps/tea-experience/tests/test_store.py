# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from decimal import Decimal
from uuid import uuid4

import psycopg
import pytest
from conftest import add_experience, add_intro, add_site

from tea_experience import store
from tea_experience.core_client import Parcel, Profile, Snapshot


def snapshot(htx="TC", parcels=(), name="HTX Tân Cương", skipped=0):
    profile = Profile(htx_code=htx, name=name, address="Tân Cương, Đại Từ", crop_types="Chè Trung du",
                      season_label="Lứa 1/2026", total_area_ha=Decimal("12.50"), member_count=40)
    return Snapshot(profile=profile, parcels=tuple(parcels), skipped=skipped)


def parcel(code, crop=None, planting=False):
    return Parcel(parcel_code=code, lat=Decimal("21.6100000"), lng=Decimal("105.7000000"), crop=crop,
                  season="Lứa 1/2026" if planting else None, planting=planting)


def test_every_table_has_a_not_null_htx_code(db):
    rows = db.execute("""SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                         WHERE n.nspname = 'app_tea_experience' AND c.relkind = 'r'
                           AND c.relname <> 'schema_migrations'""").fetchall()
    names = {r[0] for r in rows}
    assert {"htx_intro", "sites", "experiences", "experience_sites", "season_notes", "core_parcels",
            "core_sync_log"} <= names
    for (name,) in rows:
        col = db.execute("""SELECT a.attnotnull FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                            WHERE c.relname = %s AND a.attname = 'htx_code' AND NOT a.attisdropped""",
                         (name,)).fetchone()
        assert col == (True,), f"{name} lacks htx_code NOT NULL"


def test_coordinates_come_in_pairs(db):
    with pytest.raises(psycopg.errors.CheckViolation):
        add_site(db, lat=Decimal("21.0"), lng=None)


def test_latitude_out_of_range_is_refused(db):
    with pytest.raises(psycopg.errors.CheckViolation):
        add_site(db, lat=Decimal("95"), lng=Decimal("105"))


def test_months_are_a_subset_of_one_to_twelve(db):
    with pytest.raises(psycopg.errors.CheckViolation):
        add_experience(db, months=(13,))


def test_price_and_duration_bounds(db):
    with pytest.raises(psycopg.errors.CheckViolation):
        add_experience(db, price=-1)
    with pytest.raises(psycopg.errors.CheckViolation):
        add_experience(db, duration=14)


def test_experience_cannot_link_another_htxs_site(db):
    """The composite foreign key with htx_code refuses a cross-HTX link even if the app forgot to check."""
    their_site = add_site(db, htx="LB")
    exp = add_experience(db, htx="TC")
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        db.execute("INSERT INTO experience_sites (htx_code, experience_id, site_id) VALUES ('TC', %s, %s)",
                   (exp, their_site))


def test_deleting_a_site_removes_its_links_only(db):
    site = add_site(db)
    keep = add_site(db, name="Cây chè cổ")
    exp = add_experience(db, sites=[site, keep])
    store.delete_site(db, "TC", site)
    assert store.linked_site_ids(db, "TC", exp) == [keep]


def test_save_snapshot_keeps_the_intro_text_and_replaces_parcels(db):
    add_intro(db, intro_text="Lời của trưởng HTX")
    store.save_snapshot(db, "TC", "Nguyễn Văn A", snapshot(parcels=[parcel("TC-01", "Chè"), parcel("TC-02")]))
    intro = store.get_intro(db, "TC")
    assert intro.intro_text == "Lời của trưởng HTX"
    assert intro.name == "HTX Tân Cương" and intro.synced_at is not None
    assert [p.parcel_code for p in store.core_parcels(db, "TC")] == ["TC-01", "TC-02"]

    store.save_snapshot(db, "TC", "Nguyễn Văn A", snapshot(parcels=[parcel("TC-09")], skipped=2))
    assert [p.parcel_code for p in store.core_parcels(db, "TC")] == ["TC-09"]
    last = store.last_sync(db, "TC")
    assert (last.result, last.parcels, last.skipped, last.actor) == ("OK", 1, 2, "Nguyễn Văn A")


def test_failed_refresh_keeps_the_old_copy(db):
    add_intro(db, name="Bản cũ")
    store.save_snapshot(db, "TC", "A", snapshot(parcels=[parcel("TC-01")]))
    store.log_sync_failure(db, "TC", "A", "core_unavailable")
    assert store.get_intro(db, "TC").name == "HTX Tân Cương"  # the OK refresh stays
    assert [p.parcel_code for p in store.core_parcels(db, "TC")] == ["TC-01"]
    last = store.last_sync(db, "TC")
    assert last.result == "ERROR" and last.detail == "core_unavailable"


def test_crop_hint_counts_only_parcels_with_an_open_cycle(db):
    store.save_snapshot(db, "TC", "A", snapshot(parcels=[parcel("TC-01", "Chè", True), parcel("TC-02", "Chè", True),
                                                         parcel("TC-03", "Chè", False)]))
    assert store.crop_hint(db, "TC") == [("Chè", "Lứa 1/2026", 2)]


def test_refresh_never_overwrites_the_managers_own_fields(db):
    add_intro(db, intro_text="Lời tôi viết", locality="Tân Cương", certification="VietGAP", synced=False)
    store.save_snapshot(db, "TC", "A", snapshot())
    intro = store.get_intro(db, "TC")
    assert (intro.intro_text, intro.locality_public, intro.certification) == ("Lời tôi viết", "Tân Cương", "VietGAP")
    assert intro.address == "Tân Cương, Đại Từ" and intro.crop_types == "Chè Trung du"
    assert intro.member_count == 40 and intro.season_label == "Lứa 1/2026"


def test_queries_never_cross_htx(db):
    mine = add_site(db, htx="TC")
    theirs = add_site(db, htx="LB")
    add_experience(db, htx="LB", name="Gói của La Bằng")
    assert [s.id for s in store.list_sites(db, "TC")] == [mine]
    assert store.get_site(db, "TC", theirs) is None
    assert store.list_experiences(db, "TC") == []
    assert store.set_site_public(db, "TC", theirs, True) is False
    assert store.delete_site(db, "TC", theirs) is False
    assert store.delete_experience(db, "TC", uuid4()) is False


def test_save_season_notes_adds_updates_and_clears(db):
    store.save_season_notes(db, "TC", {1: "Tết, ít việc", 2: "Đầu xuân", 3: "Hái chè xuân"})
    store.save_season_notes(db, "TC", {1: None, 2: "Đầu xuân, búp non", 3: "Hái chè xuân"})
    assert store.season_notes(db, "TC") == {2: "Đầu xuân, búp non", 3: "Hái chè xuân"}


def test_overview_counts(db):
    add_site(db, is_public=True)
    add_site(db, is_public=False)
    add_experience(db, is_visible=True)
    add_experience(db, is_visible=False)
    store.save_season_notes(db, "TC", {4: "Hái chè xuân muộn"})
    overview = store.overview(db, "TC")
    assert (overview.sites_total, overview.sites_public) == (2, 1)
    assert (overview.experiences_total, overview.experiences_visible) == (2, 1)
    assert overview.months_with_notes == 1
