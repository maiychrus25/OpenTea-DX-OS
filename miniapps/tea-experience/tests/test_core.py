# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import io
import json
import urllib.error
from decimal import Decimal

import pytest

from tea_experience import core_client
from tea_experience.core_client import CoreError, parse_snapshot


def reply(parcels=None, cycles=None, profile_htx="TC", profiles=None, households=None):
    """A reply shaped like the core's real columns (apps/web/prisma/schema.prisma)."""
    if profiles is None:
        profiles = [{"htx_code": profile_htx, "name": "HTX Tân Cương", "address": "Tân Cương, Đại Từ",
                     "crop_types": ["Chè Trung du", "Chè Kim Tuyên"], "season_label": "Lứa 1/2026",
                     "total_area_ha": 12.5}]
    if households is None:
        households = [{"id": "h1"}, {"id": "h2"}, {"id": "h3"}]
    if parcels is None:
        parcels = [{"id": "p1", "parcel_code": "P-TC-001", "crop_type": "Chè Trung du",
                    "centroid_lat": 21.6123456, "centroid_lng": 105.7000001},
                   {"id": "p2", "parcel_code": "P-TC-002", "crop_type": "Chè Kim Tuyên",
                    "centroid_lat": None, "centroid_lng": 105.7},
                   {"id": "p3", "parcel_code": "P-TC-003", "crop_type": "Chè Trung du",
                    "centroid_lat": 91, "centroid_lng": 105.7}]
    if cycles is None:
        cycles = [{"parcel_id": "p1", "season": "Lứa 1/2026"},
                  {"parcel_id": "p1", "season": "Lứa 2/2026"},  # second open cycle of the same parcel: ignored
                  {"parcel_id": "p2", "season": None}]
    return {"htx_profiles": profiles, "households": households, "parcels": parcels, "parcel_crop_cycles": cycles}


def test_parse_keeps_usable_parcels_and_counts_the_rest():
    snap = parse_snapshot(reply(), "TC")
    assert [p.parcel_code for p in snap.parcels] == ["P-TC-001"]
    assert snap.skipped == 2  # no coordinates, and latitude 91 out of range
    parcel = snap.parcels[0]
    assert parcel.lat == Decimal("21.6123456") and parcel.lng == Decimal("105.7000001")
    assert parcel.crop == "Chè Trung du"  # parcels.crop_type
    assert (parcel.season, parcel.planting) == ("Lứa 1/2026", True)  # first open cycle wins


def test_parcel_without_open_cycle_is_not_planting():
    snap = parse_snapshot(reply(cycles=[]), "TC")
    assert snap.parcels[0].planting is False and snap.parcels[0].season is None


def test_profile_maps_real_columns_and_joins_crop_types():
    profile = parse_snapshot(reply(), "TC").profile
    assert profile.htx_code == "TC" and profile.name == "HTX Tân Cương"
    assert profile.address == "Tân Cương, Đại Từ"
    assert profile.crop_types == "Chè Trung du, Chè Kim Tuyên"
    assert profile.season_label == "Lứa 1/2026"
    assert profile.total_area_ha == Decimal("12.50")


def test_member_count_is_the_number_of_household_ids():
    assert parse_snapshot(reply(households=[]), "TC").profile.member_count == 0
    assert parse_snapshot(reply(), "TC").profile.member_count == 3
    mixed = [{"id": "h1"}, "junk", {"id": ""}, {"name": "no id"}]
    assert parse_snapshot(reply(households=mixed), "TC").profile.member_count == 1


def test_parse_refuses_a_profile_of_another_htx():
    with pytest.raises(CoreError) as info:
        parse_snapshot(reply(profile_htx="LB"), "TC")
    assert info.value.code == core_client.WRONG_HTX


def test_parse_without_profile_is_a_named_error():
    with pytest.raises(CoreError) as info:
        parse_snapshot(reply(profiles=[]), "TC")
    assert info.value.code == core_client.NO_PROFILE


