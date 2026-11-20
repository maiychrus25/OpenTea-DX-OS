# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The core client: one result per block, a typed value or a block error, never an exception out of run()."""
import threading
import time
from datetime import date, datetime, timezone

from htx_dashboard import core_client as cc
from htx_dashboard import metrics as m
import sample

UTC = timezone.utc


def test_requests_carry_the_viewers_token_and_role_and_variables():
    seen = []

    def transport(authorization, role, payload, timeout):
        seen.append((authorization, role, payload, timeout))
        return {"data": {"households": [{"id": "h1", "name": "Hộ A"}]}}

    client = cc.Core(transport)
    out = client.run("Bearer tok", {"households": cc.Block(cc.HOUSEHOLDS, {"limit": 5000}, cc.parse_households)})
    assert out["households"].ok and out["households"].value == ["Hộ A"]
    authorization, role, payload, timeout = seen[0]
    assert (authorization, role, timeout) == ("Bearer tok", "manager", cc.TIMEOUT_S)
    assert payload == {"query": cc.HOUSEHOLDS, "variables": {"limit": 5000}}


def test_one_failing_query_leaves_the_others_standing():
    def transport(authorization, role, payload, timeout):
        if payload["query"] == cc.LOTS:
            raise OSError("boom")
        return sample.answer(payload)

    out = cc.Core(transport).run("Bearer t", {
        "households": cc.Block(cc.HOUSEHOLDS, {"limit": 5000}, cc.parse_households),
        "lots": cc.Block(cc.LOTS, {"limit": 5000}, cc.parse_lots)})
    assert out["households"].ok and not out["lots"].ok and out["lots"].error


def test_graphql_errors_are_a_block_error():
    out = cc.Core(lambda *a: {"errors": [{"message": "field not found"}]}).run(
        "Bearer t", {"x": cc.Block(cc.HOUSEHOLDS, {"limit": 1}, cc.parse_households)})
    assert not out["x"].ok


def test_malformed_core_answer_is_a_block_error():
    for bad in ({"data": {"households": "nope"}}, {"data": {"households": [{"id": "h1"}]}}, {"data": None}, {},
                {"data": {"households": [None]}}, [], "text"):
        out = cc.Core(lambda *a, bad=bad: bad).run(
            "Bearer t", {"x": cc.Block(cc.HOUSEHOLDS, {"limit": 1}, cc.parse_households)})
        assert not out["x"].ok, bad


def test_a_slow_query_times_out_without_holding_the_page():
    release = threading.Event()

    def transport(authorization, role, payload, timeout):
        release.wait(5)
        return {"data": {"households": []}}

    start = time.monotonic()
    out = cc.Core(transport, timeout=0.2).run("Bearer t", {"x": cc.Block(cc.HOUSEHOLDS, {"limit": 1}, cc.parse_households)})
    release.set()
    assert not out["x"].ok and time.monotonic() - start < 2


def test_blocks_run_in_parallel():
    def transport(authorization, role, payload, timeout):
        time.sleep(0.2)
        return sample.answer(payload)

    start = time.monotonic()
    cc.Core(transport).run("Bearer t", {f"b{i}": cc.Block(cc.HOUSEHOLDS, {"limit": 1}, cc.parse_households) for i in range(6)})
    assert time.monotonic() - start < 0.9


def test_parsers_read_the_sample_answers_into_typed_rows():
    run = lambda name, query, variables, parse: cc.Core(lambda a, r, p, t: sample.answer(p)).run(
        "Bearer t", {name: cc.Block(query, variables, parse)})[name]
    parcels = run("p", cc.PARCELS, {"limit": 5000}, cc.parse_parcels)
    assert parcels.ok and isinstance(parcels.value[0], m.Parcel) and len(parcels.value) == sample.PARCEL_COUNT
    assert any(p.cycle is not None for p in parcels.value) and any(p.cycle is None for p in parcels.value)
    latest = run("l", cc.LATEST_READINGS, {"htx": "TC", "limit": 5000}, cc.parse_readings).value
    assert isinstance(latest[0], m.Reading) and latest[0].ts.tzinfo is not None
    runs = run("r", cc.RUNS, {"htx": "TC", "limit": 60}, cc.parse_runs).value
    assert {r.status for r in runs} == {"done", "failed"}


def test_naive_timestamps_from_prisma_columns_are_utc():
    assert cc.parse_ts("2026-11-20T03:00:00") == datetime(2026, 11, 20, 3, 0, tzinfo=UTC)
    assert cc.parse_ts("2026-11-20T10:00:00+07:00") == datetime(2026, 11, 20, 3, 0, tzinfo=UTC)
    assert cc.parse_ts("2026-11-20T03:00:00.123456Z").tzinfo is not None


def test_a_row_with_a_bad_number_is_a_block_error_not_a_crash():
    bad = {"data": {"telemetry_sensor_daily": [{"parcel_code": "P1", "sensor": "a", "day": "2026-11-19", "reading_count": "x",
                                                "min_value": 1, "max_value": 2, "avg_value": 1.5,
                                                "first_ts": "2026-11-19T00:00:00+00:00", "last_ts": "2026-11-19T01:00:00+00:00"}]}}
    out = cc.Core(lambda *a: bad).run("Bearer t", {"d": cc.Block(cc.PARCEL_DAILY, {"htx": "TC", "code": "P1", "from": "2026-11-01"}, cc.parse_daily)})
    assert not out["d"].ok


def test_bigint_and_numeric_strings_are_accepted():
    raw = {"data": {"telemetry_sensor_daily": [{"parcel_code": "P1", "sensor": "a", "day": "2026-11-19", "reading_count": "12",
                                                "min_value": 1, "max_value": 2, "avg_value": 1.5,
                                                "first_ts": "2026-11-19T00:00:00+00:00", "last_ts": "2026-11-19T01:00:00+00:00"}]}}
    out = cc.Core(lambda *a: raw).run("Bearer t", {"d": cc.Block(cc.PARCEL_DAILY, {"htx": "TC", "code": "P1", "from": "2026-11-01"}, cc.parse_daily)})
    assert out["d"].value[0].count == 12 and out["d"].value[0].day == date(2026, 11, 19)
