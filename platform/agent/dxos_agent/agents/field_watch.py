# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Agent A2 (field-watch): silent sensors, dry soil, heat, frost and rain after spraying, decided by rules only."""
from datetime import date, datetime, timedelta
import math
from typing import Any, Callable, Mapping, Sequence

from ..client import CoreGatewayClient
from ..evidence import journal_entry_evidence_row, sensor_reading_evidence_row, weather_evidence_row
from ..settings import THRESHOLD_DEFAULTS
from .common import (
    RuleRun,
    Proposal,
    clamp,
    parse_utc,
    proposal,
    rows_of,
    submit_rule_run,
    utc_text,
    vn_date_text,
    vn_day,
)

AGENT_NAME = "field-watch"
DEFAULT_THRESHOLDS = THRESHOLD_DEFAULTS[AGENT_NAME]
HISTORY = timedelta(days=30)  # a sensor with no reading in this window is not watched
MAX_PARCELS = 20  # a households message names at most 20 parcels (contract C3)
SENSOR_LABELS_VI = {
    "soil_moisture": "độ ẩm đất",
    "soil_temperature": "nhiệt độ đất",
    "air_temperature": "nhiệt độ không khí",
    "air_humidity": "độ ẩm không khí",
    "rainfall": "lượng mưa",
}
NOT_SPRAYABLE_STATUSES = ("DRAFT", "REJECTED")

READINGS_OPERATION = "FieldWatchLatestReadings"
SPRAYINGS_OPERATION = "FieldWatchSprayings"
WEATHER_OPERATION = "FieldWatchWeather"


def readings_query(since: datetime) -> str:
    """The latest reading of each parcel sensor since `since`: one row per pair, not the whole history."""
    return (
        f"query {READINGS_OPERATION} {{\n"
        "  telemetry_sensor_readings(\n"
        "    distinct_on: [parcel_code, sensor]\n"
        "    order_by: [{parcel_code: asc}, {sensor: asc}, {ts: desc}]\n"
        f'    where: {{ts: {{_gte: "{utc_text(since)}"}}}}\n'
        "  ) { parcel_code sensor ts value }\n"
        "}"
    )


def sprayings_query(since: datetime) -> str:
    """Spraying entries entered since `since`, with the activities the withdrawal evidence needs."""
    statuses = ", ".join(f'"{status}"' for status in NOT_SPRAYABLE_STATUSES)
    return (
        f"query {SPRAYINGS_OPERATION} {{\n"
        "  journal_entries(\n"
        f'    where: {{activity_type: {{_eq: "SPRAYING"}}, status: {{_nin: [{statuses}]}}, '
        f'entry_date: {{_gte: "{utc_text(since)}"}}}}\n'
        "    order_by: [{entry_date: desc}]\n"
        "  ) {\n"
        "    id parcel_id entry_date activity_type status notes updated_at\n"
        "    parcel { id parcel_code }\n"
        "    activities(order_by: [{id: asc}]) { id activity_detail product_name dosage withdrawal_days safe_harvest_date }\n"
        "  }\n"
        "}"
    )


WEATHER_QUERY = (
    f"query {WEATHER_OPERATION} {{\n"
    "  weather_cache(distinct_on: [parcel_id], order_by: [{parcel_id: asc}, {recorded_at: desc}]) {\n"
    "    id parcel_id recorded_at precipitation_mm forecast_json\n"
    "  }\n"
    "}"
)


def _latest_by_sensor(readings: Sequence[Mapping[str, Any]], now: datetime) -> dict[tuple[str, str], tuple[datetime, Mapping[str, Any]]]:
    """Newest reading per (parcel, sensor) inside the history window, for the sensors the agent knows."""
    latest: dict[tuple[str, str], tuple[datetime, Mapping[str, Any]]] = {}
    for row in readings:
        if row.get("sensor") not in SENSOR_LABELS_VI or row.get("value") is None:
            continue
        ts = parse_utc(row["ts"])
        if now - ts > HISTORY:
            continue
        key = (str(row["parcel_code"]), str(row["sensor"]))
        if key not in latest or ts > latest[key][0]:
            latest[key] = (ts, row)
    return latest


def _forecast_day(text: Any) -> date | None:
    try:
        return date.fromisoformat(str(text))
    except ValueError:
        return None


