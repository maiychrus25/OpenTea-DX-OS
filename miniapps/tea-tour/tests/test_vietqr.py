# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import re

import pytest

from tea_tour.domain import vietqr

VECTOR = ("00020101021238570010A00000072701270006970405011386002010012340208QRIBFTTA530370454065000005802VN"
          "62170813TOUR K7M2QX9A6304C17A")


def test_spec_vector():
    assert vietqr.payload("970405", "8600201001234", 500000, "TOUR K7M2QX9A") == VECTOR


def test_crc_of_the_standard_check_string():
    assert vietqr.crc16("123456789") == "29B1"


def test_every_bin_is_six_digits_and_unique():
    bins = [bank.bin for bank in vietqr.BANKS]
    assert len(bins) == 21 and len(set(bins)) == 21
    assert all(re.fullmatch(r"[0-9]{6}", b) for b in bins)
    assert len({bank.name for bank in vietqr.BANKS}) == 21


def test_bank_lookup():
    assert vietqr.bank_by_bin("970405").name == "Agribank"
    assert vietqr.bank_by_bin("000000") is None


@pytest.mark.parametrize("args", [
    ("97040", "8600201001234", 1000, "TOUR A"),       # bad BIN
    ("970405", "12345", 1000, "TOUR A"),              # account too short
    ("970405", "86002010012x4", 1000, "TOUR A"),      # not digits
    ("970405", "8600201001234", 0, "TOUR A"),         # no amount
    ("970405", "8600201001234", 1000, "TOUR Đ"),      # not ASCII
    ("970405", "8600201001234", 1000, "x" * 26),      # too long for a transfer note
])
def test_payload_refuses_bad_input(args):
    with pytest.raises(ValueError):
        vietqr.payload(*args)
