# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Schedules of the M4 agents: an interval (field-watch) and a daily time in Vietnam (harvest, disease, bulletin)."""
from datetime import datetime, time, timedelta, timezone

from dxos_agent.schedule import DailySchedule, IntervalSchedule

# Vietnam time is UTC+7: 2026-11-23 23:45 UTC is 06:45 on 24 November in Vietnam, after a 06:30 run.
MORNING = datetime(2026, 11, 23, 23, 45, tzinfo=timezone.utc)


def test_interval_is_due_on_the_first_cycle():
    assert IntervalSchedule(timedelta(minutes=30)).is_due(MORNING) is True


def test_interval_is_not_due_again_within_the_interval():
    schedule = IntervalSchedule(timedelta(minutes=30))
    schedule.record(MORNING)
    assert schedule.is_due(MORNING + timedelta(minutes=29)) is False
    assert schedule.is_due(MORNING + timedelta(minutes=30)) is True


def test_first_cycle_after_start_is_due_even_before_the_daily_time():
    schedule = DailySchedule(at=time(6, 30))
    assert schedule.is_due(datetime(2026, 11, 23, 23, 0, tzinfo=timezone.utc)) is True  # 06:00 Vietnam time


def test_daily_run_waits_for_its_time_after_the_first_run():
    schedule = DailySchedule(at=time(6, 30))
    schedule.record(datetime(2026, 11, 23, 23, 0, tzinfo=timezone.utc))  # a first run at 06:00 counts for the day
    assert schedule.is_due(datetime(2026, 11, 24, 0, 0, tzinfo=timezone.utc)) is False  # 07:00 same day, already ran
    assert schedule.is_due(MORNING) is False  # 06:45 Vietnam time on 24 November, the day already ran
    assert schedule.is_due(MORNING + timedelta(days=1)) is True  # 06:45 on 25 November


def test_daily_run_happens_once_per_vietnam_day():
    schedule = DailySchedule(at=time(6, 30))
    schedule.record(MORNING)
    assert schedule.is_due(MORNING + timedelta(hours=10)) is False  # same Vietnam day
    assert schedule.is_due(MORNING + timedelta(days=1)) is True  # next Vietnam day, after 06:30
