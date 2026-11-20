# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Sample answers of the core, in the raw GraphQL shapes Hasura returns. One file for the tests and the preview script.

A cooperative of about 40 parcels and 12 households, sensors on 8 parcels (two of them gone quiet), pending journals,
disease reports, lots in every status and sensor-data lifecycle runs including a failed one. Fixed clock: NOW.
"""
import math
import random
from datetime import datetime, timedelta, timezone

from htx_dashboard import core_client as cc

UTC = timezone.utc
NOW = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)  # 10:00 on Friday 20/11/2026 in Vietnam
HTX = "TC"
PARCEL_COUNT = 40
HOUSEHOLDS = ["Hộ Nguyễn Văn An", "Hộ Trần Thị Bình", "Hộ Lê Văn Cường", "Hộ Phạm Thị Dung", "Hộ Hoàng Văn Em",
              "Hộ Vũ Thị Phương", "Hộ Đặng Văn Giang", "Hộ Bùi Thị Hoa", "Hộ Đỗ Văn Hùng", "Hộ Ngô Thị Lan",
              "Hộ Dương Văn Minh", "Hộ Lý Thị Nga"]
SILENT_HOUSEHOLDS = HOUSEHOLDS[-2:]  # never wrote a journal entry
CROPS = ["Chè Trung du", "Chè Kim Tuyên", "Chè Thái Nguyên", "Chè Shan"]
SENSORS = ["soil_moisture", "soil_temperature", "air_temperature", "air_humidity", "rainfall"]
SENSOR_PARCELS = [f"P-TC-{n:03d}" for n in (1, 3, 5, 7, 9, 12, 15, 18)]
SENSOR_RANGE = {"soil_moisture": (45, 15), "soil_temperature": (24, 5), "air_temperature": (27, 6), "air_humidity": (70, 15),
                "rainfall": (2, 2)}


def naive(ts: datetime) -> str:
    return ts.astimezone(UTC).replace(tzinfo=None).isoformat()


def aware(ts: datetime) -> str:
    return ts.astimezone(UTC).isoformat()


def code(n: int) -> str:
    return f"P-TC-{n:03d}"


def household_of(n: int) -> dict:
    index = (n - 1) % 12
    return {"id": f"hh{index + 1:02d}", "name": HOUSEHOLDS[index]}


def parcels() -> list[dict]:
    rows = []
    for n in range(1, PARCEL_COUNT + 1):
        status = ["TENDING", "TENDING", "SOWING", "TENDING", "HARVEST_APPROVED", "HARVESTED", "DRAFT", "TENDING"][n % 8]
        cycles = []
        if status in ("SOWING", "TENDING", "HARVEST_APPROVED"):
            due = NOW + timedelta(days={1: -4, 2: 0, 3: 3, 4: 6, 5: 25, 6: 58}.get(n % 7, 14 + n))
            cycles = [{"season": "Lứa 4/2026", "sowed_at": naive(NOW - timedelta(days=120)),
                       "estimated_harvest_date": None if n == 4 else naive(due.replace(hour=0, minute=0))}]
        rows.append({"parcel_code": code(n), "crop_type": CROPS[n % 4], "area_ha": round(0.4 + (n * 37 % 21) / 10, 1),
                     "status": status, "estimated_yield_per_ha": None if n in (6, 13, 30) else 1800.0 + 60 * (n % 9),
                     "household": household_of(n), "crop_cycles": cycles})
    return rows


def journals() -> list[dict]:
    rng = random.Random(3)
    rows, kinds = [], ["IRRIGATION", "FERTILIZING", "SPRAYING", "HARVEST", "SOWING", "OTHER"]
    for i in range(240):
        n = rng.randint(1, PARCEL_COUNT)
        if (n - 1) % 12 in (10, 11):  # these two households never write
            n -= 2
        days = rng.uniform(0, 85) if i > 30 else rng.uniform(0, 12)
        entry = NOW - timedelta(days=days)
        rows.append({"id": f"j{i:03d}", "entry_date": naive(entry), "activity_type": rng.choice(kinds), "status": "APPROVED",
                     "created_at": naive(entry + timedelta(hours=2)), "performed_by": household_of(n)["name"],
                     "notes": "Tưới sáng, đất còn ẩm." if i % 5 == 0 else None,
                     "parcel": {"parcel_code": code(n), "household": household_of(n)}})
    # pending: three older than 3 days, the rest fresh
    for i, age in enumerate([9.5, 5.2, 3.4, 2.0, 1.1, 0.4, 0.1]):
        row = rows[i]
        row["status"] = "PENDING_APPROVAL"
        row["created_at"] = naive(NOW - timedelta(days=age))
        row["entry_date"] = naive(NOW - timedelta(days=age + 0.1))
    rows[7]["status"] = rows[8]["status"] = "REQUEST_CHANGES"
    rows[9]["status"] = "REJECTED"
    return rows


def diseases() -> list[dict]:
    names = ["Bệnh thối búp", "Rầy xanh", "Bệnh phồng lá", "Bọ xít muỗi"]
    rows = []
    for i in range(14):
        n = [2, 2, 8, 14, 3, 21, 8, 30, 33, 2, 11, 17, 5, 25][i]
        at = NOW - timedelta(days=[0.5, 1.5, 3, 6, 9, 12, 16, 20, 24, 30, 38, 52, 66, 80][i])
        status = "PENDING" if i in (0, 1, 4) else ("REJECTED" if i in (7, 12) else "CONFIRMED")
        rows.append({"id": f"d{i:02d}", "detection_date": naive(at), "ai_disease_name": names[i % 4], "ai_confidence": 0.62 + (i % 5) / 20,
                     "confirmed_diagnosis": names[(i + 1) % 4] if status == "CONFIRMED" else None, "status": status,
                     "created_at": naive(at), "parcel": {"parcel_code": code(n)}, "household": household_of(n)})
    return rows


def lots() -> list[dict]:
    rows = []
    for i, (status, back, kg) in enumerate([("DRAFT", 2, 420.0), ("DRAFT", 9, 310.0), ("READY", 12, 880.0), ("READY", 25, 640.0),
                                            ("READY", 41, None), ("QR_EXPORTED", 33, 1200.0), ("QR_EXPORTED", 47, 760.0),
                                            ("QR_EXPORTED", 61, 905.5), ("QR_EXPORTED", 75, 530.0), ("QR_EXPORTED", 99, 410.0),
                                            ("READY", 5, 150.0)]):
        at = NOW - timedelta(days=back)
        rows.append({"lot_code": f"TC-CHE-{at:%Y%m%d}-{i + 1:03d}", "commodity": "Chè xanh", "quality_grade": ["Grade 1", "Grade 2", None][i % 3],
                     "harvest_date": naive(at - timedelta(days=3)), "estimated_weight_kg": kg,
                     "actual_weight_kg": None if status == "DRAFT" else (kg or 0) * 0.97, "status": status, "created_at": naive(at),
                     "_parcels": [code(1 + (i * 5 + k) % PARCEL_COUNT) for k in range(3)]})
    return rows


QUIET = {("P-TC-003", "air_humidity"): timedelta(hours=9), ("P-TC-007", "soil_temperature"): timedelta(hours=27)}


def _last_ts(parcel: str, sensor: str) -> datetime:
    return NOW - QUIET.get((parcel, sensor), timedelta(minutes=20 + SENSORS.index(sensor) * 7))


def latest_readings(only: str | None = None) -> list[dict]:
    rows = []
    for parcel in SENSOR_PARCELS:
        if only and parcel != only:
            continue
        for sensor in SENSORS:
            mid, swing = SENSOR_RANGE[sensor]
            ts = _last_ts(parcel, sensor)
            rows.append({"parcel_code": parcel, "sensor": sensor, "ts": aware(ts),
                         "value": round(mid + swing * math.sin(ts.hour / 24 * 6.28) + (SENSOR_PARCELS.index(parcel) % 3), 1)})
    return rows


def daily(only: str | None = None, since=None) -> list[dict]:
    rng = random.Random(11)
    rows = []
    for parcel in SENSOR_PARCELS:
        for sensor in SENSORS:
            mid, swing = SENSOR_RANGE[sensor]
            last = _last_ts(parcel, sensor)
            for back in range(29, -1, -1):
                day = (NOW + timedelta(hours=7)).date() - timedelta(days=back)
                if datetime(day.year, day.month, day.day, tzinfo=UTC) > last:
                    continue
                avg = mid + swing * 0.5 * math.sin(back / 3.0) + rng.uniform(-swing / 4, swing / 4)
                rows.append({"parcel_code": parcel, "sensor": sensor, "day": day.isoformat(), "reading_count": 24 if back else 10,
                             "min_value": max(0.0, round(avg - swing / 2, 1)), "max_value": round(avg + swing / 2, 1), "avg_value": round(avg, 2),
                             "first_ts": aware(datetime(day.year, day.month, day.day, tzinfo=UTC)),
                             "last_ts": aware(datetime(day.year, day.month, day.day, 23, tzinfo=UTC))})
    return [r for r in rows if (not only or r["parcel_code"] == only) and (since is None or r["day"] >= since)]


def runs() -> list[dict]:
    rows = []
    for i in range(12):
        day = (NOW - timedelta(days=31 + i)).date()  # hot data older than 30 days moves to cold
        started = NOW - timedelta(days=1 + i)
        status = "failed" if i == 2 else "done"  # i == 2 started 3 days ago: a failure inside the 7-day window
        quality = {"rows": 2400 + i, "sensors": {s: {"count": 480 + i, "min": 5.0, "max": 80.0, "avg": 41.3} for s in SENSORS},
                   "rejects": {"out_of_range": 2, "bad_topic": 1} if i % 3 == 0 else {}}
        rows.append({"id": f"run{i:02d}", "target": "seaweedfs://dxos-cold/telemetry", "partition_date": day.isoformat(), "status": status,
                     "row_count": None if status == "failed" else 2400 + i, "min_ts": aware(started - timedelta(days=30)),
                     "max_ts": aware(started - timedelta(days=30) + timedelta(hours=23)),
                     "sha256": None if status == "failed" else f"{i:02x}" * 32, "size_bytes": None if status == "failed" else 48213 + i * 100,
                     "quality": None if status == "failed" else quality, "error": "connection refused" if status == "failed" else None,
                     "started_at": aware(started), "finished_at": aware(started + timedelta(minutes=3))})
    return rows


def weather() -> list[dict]:
    return [{"recorded_at": naive(NOW - timedelta(hours=1)), "condition": "Nhiều mây", "temperature_c": 24.5,
             "precipitation_mm": 0.2, "humidity_pct": 81.0, "source": "open-meteo"}]


def prices() -> dict:
    row = lambda c, m_, v, u, s, h: {"commodity": c, "metric": m_, "value": v, "unit": u, "source": s, "fetched_at": naive(NOW - timedelta(hours=h))}
    return {"tea": [row("Tea", "export_price", 3.4, "USD/kg", "Mô phỏng (Toàn quốc)", 5), row("Tea", "producer_price_index", 108.2, "index", "FAOSTAT", 30)],
            "others": [row("Rice", "cereal_yield", 5400.0, "kg/ha", "FAOSTAT", 31)]}


def _count(n: int) -> dict:
    return {"aggregate": {"count": n}}


def answer(payload: dict) -> dict:
    """The core's reply to one request; the variables narrow the rows as Hasura would."""
    query, v = payload["query"], payload.get("variables") or {}
    code_of = v.get("code")
    if query == cc.PARCELS:
        return {"data": {"parcels": parcels()}}
    if query == cc.PARCEL_ONE:
        return {"data": {"parcels": [p for p in parcels() if p["parcel_code"] == code_of]}}
    if query == cc.HOUSEHOLDS:
        return {"data": {"households": [{"id": f"hh{i + 1:02d}", "name": n} for i, n in enumerate(HOUSEHOLDS)]}}
    if query == cc.JOURNALS:
        since = cc.parse_ts(v["since"])
        rows = [j for j in journals() if cc.parse_ts(j["entry_date"]) >= since]
        return {"data": {"journal_entries": sorted(rows, key=lambda j: j["entry_date"], reverse=True)}}
    if query == cc.JOURNALS_PENDING:
        return {"data": {"journal_entries": sorted((j for j in journals() if j["status"] == "PENDING_APPROVAL"), key=lambda j: j["created_at"])}}
    if query == cc.JOURNAL_COUNTS:
        since = cc.parse_ts(v["since"])
        rows = journals()
        return {"data": {"in_period": _count(sum(cc.parse_ts(j["entry_date"]) >= since for j in rows)),
                         "pending": _count(sum(j["status"] == "PENDING_APPROVAL" for j in rows)),
                         "changes": _count(sum(j["status"] == "REQUEST_CHANGES" for j in rows))}}
    if query == cc.PARCEL_JOURNALS:
        mine = [j for j in journals() if j["parcel"]["parcel_code"] == code_of]
        return {"data": {"journal_entries": sorted(mine, key=lambda j: j["entry_date"], reverse=True)[:10]}}
    if query == cc.DISEASES:
        return {"data": {"disease_reports": diseases()}}
    if query == cc.PARCEL_DISEASES:
        return {"data": {"disease_reports": [d for d in diseases() if d["parcel"]["parcel_code"] == code_of][:5]}}
    if query == cc.LOTS:
        return {"data": {"lots": [{k: x for k, x in lot.items() if k != "_parcels"} for lot in lots()]}}
    if query == cc.PARCEL_LOTS:
        return {"data": {"lots": [{k: x for k, x in lot.items() if k != "_parcels"} for lot in lots() if code_of in lot["_parcels"]]}}
    if query == cc.WEATHER:
        return {"data": {"weather_cache": weather() if code_of in SENSOR_PARCELS else []}}
    if query == cc.PRICES:
        return {"data": prices()}
    if query == cc.LATEST_READINGS:
        return {"data": {"telemetry_sensor_readings": latest_readings()}}
    if query == cc.PARCEL_LATEST:
        return {"data": {"telemetry_sensor_readings": latest_readings(code_of)}}
    if query == cc.DAILY:
        return {"data": {"telemetry_sensor_daily": daily(since=v["from"])}}
    if query == cc.PARCEL_DAILY:
        return {"data": {"telemetry_sensor_daily": daily(code_of, v["from"])}}
    if query == cc.RUNS:
        return {"data": {"telemetry_lifecycle_runs": runs()}}
    raise AssertionError("no sample answer for this query: " + query[:60])


def transport(authorization, role, payload, timeout):
    return answer(payload)
