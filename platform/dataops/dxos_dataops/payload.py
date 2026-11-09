# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

# Inclusive valid ranges per sensor (spec section 4.2).
SENSORS: dict[str, tuple[float, float]] = {
    "soil_moisture": (0, 100),
    "soil_temperature": (-10, 60),
    "air_temperature": (-10, 55),
    "air_humidity": (0, 100),
    "rainfall": (0, 500),
}

MAX_FUTURE = timedelta(minutes=5)


class Rejected(Exception):
    def __init__(self, reason: str, htx_code: str | None = None):
        super().__init__(reason)
        self.reason = reason
        self.htx_code = htx_code


@dataclass(frozen=True)
class Reading:
    htx_code: str
    parcel_code: str
    sensor: str
    ts: datetime
    value: float


def parse_message(topic: str, payload: bytes, now: datetime) -> Reading:
    """Validate one MQTT message in spec 4.3 order; raise Rejected on the first failure."""
    parts = topic.split("/")
    if len(parts) != 5 or parts[0] != "htx" or parts[2] != "plot" or not (parts[1] and parts[3] and parts[4]):
        raise Rejected("bad_topic")
    _, htx, _, parcel, sensor = parts

    try:
        body = json.loads(payload)
    except ValueError:  # includes UnicodeDecodeError
        raise Rejected("bad_json", htx) from None
    value = body.get("value") if isinstance(body, dict) else None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise Rejected("bad_json", htx)

    raw_ts = body.get("ts")
    try:
        ts = datetime.fromisoformat(raw_ts)
        if ts.tzinfo is None:
            raise ValueError("naive timestamp")
        ts = ts.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):  # OverflowError: UTC result outside datetime range
        raise Rejected("bad_ts", htx) from None
    if ts - now > MAX_FUTURE:
        raise Rejected("future_ts", htx)

    bounds = SENSORS.get(sensor)
    if bounds is None:
        raise Rejected("unknown_sensor", htx)
    if not bounds[0] <= value <= bounds[1]:  # false for NaN
        raise Rejected("out_of_range", htx)
    return Reading(htx, parcel, sensor, ts, float(value))
