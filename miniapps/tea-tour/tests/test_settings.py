# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import pytest

from tea_tour.store import settings

VALID = {"display_name": "HTX Chè Tân Cương", "tagline": "Chè ngon, đồi đẹp", "intro": "Giới thiệu.",
         "hotline": "0912 345 678", "zalo": "0912345678", "email": "htx@example.vn", "address": "Xóm Hồng Thái",
         "map_url": "https://maps.example.com/p/1", "bank_bin": "970405", "bank_account": "8600201001234",
         "bank_holder": "HTX CHE TAN CUONG", "deposit_percent": "30", "hold_hours": "24", "cancel_free_hours": "48",
         "auto_confirm": "on", "policy_text": "Hoàn tiền theo chính sách."}


def test_a_cooperative_without_a_row_gets_the_defaults(db):
    s = settings.get(db, "TC")
    assert s.htx_code == "TC" and s.display_name == "" and s.cover_media_id is None
    assert (s.deposit_percent, s.hold_hours, s.cancel_free_hours, s.auto_confirm) == (0, 24, 24, False)
    assert not s.bank_ready and s.bank_name == ""
    assert db.execute("SELECT count(*) FROM settings").fetchone()[0] == 0  # reading never writes


def test_save_and_get_round_trip_and_stay_per_cooperative(db):
    assert settings.save(db, "TC", VALID) == {}
    s = settings.get(db, "TC")
    assert (s.display_name, s.hotline, s.bank_bin, s.bank_account, s.bank_holder) == (
        "HTX Chè Tân Cương", "0912 345 678", "970405", "8600201001234", "HTX CHE TAN CUONG")
    assert (s.deposit_percent, s.hold_hours, s.cancel_free_hours, s.auto_confirm) == (30, 24, 48, True)
    assert s.bank_ready and s.bank_name == "Agribank"
    assert settings.get(db, "LB").display_name == ""
    assert settings.save(db, "TC", {**VALID, "display_name": "Tên mới", "auto_confirm": ""}) == {}
    assert settings.get(db, "TC").display_name == "Tên mới" and settings.get(db, "TC").auto_confirm is False
    assert db.execute("SELECT count(*) FROM settings").fetchone()[0] == 1


def test_save_keeps_the_cover_image(db):
    from factories import add_media
    cover = add_media(db)
    db.execute("INSERT INTO settings (htx_code, cover_media_id) VALUES ('TC', %s)", (cover,))
    settings.save(db, "TC", VALID)
    assert settings.get(db, "TC").cover_media_id == cover


@pytest.mark.parametrize("field,value", [
    ("display_name", "x" * 81), ("tagline", "x" * 161), ("intro", "x" * 2001), ("address", "x" * 201),
    ("policy_text", "x" * 2001), ("hotline", "gọi tôi"), ("hotline", "1" * 21), ("zalo", "abc"), ("email", "khong-hop-le"),
    ("email", "a@b.vn" + "x" * 120), ("map_url", "http://maps.example.com"), ("map_url", "javascript:alert(1)"),
    ("map_url", "https://" + "x" * 300), ("map_url", "https://a b"), ("bank_bin", "123456"), ("bank_bin", "abc"),
    ("bank_account", "12345"), ("bank_account", "1" * 20), ("bank_account", "86002x1001234"),
    ("bank_holder", "A" * 61), ("bank_holder", "NGUYEN@VAN"),
    ("deposit_percent", "101"), ("deposit_percent", "-1"), ("deposit_percent", "ba mươi"), ("deposit_percent", ""),
    ("hold_hours", "0"), ("hold_hours", "169"), ("cancel_free_hours", "721"), ("cancel_free_hours", "x"),
])
def test_every_field_is_validated_and_a_bad_form_saves_nothing(db, field, value):
    errors = settings.save(db, "TC", {**VALID, field: value})
    assert field in errors and errors[field]
    assert db.execute("SELECT count(*) FROM settings").fetchone()[0] == 0


@pytest.mark.parametrize("field,value", [("deposit_percent", "0"), ("deposit_percent", "100"), ("hold_hours", "1"),
                                         ("hold_hours", "168"), ("cancel_free_hours", "0"), ("cancel_free_hours", "720"),
                                         ("display_name", "x" * 80), ("map_url", "")])
def test_boundaries_are_accepted(db, field, value):
    assert settings.save(db, "TC", {**VALID, field: value}) == {}


def test_bank_holder_is_stored_as_upper_case_ascii(db):
    assert settings.save(db, "TC", {**VALID, "bank_holder": "  Nguyễn  Văn Đạt "}) == {}
    assert settings.get(db, "TC").bank_holder == "NGUYEN VAN DAT"


def test_bank_details_are_all_or_nothing(db):
    errors = settings.save(db, "TC", {**VALID, "bank_account": ""})
    assert "bank_account" in errors
    assert settings.save(db, "TC", {**VALID, "bank_bin": "", "bank_account": "", "bank_holder": ""}) == {}
    assert not settings.get(db, "TC").bank_ready


def test_bank_account_ignores_spaces_and_dashes(db):
    assert settings.save(db, "TC", {**VALID, "bank_account": "8600 2010-01234"}) == {}
    assert settings.get(db, "TC").bank_account == "8600201001234"


def test_text_is_stored_verbatim_for_the_template_to_escape(db):
    hostile = "<script>alert(1)</script>"
    assert settings.save(db, "TC", {**VALID, "tagline": hostile}) == {}
    assert settings.get(db, "TC").tagline == hostile
