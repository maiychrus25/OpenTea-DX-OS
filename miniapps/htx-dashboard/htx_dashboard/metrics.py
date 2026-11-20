# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Figures and attention rules of the dashboard (spec §5): pure functions over rows the core returned.

Days, weeks and months are Vietnam time (UTC+7, no daylight saving). Weeks start on Monday.
Thresholds are constants of the app for now (spec §5.2).
"""
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Sequence

VN = timezone(timedelta(hours=7))
LIST_LIMIT = 5000  # rows asked of the core per list; a list this long may have been cut (spec §5.1)
JOURNAL_STALE_DAYS = 3
SENSOR_SILENT_HOURS = 6
RECENT_DAYS = 7
COMMODITY_VN = {"Tea": "Chè", "Rice": "Lúa gạo", "Maize": "Ngô", "Wheat": "Lúa mì", "Coffee": "Cà phê", "Sugar": "Đường",
                "Pepper": "Tiêu", "Rubber": "Cao su", "Cassava": "Sắn"}  # a part of the core dashboard's list
SIMULATED_SOURCE = "Mô phỏng (Toàn quốc)"  # as apps/web/src/domain/market/simulated-price.ts

PARCEL_STATUS = {"SOWING": "Đang gieo sạ", "TENDING": "Đang chăm sóc", "HARVEST_APPROVED": "Đã duyệt thu hoạch",
                 "HARVESTED": "Đã thu hoạch", "DRAFT": "Khởi tạo"}
LOT_STATUS = {"DRAFT": "Nháp", "READY": "Sẵn sàng", "QR_EXPORTED": "Đã xuất QR"}
ACTIVITY = {"SOWING": "Gieo sạ", "FERTILIZING": "Bón phân", "SPRAYING": "Phun thuốc", "IRRIGATION": "Tưới tiêu",
            "HARVEST": "Thu hoạch", "OTHER": "Khác"}
JOURNAL_STATUS = ("PENDING_APPROVAL", "REQUEST_CHANGES", "APPROVED", "REJECTED")
DISEASE_STATUS = {"PENDING": "Chờ xử lý", "CONFIRMED": "Đã xác nhận", "REJECTED": "Đã bác bỏ"}


@dataclass(frozen=True)
class Cycle:
    season: str | None
    sowed_at: datetime | None
    estimated_harvest_date: datetime | None


@dataclass(frozen=True)
class Parcel:
    code: str
    household_id: str
    household_name: str
    crop_type: str
    area_ha: float
    status: str
    yield_per_ha: float | None
    cycle: Cycle | None  # the open crop cycle (harvested_at empty), newest first


@dataclass(frozen=True)
class Journal:
    id: str
    parcel_code: str
    household_name: str
    entry_date: datetime
    activity_type: str
    status: str
    created_at: datetime
    performed_by: str


@dataclass(frozen=True)
class Disease:
    id: str
    parcel_code: str
    household_name: str
    detection_date: datetime
    ai_name: str
    confidence: float
    confirmed: str | None
    status: str
    created_at: datetime


@dataclass(frozen=True)
class Lot:
    code: str
    commodity: str
    grade: str | None
    harvest_date: datetime
    estimated_kg: float | None
    actual_kg: float | None
    status: str
    created_at: datetime


@dataclass(frozen=True)
class Reading:
    parcel_code: str
    sensor: str
    ts: datetime
    value: float


@dataclass(frozen=True)
class Daily:
    parcel_code: str
    sensor: str
    day: date
    count: int
    min: float
    max: float
    avg: float
    first_ts: datetime
    last_ts: datetime


@dataclass(frozen=True)
class Run:
    id: str
    target: str
    partition_date: date
    status: str
    row_count: int | None
    min_ts: datetime | None
    max_ts: datetime | None
    sha256: str | None
    size_bytes: int | None
    quality: object
    error: str | None
    started_at: datetime
    finished_at: datetime | None


@dataclass(frozen=True)
class Price:
    commodity: str
    metric: str
    value: float
    unit: str
    source: str
    fetched_at: datetime

    @property
    def simulated(self) -> bool:
        return self.source == SIMULATED_SOURCE


# ---------- Vietnam-time helpers ----------

def vn_day(ts: datetime) -> date:
    return ts.astimezone(VN).date()


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def period_start(now: datetime, days: int) -> datetime:
    """Midnight (Vietnam) of the first of the last `days` days, today included."""
    first = vn_day(now) - timedelta(days=days - 1)
    return datetime(first.year, first.month, first.day, tzinfo=VN)


def in_period(ts: datetime, now: datetime, days: int) -> bool:
    return ts >= period_start(now, days)


def weekly_counts(timestamps: Iterable[datetime], now: datetime, days: int) -> list[tuple[date, int]]:
    """One count per Monday-start week from the first day of the period to the current week; empty weeks are zero."""
    first = week_start(period_start(now, days).date())
    last = week_start(vn_day(now))
    counts = Counter(week_start(vn_day(t)) for t in timestamps if in_period(t, now, days))
    weeks, day = [], first
    while day <= last:
        weeks.append((day, counts.get(day, 0)))
        day += timedelta(days=7)
    return weeks


def week_label(day: date) -> str:
    return day.strftime("%d/%m")


def age_text(ts: datetime, now: datetime) -> str:
    seconds = max(0, int((now - ts).total_seconds()))
    if seconds < 600:
        return "vừa xong"
    if seconds < 3600:
        return f"{seconds // 60} phút trước"
    if seconds < 86400:
        return f"{seconds // 3600} giờ trước"
    return f"{seconds // 86400} ngày trước"


def capped(count: int, limit: int = LIST_LIMIT) -> bool:
    return count >= limit


def _ranked(counter: Counter) -> list[tuple[str, int]]:
    return sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))


# ---------- parcels, area, yield, harvest ----------

def total_area(parcels: Sequence[Parcel]) -> float:
    return sum(p.area_ha for p in parcels)


def parcels_by_status(parcels: Sequence[Parcel]) -> list[tuple[str, int]]:
    count = Counter(p.status for p in parcels)
    return [(label, count.get(key, 0)) for key, label in PARCEL_STATUS.items()]


def cultivating(parcels: Sequence[Parcel]) -> int:
    """Parcels with an open crop cycle (spec §5.1)."""
    return sum(1 for p in parcels if p.cycle is not None)


@dataclass(frozen=True)
class Yield:
    kg: float
    parcels: int
    missing: int  # parcels counted as growing that have no yield per ha


def expected_yield(parcels: Sequence[Parcel]) -> Yield:
    """As /manager/dashboard of the core: parcels not HARVESTED and not DRAFT, area × yield per ha."""
    growing = [p for p in parcels if p.status not in ("HARVESTED", "DRAFT")]
    kg = sum(p.area_ha * p.yield_per_ha for p in growing if p.yield_per_ha is not None)
    return Yield(kg, len(growing), sum(1 for p in growing if p.yield_per_ha is None))


@dataclass(frozen=True)
class Harvest:
    overdue: list[Parcel]
    upcoming_7: list[Parcel]
    upcoming_30: list[Parcel]
    without_date: int


def harvest_date(p: Parcel) -> date | None:
    if p.cycle is None or p.cycle.estimated_harvest_date is None:
        return None
    return vn_day(p.cycle.estimated_harvest_date)


def harvest_calendar(parcels: Sequence[Parcel], now: datetime) -> Harvest:
    """Overdue: the estimated day is before today (Vietnam). Due today counts as upcoming, not overdue."""
    today = vn_day(now)
    dated = sorted(((harvest_date(p), p) for p in parcels if harvest_date(p) is not None), key=lambda x: (x[0], x[1].code))
    return Harvest(
        overdue=[p for d, p in dated if d < today],
        upcoming_7=[p for d, p in dated if 0 <= (d - today).days <= 7],
        upcoming_30=[p for d, p in dated if 0 <= (d - today).days <= 30],
        without_date=sum(1 for p in parcels if p.cycle is not None and p.cycle.estimated_harvest_date is None),
    )


def expected_by_month(parcels: Sequence[Parcel]) -> list[tuple[str, float]]:
    """Expected kg by month of the estimated harvest day, for open crop cycles that have both a date and a yield."""
    sums: dict[tuple[int, int], float] = {}
    for p in parcels:
        d = harvest_date(p)
        if d is not None and p.yield_per_ha is not None:
            sums[(d.year, d.month)] = sums.get((d.year, d.month), 0.0) + p.area_ha * p.yield_per_ha
    return [(f"{m:02d}/{y}", kg) for (y, m), kg in sorted(sums.items())]


# ---------- journals ----------

def pending_over(rows: Sequence[Journal], now: datetime, days: int = JOURNAL_STALE_DAYS) -> list[Journal]:
    return [e for e in rows if e.status == "PENDING_APPROVAL" and now - e.created_at > timedelta(days=days)]


def journal_status_counts(rows: Sequence[Journal]) -> dict[str, int]:
    count = Counter(e.status for e in rows)
    return {status: count.get(status, 0) for status in JOURNAL_STATUS}


def by_activity(rows: Sequence[Journal]) -> list[tuple[str, int]]:
    return _ranked(Counter(ACTIVITY.get(e.activity_type, e.activity_type) for e in rows))


def top_households(rows: Sequence[Journal], n: int = 10) -> list[tuple[str, int]]:
    return _ranked(Counter(e.household_name for e in rows))[:n]


def households_without_entries(names: Iterable[str], rows: Sequence[Journal]) -> list[str]:
    seen = {e.household_name for e in rows}
    return sorted(n for n in set(names) if n not in seen)


# ---------- disease reports ----------

def disease_pending(rows: Sequence[Disease]) -> int:
    return sum(1 for d in rows if d.status == "PENDING")


def disease_recent(rows: Sequence[Disease], now: datetime, days: int = RECENT_DAYS) -> int:
    return sum(1 for d in rows if now - d.created_at <= timedelta(days=days))


def disease_kind(d: Disease) -> str:
    """The kind of a report: the confirmed diagnosis, else the AI's name marked as a guess. Rejection is a status, not a kind."""
    return d.confirmed or f"{d.ai_name} (AI dự đoán)"