def _extreme(candidates: list[tuple[str, float, Mapping[str, Any]]], lowest: bool) -> list[tuple[str, float, Mapping[str, Any]]]:
    """The most extreme parcels first, at most MAX_PARCELS of them."""
    return sorted(candidates, key=lambda item: (item[1] if lowest else -item[1], item[0]))[:MAX_PARCELS]


def _threshold_proposal(
    template: str,
    candidates: list[tuple[str, float, Mapping[str, Any]]],
    lowest: bool,
    value_slot: str,
    slot_range: tuple[int, int],
    today: date,
    reason: Callable[[str, int], str],
    extra_slots: Mapping[str, int],
) -> Proposal | None:
    """One households proposal for the most extreme parcels of a threshold rule; `reason` gets the codes and the value."""
    if not candidates:
        return None
    chosen = _extreme(candidates, lowest)
    codes = sorted(code for code, _value, _row in chosen)
    value = clamp(math.floor(chosen[0][1]), *slot_range)
    return proposal(
        "notification.households",
        {
            "template": template,
            "slots": {"parcel_codes": codes, value_slot: value, **extra_slots},
            "subjects": [f"{template}:{today.isoformat()}"],
        },
        reason(", ".join(codes), value),
        [sensor_reading_evidence_row(row) for _code, _value, row in chosen],
    )


def _rain_candidates(
    sprayings: Sequence[Mapping[str, Any]],
    weather: Sequence[Mapping[str, Any]],
    now: datetime,
    lookback_days: int,
    forecast_days: int,
    heavy_rain_mm: float,
) -> dict[date, list[tuple[str, float, Mapping[str, Any], list[Mapping[str, Any]]]]]:
    """Per forecast day: the sprayed parcels whose next heavy-rain day that is, with their weather row and entries."""
    today = vn_day(now)
    since = now - timedelta(days=lookback_days)
    entries_by_parcel: dict[str, list[Mapping[str, Any]]] = {}
    codes: dict[str, str] = {}
    for entry in sprayings:
        parcel = entry.get("parcel")
        if entry.get("activity_type") != "SPRAYING" or entry.get("status") in NOT_SPRAYABLE_STATUSES:
            continue
        if not isinstance(parcel, Mapping) or parse_utc(entry["entry_date"]) < since:
            continue
        entries_by_parcel.setdefault(str(entry["parcel_id"]), []).append(entry)
        codes[str(entry["parcel_id"])] = str(parcel["parcel_code"])

    latest_weather: dict[str, Mapping[str, Any]] = {}
    for row in weather:
        parcel_id = str(row.get("parcel_id"))
        if parcel_id in codes and (
            parcel_id not in latest_weather or parse_utc(row["recorded_at"]) > parse_utc(latest_weather[parcel_id]["recorded_at"])
        ):
            latest_weather[parcel_id] = row

    by_day: dict[date, list[tuple[str, float, Mapping[str, Any], list[Mapping[str, Any]]]]] = {}
    for parcel_id, row in latest_weather.items():
        forecast = row.get("forecast_json") or {}
        for day_text, amount in zip(forecast.get("time") or [], forecast.get("precipitation_sum") or []):
            day = _forecast_day(day_text)
            if day is None or amount is None or not (today < day <= today + timedelta(days=forecast_days)):
                continue
            if amount >= heavy_rain_mm:
                by_day.setdefault(day, []).append((codes[parcel_id], float(amount), row, entries_by_parcel[parcel_id]))
                break  # the first forecast day that qualifies
    return by_day


