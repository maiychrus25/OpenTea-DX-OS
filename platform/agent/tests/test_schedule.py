# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Scheduling rules for A1: first cycle, changed queue, and hourly during 06:00 to 20:00 Vietnam time."""
from datetime import datetime, timedelta, timezone

from dxos_agent.schedule import ReviewSchedule

# 2026-11-24 10:00 Vietnam time is 03:00 UTC.
DAY_NOON_UTC = datetime(2026, 11, 24, 3, 0, tzinfo=timezone.utc)


def test_first_cycle_after_start_is_due():
    assert ReviewSchedule().is_due(DAY_NOON_UTC, "hash-1") is True


def test_unchanged_queue_within_an_hour_is_not_due():
    schedule = ReviewSchedule()
    schedule.record(DAY_NOON_UTC, "hash-1", ran=True)
    assert schedule.is_due(DAY_NOON_UTC + timedelta(minutes=30), "hash-1") is False


def test_changed_queue_is_due_at_once():
    schedule = ReviewSchedule()
    schedule.record(DAY_NOON_UTC, "hash-1", ran=True)
    assert schedule.is_due(DAY_NOON_UTC + timedelta(minutes=1), "hash-2") is True


def test_unchanged_queue_is_due_hourly_during_working_hours():
    schedule = ReviewSchedule()
    schedule.record(DAY_NOON_UTC, "hash-1", ran=True)
    assert schedule.is_due(DAY_NOON_UTC + timedelta(minutes=60), "hash-1") is True


def test_unchanged_queue_is_not_due_at_night_even_after_an_hour():
    schedule = ReviewSchedule()
    night = datetime(2026, 11, 24, 15, 0, tzinfo=timezone.utc)  # 22:00 Vietnam time
    schedule.record(night, "hash-1", ran=True)
    assert schedule.is_due(night + timedelta(hours=2), "hash-1") is False


def test_unchanged_queue_is_not_due_before_six_in_the_morning():
    schedule = ReviewSchedule()
    early = datetime(2026, 11, 23, 21, 0, tzinfo=timezone.utc)  # 04:00 Vietnam time on 24 November
    schedule.record(early, "hash-1", ran=True)
    assert schedule.is_due(early + timedelta(minutes=60), "hash-1") is False  # 05:00 Vietnam time


def test_recording_without_a_run_keeps_the_hourly_clock():
    schedule = ReviewSchedule()
    schedule.record(DAY_NOON_UTC, "hash-1", ran=True)
    schedule.record(DAY_NOON_UTC + timedelta(minutes=50), "hash-1", ran=False)
    assert schedule.last_review_at == DAY_NOON_UTC
    assert schedule.is_due(DAY_NOON_UTC + timedelta(minutes=60), "hash-1") is True