def disease_kinds(rows: Sequence[Disease]) -> list[tuple[str, int]]:
    return _ranked(Counter(disease_kind(d) for d in rows))


def disease_by_status(rows: Sequence[Disease]) -> list[tuple[str, int]]:
    count = Counter(d.status for d in rows)
    return [(label, count.get(key, 0)) for key, label in DISEASE_STATUS.items()]


def disease_by_parcel(rows: Sequence[Disease], n: int = 5) -> list[tuple[str, int]]:
    return _ranked(Counter(d.parcel_code for d in rows))[:n]


# ---------- lots ----------

def lots_by_status(rows: Sequence[Lot]) -> list[tuple[str, int]]:
    count = Counter(lot.status for lot in rows)
    return [(label, count.get(key, 0)) for key, label in LOT_STATUS.items()]


def lot_weight_by_status(rows: Sequence[Lot]) -> list[tuple[str, float]]:
    return [(label, float(sum(lot.estimated_kg or 0 for lot in rows if lot.status == key)))
            for key, label in LOT_STATUS.items()]


def lots_by_month(rows: Sequence[Lot], now: datetime, months: int = 6) -> list[tuple[str, int]]:
    count = Counter((vn_day(lot.created_at).year, vn_day(lot.created_at).month) for lot in rows)
    return [(f"{m:02d}/{y}", count.get((y, m), 0)) for y, m in _month_keys(now, months)]