def field_watch_proposals(
    readings: Sequence[Mapping[str, Any]],
    sprayings: Sequence[Mapping[str, Any]],
    weather: Sequence[Mapping[str, Any]],
    now: datetime,
    thresholds: Mapping[str, Any] | None = None,
) -> list[Proposal]:
    """Every A2 proposal for the given rows; no data gives no proposal."""
    cfg = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    latest = _latest_by_sensor(readings, now)
    today = vn_day(now)
    proposals: list[Proposal] = []

    fresh = timedelta(hours=float(cfg["fresh_reading_hours"]))
    dry: list[tuple[str, float, Mapping[str, Any]]] = []
    heat: list[tuple[str, float, Mapping[str, Any]]] = []
    frost: list[tuple[str, float, Mapping[str, Any]]] = []
    for (code, sensor), (ts, row) in sorted(latest.items()):
        gap = now - ts
        if gap > timedelta(hours=float(cfg["silent_hours"])):
            hours = clamp(int(gap // timedelta(hours=1)), 6, 720)
            reading = sensor_reading_evidence_row(row)
            proposals.append(
                proposal(
                    "notification.internal",
                    {
                        "template": "sensor_silent",
                        "slots": {"parcel_code": code, "sensor": sensor, "hours": hours},
                        "subjects": [f"sensor_silent:{reading['id']}"],
                    },
                    f"Cảm biến {SENSOR_LABELS_VI[sensor]} ở thửa {code} không gửi số đo {hours} giờ.",
                    [reading],
                )
            )
        if gap >= fresh or ts > now:
            continue
        value = float(row["value"])
        if sensor == "soil_moisture" and value < float(cfg["dry_soil_pct"]):
            dry.append((code, value, row))
        elif sensor == "air_temperature" and value > float(cfg["heat_c"]):
            heat.append((code, value, row))
        elif sensor == "air_temperature" and value < float(cfg["frost_c"]):
            frost.append((code, value, row))

    dry_pct = int(cfg["dry_soil_pct"])
    heat_c = int(cfg["heat_c"])
    frost_c = int(cfg["frost_c"])
    threshold_items = (
        _threshold_proposal(
            "dry_soil", dry, True, "value_pct", (0, 100), today,
            lambda codes, value: f"Độ ẩm đất ở thửa {codes} thấp nhất còn {value}%, dưới ngưỡng {dry_pct}%.",
            {"threshold_pct": dry_pct},
        ),
        _threshold_proposal(
            "heat", heat, False, "value_c", (-10, 60), today,
            lambda codes, value: f"Nhiệt độ không khí ở thửa {codes} lên tới {value}°C, trên ngưỡng {heat_c}°C.",
            {},
        ),
        _threshold_proposal(
            "frost", frost, True, "value_c", (-10, 60), today,
            lambda codes, value: f"Nhiệt độ không khí ở thửa {codes} xuống {value}°C, dưới ngưỡng {frost_c}°C.",
            {},
        ),
    )
    proposals.extend(item for item in threshold_items if item is not None)

    rain = _rain_candidates(
        sprayings, weather, now, int(cfg["spray_lookback_days"]), int(cfg["forecast_days"]), float(cfg["heavy_rain_mm"])
    )
    for day, items in sorted(rain.items()):
        chosen = sorted(items, key=lambda item: (-item[1], item[0]))[:MAX_PARCELS]
        codes = sorted(code for code, _amount, _row, _entries in chosen)
        rain_mm = clamp(math.floor(chosen[0][1]), 1, 500)
        evidence = [weather_evidence_row(weather_row) for _code, _amount, weather_row, _entries in chosen]
        evidence += [journal_entry_evidence_row(entry) for _code, _amount, _row, entries in chosen for entry in entries]
        proposals.append(
            proposal(
                "notification.households",
                {
                    "template": "rain_after_spray",
                    "slots": {"parcel_codes": codes, "date": day.isoformat(), "rain_mm": rain_mm},
                    "subjects": [f"rain_after_spray:{day.isoformat()}"],
                },
                f"Dự báo mưa khoảng {rain_mm} mm ngày {vn_date_text(day)} ở thửa {', '.join(codes)}, "
                "sau lần phun thuốc gần đây.",
                evidence,
            )
        )
    return proposals


def run_field_watch(
    gateway: CoreGatewayClient,
    now: datetime,
    thresholds: Mapping[str, Any] | None = None,
) -> RuleRun | None:
    """Read the sensors, sprays and weather of one cooperative and submit this cycle's proposals."""
    cfg = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    readings = rows_of(gateway.graphql(readings_query(now - HISTORY)), "telemetry_sensor_readings")
    sprayings = rows_of(
        gateway.graphql(sprayings_query(now - timedelta(days=int(cfg["spray_lookback_days"])))),
        "journal_entries",
    )
    weather = rows_of(gateway.graphql(WEATHER_QUERY), "weather_cache")
    proposals = field_watch_proposals(readings, sprayings, weather, now, cfg)
    return submit_rule_run(gateway, AGENT_NAME, proposals)
