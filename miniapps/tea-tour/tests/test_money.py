# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import pytest

from tea_tour.domain import money


def test_total_uses_both_prices():
    assert money.total_vnd(2, 1, 250_000, 120_000) == 620_000
    assert money.total_vnd(0, 3, 250_000, 0) == 0


@pytest.mark.parametrize("total,percent,expected", [
    (620_000, 30, 186_000),    # 186.000 is already a multiple of 1.000
    (333_333, 30, 100_000),    # 99.999,9 rounds up to 100.000
    (250_000, 10, 25_000),
    (250_001, 10, 26_000),     # 25.000,1 rounds up
    (500_000, 0, 0),           # no deposit asked
    (500_000, 100, 500_000),   # the whole price, never above it
    (1_500, 100, 1_500),       # rounding up to 2.000 is capped at the total
    (0, 50, 0),
])
def test_deposit_rounds_up_to_a_thousand_and_never_exceeds_total(total, percent, expected):
    assert money.deposit_vnd(total, percent) == expected


@pytest.mark.parametrize("status,total,paid,expected", [
    ("PENDING", 500_000, 0, "UNPAID"),
    ("CONFIRMED", 500_000, 100_000, "DEPOSITED"),
    ("CONFIRMED", 500_000, 500_000, "PAID"),
    ("CONFIRMED", 0, 0, "PAID"),                  # a free tour owes nothing
    ("CONFIRMED", 400_000, 500_000, "REFUND_DUE"),  # overpaid after shrinking the party
    ("CANCELLED", 500_000, 100_000, "REFUND_DUE"),
    ("CANCELLED", 500_000, 0, "UNPAID"),
])
def test_payment_state(status, total, paid, expected):
    assert money.payment_state(status, total, paid) == expected


@pytest.mark.parametrize("total,deposit,paid,expected", [
    (500_000, 150_000, 0, 150_000),         # deposit first
    (500_000, 150_000, 100_000, 50_000),    # rest of the deposit
    (500_000, 150_000, 150_000, 350_000),   # then the remainder
    (500_000, 0, 0, 500_000),               # no deposit: the whole price
    (500_000, 150_000, 500_000, 0),
    (500_000, 150_000, 600_000, 0),
])
def test_amount_due_now(total, deposit, paid, expected):
    assert money.amount_due_now(total, deposit, paid) == expected


@pytest.mark.parametrize("status,total,paid,expected", [
    ("CANCELLED", 500_000, 150_000, 150_000),
    ("CANCELLED", 500_000, 0, 0),
    ("CONFIRMED", 400_000, 500_000, 100_000),
    ("CONFIRMED", 500_000, 500_000, 0),
    ("PENDING", 500_000, 100_000, 0),
])
def test_refund_due(status, total, paid, expected):
    assert money.refund_due(status, total, paid) == expected