# ---------- sensors and data lifecycle ----------

def silent_sensors(latest: Sequence[Reading], now: datetime) -> list[Reading]:
    """(parcel, sensor) pairs whose newest reading is more than 6 hours old."""
    return [r for r in latest if now - r.ts > timedelta(hours=SENSOR_SILENT_HOURS)]


@dataclass(frozen=True)
class SensorSummary:
    parcels: int
    sensors: int
    silent: int


def sensor_summary(latest: Sequence[Reading], now: datetime) -> SensorSummary:
    return SensorSummary(len({r.parcel_code for r in latest}), len(latest), len(silent_sensors(latest, now)))


def failed_runs(rows: Sequence[Run], now: datetime) -> list[Run]:
    return [r for r in rows if r.status == "failed" and now - r.started_at <= timedelta(days=RECENT_DAYS)]


@dataclass(frozen=True)
class Quality:
    rows: int
    sensors: list[tuple[str, int, float, float, float]]  # sensor, count, min, max, avg
    rejects: int


def _num(value) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def quality_summary(raw: object) -> Quality | None:
    """The `quality` JSON of telemetry.lifecycle_runs: {rows, sensors: {name: {count,min,max,avg}}, rejects: {reason: n}}.
    Any other shape reads as missing or empty, never as an error."""
    if not isinstance(raw, dict):
        return None
    rows = raw.get("rows")
    sensors = []
    if isinstance(raw.get("sensors"), dict):
        for name, s in sorted(raw["sensors"].items()):
            if isinstance(s, dict) and all(_num(s.get(k)) is not None for k in ("count", "min", "max", "avg")):
                sensors.append((str(name), int(s["count"]), float(s["min"]), float(s["max"]), float(s["avg"])))
    rejects = raw.get("rejects")
    return Quality(
        rows=rows if isinstance(rows, int) and not isinstance(rows, bool) else 0,
        sensors=sensors,
        rejects=sum(v for v in rejects.values() if isinstance(v, int) and not isinstance(v, bool))
        if isinstance(rejects, dict) else 0)


