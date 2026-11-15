# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Money rules of spec 7.1 and 7.3. Amounts are whole VND."""


def total_vnd(adults: int, children: int, price_adult_vnd: int, price_child_vnd: int) -> int:
    return adults * price_adult_vnd + children * price_child_vnd


def deposit_vnd(total: int, deposit_percent: int) -> int:
    """total x percent / 100, rounded up to a multiple of 1.000 VND, never above the total. 0 % asks nothing."""
    if total <= 0 or deposit_percent <= 0:
        return 0
    return min(total, -(-(total * deposit_percent) // 100_000) * 1000)


def payment_state(status: str, total: int, paid: int) -> str:
    """UNPAID | DEPOSITED | PAID | REFUND_DUE (computed, never stored)."""
    if status == "CANCELLED":
        return "REFUND_DUE" if paid > 0 else "UNPAID"
    if paid > total:
        return "REFUND_DUE"
    if paid >= total:
        return "PAID"  # includes a free tour
    return "DEPOSITED" if paid > 0 else "UNPAID"


def amount_due_now(total: int, deposit: int, paid: int) -> int:
    """What the VietQR asks for: the rest of the deposit, then the rest of the price."""
    if paid < deposit:
        return deposit - paid
    return max(total - paid, 0)


def refund_due(status: str, total: int, paid: int) -> int:
    """Money the cooperative owes back: everything paid on a cancelled booking, else the excess over the total."""
    if status == "CANCELLED":
        return max(paid, 0)
    return max(paid - total, 0)
