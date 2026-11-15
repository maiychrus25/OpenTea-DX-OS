# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import pytest

from tea_tour.domain import text


def test_slugify_strips_vietnamese_marks():
    assert text.slugify("Một ngày làm người hái chè") == "mot-ngay-lam-nguoi-hai-che"
    assert text.slugify("Đồi chè Đông Đạo!") == "doi-che-dong-dao"
    assert text.slugify("  --Sao chè 2024--  ") == "sao-che-2024"


def test_slugify_is_never_empty_and_fits_80_characters():
    assert text.slugify("!!!") == "tour"
    slug = text.slugify("chè " * 60)
    assert len(slug) <= 80 and not slug.endswith("-")


@pytest.mark.parametrize("raw,expected", [
    ("0912345678", "0912345678"),
    ("0912 345 678", "0912345678"),
    ("0912.345.678", "0912345678"),
    ("0912-345-678", "0912345678"),
    ("+84912345678", "0912345678"),
    ("+84 912 345 678", "0912345678"),
    ("912345678", None),
    ("09123456789", None),
    ("0912abc678", None),
    ("", None),
])
def test_normalise_phone(raw, expected):
    assert text.normalise_phone(raw) == expected


@pytest.mark.parametrize("name,expected", [
    ("Nguyễn Văn Khách", "Khách"),
    ("  Lan  ", "Lan"),
    ("", "Khách"),
    ("   ", "Khách"),
])
def test_default_display_name_is_the_last_word(name, expected):
    assert text.default_display_name(name) == expected


def test_default_display_name_fits_40_characters():
    assert len(text.default_display_name("A " + "x" * 90)) == 40