SENSOR = {"soil_moisture": ("Độ ẩm đất", "%"), "soil_temperature": ("Nhiệt độ đất", "°C"),
          "air_temperature": ("Nhiệt độ không khí", "°C"), "air_humidity": ("Độ ẩm không khí", "%"),
          "rainfall": ("Lượng mưa", "mm")}  # the five sensors the platform accepts (platform/dataops payload.SENSORS)


def sensor_label(name: str) -> tuple[str, str]:
    return SENSOR.get(name, (name, ""))


@dataclass(frozen=True)
class SensorStats:
    min: float
    max: float
    avg: float
    count: int


def sensor_stats(daily: Sequence[Daily]) -> SensorStats | None:
    """Minimum, maximum and the reading-weighted average of one sensor over its daily rows."""
    if not daily:
        return None
    count = sum(d.count for d in daily)
    avg = sum(d.avg * d.count for d in daily) / count if count else sum(d.avg for d in daily) / len(daily)
    return SensorStats(min(d.min for d in daily), max(d.max for d in daily), avg, count)


def hot_rows_by_day(daily: Sequence[tuple[date, int]]) -> list[tuple[date, int]]:
    """Stored readings per Vietnam day; the view has one row per parcel and sensor, so a day comes in many rows."""
    count: Counter = Counter()
    for day, n in daily:
        count[day] += n
    return sorted(count.items())


# ---------- attention (spec §5.2) ----------

@dataclass(frozen=True)
class Attention:
    key: str
    text: str
    count: int
    target: str  # a key the routes turn into a link: a page of the core or of this app


