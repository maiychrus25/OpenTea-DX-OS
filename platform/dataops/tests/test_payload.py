# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from datetime import datetime, timedelta, timezone

import pytest

from dxos_dataops.payload import Rejected, parse_message

NOW = datetime(2026, 11, 9, 8, 0, tzinfo=timezone.utc)
T = "htx/TC/plot/P-TC-001/soil_moisture"


def rejected(topic, body):
    with pytest.raises(Rejected) as exc:
        parse_message(topic, body, NOW)
    return exc.value


def reason(topic, body):
    return rejected(topic, body).reason


def test_valid_reading():
    r = parse_message(T, b'{"ts":"2026-11-09T06:30:00+07:00","value":23.4}', NOW)
    assert (r.htx_code, r.parcel_code, r.sensor, r.value) == ("TC", "P-TC-001", "soil_moisture", 23.4)
    assert r.ts == datetime(2026, 11, 8, 23, 30, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    "topic",
    ["htx/TC/plot/P1", "x/TC/plot/P1/soil_moisture", "htx//plot/P1/soil_moisture", "htx/TC/plot/P1/a/b"],
)
def test_bad_topic(topic):
    err = rejected(topic, b"{}")
    assert err.reason == "bad_topic"
    assert err.htx_code is None


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b"[]",
        b"\xff\xfe",
        b'{"ts":"2026-11-09T08:00:00Z","value":"1"}',
        b'{"ts":"2026-11-09T08:00:00Z","value":true}',
        b'{"ts":"2026-11-09T08:00:00Z"}',
    ],
)
def test_bad_json(body):
    err = rejected(T, body)
    assert err.reason == "bad_json"
    assert err.htx_code == "TC"


@pytest.mark.parametrize(
    "body",
    [
        b'{"value":1}',
        b'{"ts":123,"value":1}',
        b'{"ts":"2026-11-09T08:00:00","value":1}',
        b'{"ts":"garbage","value":1}',
        b'{"ts":"0001-01-01T00:00:00+05:00","value":1}',
        b'{"ts":"9999-12-31T23:59:59-05:00","value":1}',
    ],
)
def test_bad_ts(body):
    assert reason(T, body) == "bad_ts"


def test_future_ts_boundary():
    ok = (NOW + timedelta(minutes=5)).isoformat()
    assert parse_message(T, f'{{"ts":"{ok}","value":1}}'.encode(), NOW).value == 1
    late = (NOW + timedelta(minutes=5, seconds=1)).isoformat()
    assert reason(T, f'{{"ts":"{late}","value":1}}'.encode()) == "future_ts"


def test_old_ts_accepted():
    assert parse_message(T, b'{"ts":"2020-01-01T00:00:00Z","value":1}', NOW).value == 1


def test_unknown_sensor():
    err = rejected("htx/TC/plot/P1/ph", b'{"ts":"2026-11-09T08:00:00Z","value":1}')
    assert (err.reason, err.htx_code) == ("unknown_sensor", "TC")


@pytest.mark.parametrize("value", ["100.1", "-0.1", "NaN", "Infinity", "-Infinity"])
def test_out_of_range(value):
    err = rejected(T, f'{{"ts":"2026-11-09T08:00:00Z","value":{value}}}'.encode())
    assert (err.reason, err.htx_code) == ("out_of_range", "TC")


@pytest.mark.parametrize("value", ["-10", "55"])
def test_inclusive_bounds(value):
    body = f'{{"ts":"2026-11-09T08:00:00Z","value":{value}}}'.encode()
    assert parse_message("htx/TC/plot/P1/air_temperature", body, NOW).value == float(value)


def test_check_order_ts_before_sensor():
    assert reason("htx/TC/plot/P1/ph", b'{"value":1}') == "bad_ts"


def test_deeply_nested_json_is_bad_json():
    # The broker's 1 KiB limit still allows ~1000 nested brackets, which exhaust json's recursion limit.
    assert reason(T, b"[" * 1024) == "bad_json"
