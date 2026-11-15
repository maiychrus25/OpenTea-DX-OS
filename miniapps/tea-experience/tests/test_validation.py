# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from decimal import Decimal
from uuid import uuid4

import pytest

from tea_experience import main, store


def site_form(**overrides) -> dict:
    form = {"name": "Xưởng sao chè", "description": "", "latitude": "", "longitude": "", "parcel_code": "",
            "sort_order": "", "public": "1"}
    form.update(overrides)
    return form


def exp_form(**overrides) -> dict:
    form = {"name": "Sao chè thủ công", "description": "", "duration_min": "120", "price_vnd": "150000",
            "sort_order": "", "months": ["3", "4"], "sites": [], "visible": "1"}
    form.update(overrides)
    return form


PARCELS = {"TC-01": store.CoreParcel(parcel_code="TC-01", centroid_lat=Decimal("21.6100000"),
                                     centroid_lng=Decimal("105.7000000"), crop="Chè", season=None, planting=False)}


@pytest.mark.parametrize("raw, limit, expected", [
    ("21,0285", 90, Decimal("21.0285")),
    ("21.0285", 90, Decimal("21.0285")),
    ("-180", 180, Decimal("-180")),
    ("  105,8542 ", 180, Decimal("105.8542")),
    ("91", 90, None),
    ("abc", 90, None),
    ("1e3", 90, None),
    ("21.12345678", 90, None),  # more than 7 decimals
    ("", 90, None),
])
def test_coordinates_are_checked(raw, limit, expected):
    assert main.parse_coord(raw, limit) == expected


def test_site_values_pass_and_default_public_false():
    values, errors = main.read_site_form(site_form(public=""), {})
    assert errors == [] and values["is_public"] is False and values["latitude"] is None


def test_site_needs_both_coordinates_or_none():
    _, errors = main.read_site_form(site_form(latitude="21.0"), {})
    assert any("cả vĩ độ và kinh độ" in e for e in errors)


def test_site_latitude_and_longitude_ranges():
    _, errors = main.read_site_form(site_form(latitude="95", longitude="105.8"), {})
    assert any("Vĩ độ" in e for e in errors)
    _, errors = main.read_site_form(site_form(latitude="21", longitude="181"), {})
    assert any("Kinh độ" in e for e in errors)


def test_site_name_and_description_length():
    _, errors = main.read_site_form(site_form(name="   "), {})
    assert any("Tên điểm" in e for e in errors)
    _, errors = main.read_site_form(site_form(name="A" * 121), {})
    assert any("Tên điểm" in e for e in errors)
    _, errors = main.read_site_form(site_form(description="x" * 501), {})
    assert any("Mô tả tối đa 500" in e for e in errors)


def test_site_sort_order_range():
    _, errors = main.read_site_form(site_form(sort_order="1000"), {})
    assert any("Thứ tự" in e for e in errors)
    values, errors = main.read_site_form(site_form(sort_order="7"), {})
    assert errors == [] and values["sort_order"] == 7


def test_parcel_copies_its_point_when_no_coordinates_typed():
    values, errors = main.read_site_form(site_form(parcel_code="TC-01"), PARCELS)
    assert errors == []
    assert values["latitude"] == Decimal("21.6100000") and values["parcel_code"] == "TC-01"


def test_typed_coordinates_win_over_the_parcel():
    values, errors = main.read_site_form(site_form(parcel_code="TC-01", latitude="21,5", longitude="105,5"), PARCELS)
    assert errors == [] and values["latitude"] == Decimal("21.5")


def test_unknown_parcel_is_refused_with_a_message():
    _, errors = main.read_site_form(site_form(parcel_code="NOPE"), PARCELS)
    assert any("Thửa đã chọn" in e for e in errors)


def test_experience_values_and_month_normalisation():
    known = set()
    values, site_ids, errors = main.read_experience_form(exp_form(months=["4", "3", "4"]), known)
    assert errors == [] and values["months"] == [3, 4] and site_ids == []
    assert values["duration_min"] == 120 and values["price_vnd"] == 150000 and values["is_visible"] is True


@pytest.mark.parametrize("override, message", [
    ({"duration_min": "10"}, "Thời lượng"),
    ({"duration_min": "1441"}, "Thời lượng"),
    ({"price_vnd": "-1"}, "Giá tham khảo"),
    ({"price_vnd": "1000000001"}, "Giá tham khảo"),
    ({"price_vnd": "15.5"}, "Giá tham khảo"),
    ({"months": ["13"]}, "Tháng phù hợp"),
    ({"months": ["0"]}, "Tháng phù hợp"),
    ({"name": ""}, "Tên gói"),
    ({"description": "x" * 1001}, "Mô tả tối đa 1000"),
    ({"sites": ["not-a-uuid"]}, "không hợp lệ"),
])
def test_experience_rejects_bad_input(override, message):
    _, _, errors = main.read_experience_form(exp_form(**override), set())
    assert any(message in e for e in errors), errors


def test_experience_site_must_belong_to_this_htx():
    mine, theirs = uuid4(), uuid4()
    _, _, errors = main.read_experience_form(exp_form(sites=[str(theirs)]), {mine})
    assert any("không thuộc HTX" in e for e in errors)
    values, site_ids, errors = main.read_experience_form(exp_form(sites=[str(mine), str(mine)]), {mine})
    assert errors == [] and site_ids == [mine]


def test_season_values_need_twelve_months_and_300_chars():
    values, errors = main.season_values(["" for _ in range(11)])
    assert values == {} and errors
    values, errors = main.season_values(["Tháng ba hái chè xuân", "", "  "] + ["" for _ in range(9)])
    assert errors == [] and values[1] == "Tháng ba hái chè xuân" and values[2] is None and values[3] is None
    _, errors = main.season_values(["x" * 301] + ["" for _ in range(11)])
    assert any("Ghi chú tháng 1" in e for e in errors)


def test_map_link_uses_only_the_numbers():
    link = main.map_link(Decimal("21.0285"), Decimal("105.8542"))
    assert link == "https://www.openstreetmap.org/?mlat=21.028500&mlon=105.854200#map=16/21.028500/105.854200"
    assert main.map_link(None, None) is None


def test_public_htx_pattern():
    assert main.public_htx("TC_01-a") == "TC_01-a"
    for bad in ("", "bad$", "x" * 21, "../etc"):
        with pytest.raises(Exception) as info:
            main.public_htx(bad)
        assert getattr(info.value, "status_code", None) == 404


def test_links_keep_prefix_and_theme_only_when_valid():
    assert main.href("/intro", "dark") == "/apps/tea-experience/intro?theme=dark"
    assert main.href("/intro") == "/apps/tea-experience/intro"
    assert main.tour_link("TC") == "/apps/tea-tour/public/TC"
    assert main.tour_link("TC", "light") == "/apps/tea-tour/public/TC?theme=light"