def attention(*, pending_stale: int, disease_pending: int, disease_recent: int, silent: int, harvest_week: int,
              harvest_overdue: int, failed_runs: int) -> list[Attention]:
    rules = (
        ("journal", pending_stale, f"nhật ký chờ duyệt quá {JOURNAL_STALE_DAYS} ngày", "journal_approve"),
        ("disease", disease_pending, "báo cáo bệnh chờ xử lý", "health"),
        ("disease_new", disease_recent, f"báo cáo bệnh mới trong {RECENT_DAYS} ngày", "health"),
        ("sensor", silent, f"cảm biến không gửi số đo quá {SENSOR_SILENT_HOURS} giờ", "data"),
        ("harvest_week", harvest_week, f"vụ dự kiến thu hoạch trong {RECENT_DAYS} ngày tới", "schedule"),
        ("harvest_overdue", harvest_overdue, "vụ đã quá ngày thu hoạch dự kiến mà chưa thu", "schedule"),
        ("lifecycle", failed_runs, f"lần chuyển dữ liệu sang kho lạnh bị lỗi trong {RECENT_DAYS} ngày", "data"),
    )
    return [Attention(key, text, count, target) for key, count, text, target in rules if count > 0]


# ---------- prices (tea rows only) ----------

# The names the core dashboard (apps/web/src/app/manager/dashboard/page.tsx) gives the metrics, plus the three the
# market_data schema comment lists that it leaves out; any other name is shown with its underscores as spaces.
METRIC_VN = {"crop_production_index": "Chỉ số SX nông nghiệp", "food_production_index": "Chỉ số SX lương thực",
             "fertilizer_consumption": "Tiêu thụ phân bón", "cereal_production": "Sản lượng ngũ cốc",
             "cereal_yield": "Năng suất ngũ cốc", "producer_price_index": "Chỉ số giá sản xuất",
             "consumer_price_index": "Chỉ số giá tiêu dùng", "export_price": "Giá xuất khẩu", "import_tariff": "Thuế nhập khẩu",
             "production_volume": "Sản lượng"}


def metric_vn(metric: str) -> str:
    return METRIC_VN.get(metric, metric.replace("_", " "))


# ---------- 0.2.0 figures: previous period, weekly stacks, daily averages, freshness, funnels, prices, runs ----------

def previous_count(timestamps: Iterable[datetime], now: datetime, days: int) -> int:
    """Rows of the period before the current one, the same length: [start - days, start)."""
    low, high = period_start(now, 2 * days), period_start(now, days)
    return sum(1 for t in timestamps if low <= t < high)


def calendar_counts(timestamps: Iterable[datetime], now: datetime, days: int) -> dict[date, int]:
    """Rows per Vietnam day inside the period, for the calendar heatmap."""
    return dict(Counter(vn_day(t) for t in timestamps if in_period(t, now, days)))


def _stacked(pairs: Iterable[tuple[date, str]], weeks: list[date], names: Sequence[str]) -> tuple[list[date], list[str], list[list[int]]]:
    count = Counter(pairs)
    kept = [n for n in names if any(count.get((w, n), 0) for w in weeks)]
    return weeks, kept, [[count.get((w, n), 0) for w in weeks] for n in kept]


def activity_by_week(rows: Sequence[Journal], now: datetime, days: int) -> tuple[list[date], list[str], list[list[int]]]:
    """Journal entries per week stacked by activity type, in the order of ACTIVITY; activities with no entry are left out."""
    weeks = [w for w, _ in weekly_counts([e.entry_date for e in rows], now, days)]
    pairs = [(week_start(vn_day(e.entry_date)), ACTIVITY.get(e.activity_type, e.activity_type)) for e in rows
             if in_period(e.entry_date, now, days)]
    return _stacked(pairs, weeks, list(ACTIVITY.values()))


