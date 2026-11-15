# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from datetime import datetime, timedelta, timezone

from tea_tour.domain import policy

VN = timezone(timedelta(hours=7))
START = datetime(2030, 5, 1, 7, 30, tzinfo=VN)


def test_hold_is_capped_at_the_departure():
    created = START - timedelta(hours=10)
    assert policy.hold_until(created, START, 24, 100_000) == START
    assert policy.hold_until(created, START, 4, 100_000) == created + timedelta(hours=4)


def test_no_hold_without_a_deposit():
    assert policy.hold_until(START - timedelta(days=3), START, 24, 0) is None


def test_guest_cancel_boundary_is_inclusive():
    deadline = START - timedelta(hours=24)
    assert policy.guest_can_cancel("CONFIRMED", START, 24, deadline)
    assert not policy.guest_can_cancel("CONFIRMED", START, 24, deadline + timedelta(seconds=1))
    assert policy.guest_can_cancel("PENDING", START, 0, START)
    assert not policy.guest_can_cancel("CANCELLED", START, 24, deadline - timedelta(days=5))


def test_checkin_window_runs_from_vietnam_midnight_to_a_day_after_the_end():
    start, end = policy.checkin_window(START, 180)
    assert start == datetime(2030, 5, 1, 0, 0, tzinfo=VN)
    assert end == START + timedelta(minutes=180, hours=24)


def test_checkin_window_uses_the_vietnam_day_across_midnight_utc():
    # 05:00 in Vietnam on 2 May is 22:00 UTC on 1 May: the window still opens at 00:00 on 2 May Vietnam time.
    early = datetime(2030, 5, 1, 22, 0, tzinfo=timezone.utc)
    start, _ = policy.checkin_window(early, 120)
    assert start == datetime(2030, 5, 2, 0, 0, tzinfo=VN)
    assert start.utcoffset() == timedelta(hours=7)