@pytest.mark.parametrize("bad", [
    {"htx_profiles": "x", "households": [], "parcels": [], "parcel_crop_cycles": []},
    {"htx_profiles": [], "households": [], "parcels": None, "parcel_crop_cycles": []},
    {"htx_profiles": [], "parcels": [], "parcel_crop_cycles": []},  # no households list
])
def test_parse_wrong_shape_is_a_bad_response(bad):
    with pytest.raises(CoreError) as info:
        parse_snapshot(bad, "TC")
    assert info.value.code == core_client.BAD_RESPONSE


def test_duplicate_codes_and_bad_values_are_skipped_not_fatal():
    parcels = [{"id": "a", "parcel_code": "X", "centroid_lat": 21, "centroid_lng": 105},
               {"id": "b", "parcel_code": "X", "centroid_lat": 21, "centroid_lng": 105},  # duplicate code
               {"id": "c", "parcel_code": "Y", "centroid_lat": float("nan"), "centroid_lng": 105},
               {"id": "d", "parcel_code": "Z", "centroid_lat": True, "centroid_lng": 105},  # bool is not a number
               {"id": None, "parcel_code": "W", "centroid_lat": 21, "centroid_lng": 105},
               "not a dict"]
    snap = parse_snapshot(reply(parcels=parcels, cycles=[]), "TC")
    assert [p.parcel_code for p in snap.parcels] == ["X"]
    assert snap.skipped == 5


def test_text_is_trimmed_and_capped_and_blank_is_none():
    profile = parse_snapshot(reply(profiles=[{"htx_code": "TC", "name": "  " + "A" * 300 + "  ", "address": "   ",
                                              "crop_types": "not a list", "total_area_ha": "abc"}]), "TC").profile
    assert profile.name == "A" * 200
    assert profile.address is None and profile.crop_types is None and profile.total_area_ha is None


class FakeReply(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def fake_open(payload: bytes):
    def opener(request, timeout):
        assert timeout == core_client.TIMEOUT_S
        assert request.get_header("X-hasura-role") == "manager"
        assert request.get_header("Authorization") == "Bearer abc"
        return FakeReply(payload)
    return opener


def test_fetch_passes_the_token_and_parses_the_data(monkeypatch):
    body = json.dumps({"data": reply()}).encode()
    monkeypatch.setattr(core_client.urllib.request, "urlopen", fake_open(body))
    snap = core_client.fetch_snapshot("Bearer abc", "TC")
    assert len(snap.parcels) == 1


def test_fetch_timeout_is_unavailable(monkeypatch):
    def slow(request, timeout):
        raise TimeoutError("timed out")
    monkeypatch.setattr(core_client.urllib.request, "urlopen", slow)
    with pytest.raises(CoreError) as info:
        core_client.fetch_snapshot("Bearer abc", "TC")
    assert info.value.code == core_client.UNAVAILABLE


def test_fetch_connection_refused_is_unavailable(monkeypatch):
    def refused(request, timeout):
        raise urllib.error.URLError("connection refused")
    monkeypatch.setattr(core_client.urllib.request, "urlopen", refused)
    with pytest.raises(CoreError) as info:
        core_client.fetch_snapshot("Bearer abc", "TC")
    assert info.value.code == core_client.UNAVAILABLE


@pytest.mark.parametrize("payload", [
    b"<html>502 bad gateway</html>",  # not JSON
    json.dumps({"errors": [{"message": "field not found"}], "data": None}).encode(),  # GraphQL error
    json.dumps(["list"]).encode(),
])
def test_fetch_bad_body_is_bad_response(monkeypatch, payload):
    monkeypatch.setattr(core_client.urllib.request, "urlopen", fake_open(payload))
    with pytest.raises(CoreError) as info:
        core_client.fetch_snapshot("Bearer abc", "TC")
    assert info.value.code == core_client.BAD_RESPONSE


def test_fetch_oversized_reply_is_refused(monkeypatch):
    big = b"{" + b" " * (core_client.MAX_REPLY_BYTES + 10) + b"}"
    monkeypatch.setattr(core_client.urllib.request, "urlopen", fake_open(big))
    with pytest.raises(CoreError) as info:
        core_client.fetch_snapshot("Bearer abc", "TC")
    assert info.value.code == core_client.BAD_RESPONSE