def disease_by_week(rows: Sequence[Disease], now: datetime, days: int, top: int = 4) -> tuple[list[date], list[str], list[list[int]]]:
    """Reports per week stacked by kind: the `top` most reported kinds of the period, the rest as one 'Khác'."""
    inside = [d for d in rows if in_period(d.created_at, now, days)]
    weeks = [w for w, _ in weekly_counts([d.created_at for d in inside], now, days)]
    kinds = [k for k, _ in disease_kinds(inside)]
    named = kinds[:top]
    pairs = [(week_start(vn_day(d.created_at)), disease_kind(d) if disease_kind(d) in named else "Khác") for d in inside]
    return _stacked(pairs, weeks, named + (["Khác"] if len(kinds) > top else []))


CONFIDENCE_BINS = (("dưới 60%", 0.0, 0.6), ("60–69%", 0.6, 0.7), ("70–79%", 0.7, 0.8), ("80–89%", 0.8, 0.9), ("từ 90%", 0.9, 1.01))


def confidence_bins(rows: Sequence[Disease]) -> list[tuple[str, int]]:
    """How sure the AI was: each report falls into one bin (confidence is a share from 0 to 1)."""
    return [(label, sum(1 for d in rows if low <= d.confidence < high)) for label, low, high in CONFIDENCE_BINS]


def confirmed_vs_ai(rows: Sequence[Disease]) -> list[tuple[str, int]]:
    return [("Đã xác nhận", sum(1 for d in rows if d.status == "CONFIRMED")),
            ("Chỉ AI, chưa xác nhận", sum(1 for d in rows if d.status == "PENDING")),
            ("Bị bác bỏ", sum(1 for d in rows if d.status == "REJECTED"))]


def expected_by_crop(parcels: Sequence[Parcel]) -> list[tuple[str, float]]:
    """Expected kg per crop of the growing parcels, the core's definition (see expected_yield), largest first."""
    growing = [p for p in parcels if p.status not in ("HARVESTED", "DRAFT")]
    kg: dict[str, float] = {}
    for p in growing:
        kg[p.crop_type] = kg.get(p.crop_type, 0.0) + (p.area_ha * p.yield_per_ha if p.yield_per_ha is not None else 0.0)
    return sorted(kg.items(), key=lambda kv: (-kv[1], kv[0]))


def lots_funnel(rows: Sequence[Lot]) -> list[tuple[str, int]]:
    """Lots that reached each stage: a lot is counted at every stage it passed (DRAFT, READY, QR_EXPORTED in that order)."""
    return [("Đã tạo", len(rows)), ("Sẵn sàng", sum(1 for lot in rows if lot.status in ("READY", "QR_EXPORTED"))),
            ("Đã xuất QR", sum(1 for lot in rows if lot.status == "QR_EXPORTED"))]


def _month_keys(now: datetime, months: int) -> list[tuple[int, int]]:
    today = vn_day(now)
    keys, year, month = [], today.year, today.month
    for _ in range(months):
        keys.append((year, month))
        year, month = (year, month - 1) if month > 1 else (year - 1, 12)
    return list(reversed(keys))


def lots_by_month_status(rows: Sequence[Lot], now: datetime, months: int = 6) -> tuple[list[str], list[str], list[list[int]]]:
    keys = _month_keys(now, months)
    count = Counter(((vn_day(lot.created_at).year, vn_day(lot.created_at).month), lot.status) for lot in rows)
    names = list(LOT_STATUS.values())
    return ([f"{m:02d}/{y}" for y, m in keys], names,
            [[count.get((k, status), 0) for k in keys] for status in LOT_STATUS])


def lot_pairs(rows: Sequence[Lot], n: int = 12) -> list[Lot]:
    """The newest lots that have both an estimated and an actual weight."""
    return [lot for lot in rows if lot.estimated_kg is not None and lot.actual_kg is not None][:n]


def lot_grades(rows: Sequence[Lot]) -> list[tuple[str, int]]:
    return _ranked(Counter(lot.grade or "Chưa phân hạng" for lot in rows))


def sensor_day_averages(rows: Sequence[Daily]) -> dict[str, list[tuple[date, float]]]:
    """Per sensor and day, the average of the parcels' daily averages, each weighted by its reading count."""
    total: dict[tuple[str, date], list[float]] = {}
    for d in rows:
        acc = total.setdefault((d.sensor, d.day), [0.0, 0.0])
        acc[0] += d.avg * d.count
        acc[1] += d.count
    out: dict[str, list[tuple[date, float]]] = {}
    for (sensor, day), (weighted, count) in sorted(total.items()):
        if count > 0:
            out.setdefault(sensor, []).append((day, weighted / count))
    return out


def series_by_day(rows: Sequence[Daily], start: date, end: date) -> dict[tuple[str, str], list[float | None]]:
    """Per (parcel, sensor), the weighted average of each day from start to end; a day without readings is None."""
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    total: dict[tuple[str, str, date], list[float]] = {}
    for d in rows:
        if start <= d.day <= end:
            acc = total.setdefault((d.parcel_code, d.sensor, d.day), [0.0, 0.0])
            acc[0] += d.avg * d.count
            acc[1] += d.count
    series: dict[tuple[str, str], list[float | None]] = {}
    for (parcel, sensor, day), (weighted, count) in total.items():
        values = series.setdefault((parcel, sensor), [None] * len(days))
        if count > 0:
            values[(day - start).days] = weighted / count
    return series


def sensor_parcels(latest: Sequence[Reading]) -> list[str]:
    return sorted({r.parcel_code for r in latest})


def freshness(codes: Sequence[str], latest: Sequence[Reading], now: datetime) -> dict[tuple[str, str], str]:
    """For every parcel and every sensor the platform accepts: 'fresh', 'silent' (no reading within the silent window) or
    'none' (no reading in the hot store)."""
    last = {}
    for r in latest:
        last[(r.parcel_code, r.sensor)] = max(r.ts, last.get((r.parcel_code, r.sensor), r.ts))
    state = {}
    for code in codes:
        for sensor in SENSOR:
            ts = last.get((code, sensor))
            state[(code, sensor)] = "none" if ts is None else (
                "silent" if now - ts > timedelta(hours=SENSOR_SILENT_HOURS) else "fresh")
    return state


def readings_by_sensor(rows: Sequence[Daily]) -> list[tuple[str, int]]:
    """Stored readings per sensor over the hot store, in the order of SENSOR."""
    count = Counter()
    for d in rows:
        count[d.sensor] += d.count
    return [(sensor_label(s)[0], count[s]) for s in SENSOR if count.get(s)]


def price_series(rows: Sequence[Price], metric: str) -> list[tuple[datetime, float]]:
    """The values of one metric over time, oldest first."""
    return sorted(((p.fetched_at, p.value) for p in rows if p.metric == metric), key=lambda x: x[0])


@dataclass(frozen=True)
class RunVolume:
    day: date
    rows: int
    size_bytes: int
    failed: bool


def run_volume(rows: Sequence[Run]) -> list[RunVolume]:
    """One entry per lifecycle run, by the day of its data; a failed run has no rows and is marked."""
    return sorted((RunVolume(r.partition_date, r.row_count or 0, r.size_bytes or 0, r.status == "failed") for r in rows),
                  key=lambda v: v.day)


def area_by_crop(parcels: Sequence[Parcel]) -> list[tuple[str, float]]:
    """Hectares per crop of every parcel (any status), largest first."""
    ha: dict[str, float] = {}
    for p in parcels:
        ha[p.crop_type] = ha.get(p.crop_type, 0.0) + p.area_ha
    return sorted(ha.items(), key=lambda kv: (-kv[1], kv[0]))


def busiest_day(counts: dict[date, int]) -> tuple[date, int] | None:
    """The day with the most rows; the earlier day wins a tie."""
    if not counts:
        return None
    day = max(sorted(counts), key=lambda d: counts[d])
    return day, counts[day]
