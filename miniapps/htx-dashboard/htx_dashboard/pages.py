# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""One builder per tab: runs the tab's core queries in parallel, turns the rows into figures with `metrics`, draws them with
`charts` and returns the context its template shows. A block that failed is None here and the template shows the error
text in its place; a chart whose rows are missing or empty says so instead of drawing nothing."""
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from htx_dashboard import appkit, charts
from htx_dashboard import core_client as cc
from htx_dashboard import metrics as m

PERIODS = (7, 30, 90)
DEFAULT_DAYS = 30
SENSOR_DAYS_MAX = 30  # the hot store keeps readings 30 days (DXOS_HOT_RETENTION_DAYS)
PARCEL_CODE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$")
ERROR_TEXT = "Chưa lấy được dữ liệu, thử tải lại"
STATUS_CLASS = {"SOWING": "sowing", "TENDING": "tending", "HARVEST_APPROVED": "harvest-approved", "HARVESTED": "harvested",
                "DRAFT": "draft"}
GANTT_LANES = 15  # the crop-cycle and harvest timelines list this many lanes; the rest is counted in a note


def parse_days(raw: str | None) -> int:
    value = appkit.parse_int(raw, 1, 365)
    return value if value in PERIODS else DEFAULT_DAYS


def day_text(day: date) -> str:
    return day.strftime("%d/%m/%Y")


def ok(results: dict, name: str):
    """The value of a block, or None when it failed (the template then prints ERROR_TEXT)."""
    result = results[name]
    return result.value if result.ok else None


def block(query: str, parse, **variables) -> cc.Block:
    return cc.Block(query, variables, parse)


def limited() -> dict:
    return {"limit": cc.LIMIT}


def iso(ts: datetime) -> str:
    return ts.isoformat()


def cap_note(rows, what: str, limit: int | None = None) -> str | None:
    limit = limit or cc.LIMIT
    if rows is not None and m.capped(len(rows), limit):
        return f"Chỉ tính trên {appkit.number(limit, 0)} dòng mới nhất của {what}."
    return None


def kg_text(kg: float) -> str:
    return f"{appkit.number(kg / 1000, 1)} tấn" if kg >= 1000 else f"{appkit.number(kg, 0)} kg"


def sensor_window(now: datetime, days: int) -> tuple[date, date, int]:
    """The days the sensor charts show: the period, but never more than the hot store keeps."""
    window = min(days, SENSOR_DAYS_MAX)
    end = m.vn_day(now)
    return end - timedelta(days=window - 1), end, window


def tile(label: str, value, hint: str = "", missing: bool = False, delta=None, spark=None) -> dict:
    if missing:
        return {"label": label, "value": "—", "hint": ERROR_TEXT, "delta": None, "spark": None}
    return {"label": label, "value": value, "hint": hint, "delta": delta, "spark": spark}


def weekly_values(timestamps, now, days) -> list[int]:
    return [n for _, n in m.weekly_counts(timestamps, now, days)]


def spark_of(values):
    """No line for a period with nothing in it: a flat line would read as a value."""
    return charts.sparkline(values) if values and len(values) > 1 and any(values) else None


def line_of(rows: dict[str, list] | None, sensor: str):
    """A daily line for one sensor from the coop-wide averages (no band: one number per day)."""
    if not rows or sensor not in rows:
        return None
    return charts.line_chart([charts.Point(d, v, v, v) for d, v in rows[sensor]], area=True)


def status_items(parcels) -> list[tuple[str, int]]:
    return [(label, n) for label, n in m.parcels_by_status(parcels) if n]


# ---------------------------------------------------------------- sensor health matrix (shared by overview and data)

@dataclass(frozen=True)
class MatrixCell:
    state: str
    text: str
    title: str


MATRIX_TEXT = {"fresh": "ổn", "silent": "im lặng", "none": "chưa có"}
SENSOR_SHORT = {"soil_moisture": "Ẩm đất", "soil_temperature": "Nhiệt đất", "air_temperature": "Nhiệt khí",
                "air_humidity": "Ẩm khí", "rainfall": "Mưa"}  # the matrix's column headers, short enough for a phone


def freshness_matrix(latest, now) -> dict | None:
    """Parcels that send readings (rows) by the five sensors (columns); every cell says its state in words."""
    if latest is None:
        return None
    codes = m.sensor_parcels(latest)
    state = m.freshness(codes, latest, now)
    last = {}
    for r in latest:
        last[(r.parcel_code, r.sensor)] = max(r.ts, last.get((r.parcel_code, r.sensor), r.ts))
    rows = []
    for code in codes:
        cells = []
        for sensor in m.SENSOR:
            ts = last.get((code, sensor))
            title = f"{code} · {m.sensor_label(sensor)[0]}: " + (f"số đo {m.age_text(ts, now)}" if ts else "chưa có số đo")
            cells.append(MatrixCell(state[(code, sensor)], MATRIX_TEXT[state[(code, sensor)]], title))
        rows.append((code, cells))
    share = 100 * sum(1 for v in state.values() if v == "fresh") / len(state) if state else 0.0
    return {"columns": [SENSOR_SHORT[s] for s in m.SENSOR], "rows": rows, "ring": charts.ring(share),
            "ring_text": f"{appkit.number(share, 0)} %"}


# ---------------------------------------------------------------- overview: the command centre

def overview(core: cc.Core, auth: str, htx: str, now: datetime, days: int) -> dict:
    since = iso(m.period_start(now, days))
    from_previous = iso(m.period_start(now, 2 * days))
    sensor_from, _, _ = sensor_window(now, days)
    r = core.run(auth, {
        "parcels": block(cc.PARCELS, cc.parse_parcels, **limited()),
        "households": block(cc.HOUSEHOLDS, cc.parse_households, **limited()),
        "journals": block(cc.JOURNALS, cc.parse_journals, since=since, **limited()),
        "pending": block(cc.JOURNALS_PENDING, cc.parse_journals, **limited()),
        "counts": block(cc.JOURNAL_COUNTS, cc.parse_journal_counts, since=since, from_previous=from_previous),
        "diseases": block(cc.DISEASES, cc.parse_diseases, **limited()),
        "lots": block(cc.LOTS, cc.parse_lots, **limited()),
        "latest": block(cc.LATEST_READINGS, cc.parse_readings, htx=htx, **limited()),
        "runs": block(cc.RUNS, cc.parse_runs, htx=htx, limit=60),
        "prices": block(cc.PRICES, cc.parse_prices),
        "sensors": block(cc.SENSOR_DAILY, cc.parse_daily, htx=htx, limit=cc.HOT_LIMIT, **{"from": sensor_from.isoformat()}),
    })
    parcels, households, journals, pending = ok(r, "parcels"), ok(r, "households"), ok(r, "journals"), ok(r, "pending")
    counts, diseases, lots, latest, runs = ok(r, "counts"), ok(r, "diseases"), ok(r, "lots"), ok(r, "latest"), ok(r, "runs")
    sensors, prices = ok(r, "sensors"), ok(r, "prices")

    harvest = m.harvest_calendar(parcels, now) if parcels is not None else None
    stale = m.pending_over(pending, now) if pending is not None else None
    summary = m.sensor_summary(latest, now) if latest is not None else None
    in_period = [d for d in diseases if m.in_period(d.created_at, now, days)] if diseases is not None else None
    yield_ = m.expected_yield(parcels) if parcels is not None else None

    # Attention rows need every source of the rule; a rule whose source failed is named under the list, not hidden.
    unchecked = [label for label, value in (("nhật ký chờ duyệt", stale), ("báo cáo bệnh", diseases), ("cảm biến", latest),
                                            ("lịch thu hoạch", harvest), ("chuyển dữ liệu sang kho lạnh", runs)) if value is None]
    items = m.attention(
        pending_stale=len(stale) if stale is not None else 0,
        disease_pending=m.disease_pending(diseases) if diseases is not None else 0,
        disease_recent=m.disease_recent(diseases, now) if diseases is not None else 0,
        silent=summary.silent if summary else 0,
        harvest_week=len(harvest.upcoming_7) if harvest else 0,
        harvest_overdue=len(harvest.overdue) if harvest else 0,
        failed_runs=len(m.failed_runs(runs, now)) if runs is not None else 0)

    # Key figures: each carries the change against the period before and a sparkline of its weeks.
    disease_weeks = weekly_values([d.created_at for d in diseases], now, days) if diseases is not None else None
    lot_weeks = weekly_values([lot.created_at for lot in lots], now, days) if lots is not None else None
    journal_weeks = weekly_values([j.entry_date for j in journals], now, days) if journals is not None else None
    kpis = [
        tile("Thửa chè", appkit.number(len(parcels), 0) if parcels is not None else 0,
             f"tổng {appkit.number(m.total_area(parcels), 1)} ha" if parcels is not None else "", parcels is None),
        tile("Sản lượng kỳ vọng", kg_text(yield_.kg) if yield_ else 0,
             (f"{yield_.missing} thửa chưa khai năng suất" if yield_.missing else f"{yield_.parcels} thửa đang chăm sóc") if yield_ else "",
             yield_ is None),
        tile(f"Nhật ký {days} ngày", appkit.number(counts.in_period, 0) if counts else 0,
             f"{counts.pending} chờ duyệt" if counts else "", counts is None,
             charts.delta(counts.in_period, counts.previous) if counts else None, spark_of(journal_weeks)),
        tile(f"Báo cáo bệnh {days} ngày", appkit.number(len(in_period), 0) if in_period is not None else 0,
             f"{m.disease_pending(diseases)} chờ xử lý" if diseases is not None else "", in_period is None,
             charts.delta(len(in_period), m.previous_count([d.created_at for d in diseases], now, days)) if in_period is not None else None,
             spark_of(disease_weeks)),
        tile("Cảm biến im lặng", appkit.number(summary.silent, 0) if summary else 0,
             f"trên {summary.parcels} thửa, {summary.sensors} cảm biến" if summary else "", summary is None),
        tile(f"Lô chè {days} ngày", appkit.number(sum(1 for lot in lots if m.in_period(lot.created_at, now, days)), 0)
             if lots is not None else 0, "lô chè được tạo trong kỳ", lots is None,
             charts.delta(sum(1 for lot in lots if m.in_period(lot.created_at, now, days)),
                          m.previous_count([lot.created_at for lot in lots], now, days)) if lots is not None else None,
             spark_of(lot_weeks)),
    ]

    # The charts of the grid.
    status = charts.donut(status_items(parcels), appkit.number(len(parcels), 0)) if parcels else None
    crops = [(crop, ha) for crop, ha in m.area_by_crop(parcels)] if parcels else []
    activity = None
    if journals:
        weeks, names, series = m.activity_by_week(journals, now, days)
        activity = charts.column_chart([m.week_label(w) for w in weeks], series, names, digits=0) if names else None
    coop_days = m.sensor_day_averages(sensors) if sensors is not None else None
    sensor_lines = [(m.sensor_label(s)[0], m.sensor_label(s)[1], line_of(coop_days, s)) for s in m.SENSOR]
    disease_chart = None
    if diseases:
        weeks, names, series = m.disease_by_week(diseases, now, days)
        disease_chart = charts.column_chart([m.week_label(w) for w in weeks], series, names, digits=0) if names else None
    timeline = None
    if harvest is not None:
        lanes = [charts.Lane(f"{p.code} · {p.household_name}", None, m.harvest_date(p), "overdue" if m.harvest_date(p) < m.vn_day(now) else "plan")
                 for p in (harvest.overdue + harvest.upcoming_30)[:GANTT_LANES]]
        timeline = charts.timeline(lanes, m.vn_day(now)) if lanes else None
    price_points = [charts.Point(m.vn_day(t), v, v, v) for t, v in m.price_series(prices or [], "export_price")]
    latest_prices = list({p.metric: p for p in prices or []}.values())[:3]

    return {
        "r": r, "days": days, "attention": items, "unchecked": unchecked, "kpis": kpis,
        "status": status, "status_items": status_items(parcels) if parcels else [], "crops_rows": charts.bar_rows(crops, digits=1),
        "activity": activity, "activity_empty": journals is not None and not journals,
        "sensor_lines": sensor_lines, "sensor_days": sensor_window(now, days)[2], "sensor_empty": sensors is not None and not sensors,
        "matrix": freshness_matrix(latest, now), "disease": disease_chart, "diseases_empty": diseases is not None and not diseases,
        "funnel": charts.funnel_steps(m.lots_funnel(lots)) if lots else None, "lots_empty": lots is not None and not lots,
        "timeline": timeline, "harvest_count": len(harvest.upcoming_30) + len(harvest.overdue) if harvest else 0,
        "harvest_extra": max(0, len(harvest.upcoming_30) + len(harvest.overdue) - GANTT_LANES) if harvest else 0,
        "price": charts.line_chart(price_points, area=True) if len(price_points) > 1 else None,
        "prices": latest_prices,
        "notes": [n for n in (cap_note(parcels, "thửa"), cap_note(journals, "nhật ký"), cap_note(diseases, "báo cáo bệnh"),
                              cap_note(lots, "lô chè")) if n],
        "sensor_note": "Cảm biến im lặng chỉ tính trong 30 ngày gần nhất: kho nóng không giữ số đo cũ hơn.",
    }


# ---------------------------------------------------------------- production

@dataclass(frozen=True)
class HarvestRow:
    code: str
    household: str
    due: date
    days_left: int
    kg: float | None
    overdue: bool


def production(core: cc.Core, auth: str, htx: str, now: datetime, days: int) -> dict:
    since = iso(m.period_start(now, days))
    r = core.run(auth, {
        "parcels": block(cc.PARCELS, cc.parse_parcels, **limited()),
        "households": block(cc.HOUSEHOLDS, cc.parse_households, **limited()),
        "journals": block(cc.JOURNALS, cc.parse_journals, since=since, **limited()),
        "counts": block(cc.JOURNAL_COUNTS, cc.parse_journal_counts, since=since, from_previous=iso(m.period_start(now, 2 * days))),
    })
    parcels, households, journals, counts = ok(r, "parcels"), ok(r, "households"), ok(r, "journals"), ok(r, "counts")
    today = m.vn_day(now)
    harvest_rows = []
    harvest = None
    if parcels is not None:
        harvest = m.harvest_calendar(parcels, now)
        for p in harvest.overdue + harvest.upcoming_30:
            due = m.harvest_date(p)
            harvest_rows.append(HarvestRow(p.code, p.household_name, due, (due - today).days,
                                           p.area_ha * p.yield_per_ha if p.yield_per_ha is not None else None, due < today))
    yield_ = m.expected_yield(parcels) if parcels is not None else None

    calendar = None
    if journals is not None:
        calendar = charts.calendar(m.calendar_counts([j.entry_date for j in journals], now, days), today - timedelta(days=days - 1), today)
    mix = charts.donut(m.by_activity(journals), appkit.number(len(journals), 0)) if journals else None

    # Crop cycles: sowing to the expected harvest, the overdue ones marked; the nearest GANTT_LANES first.
    cycles = sorted([p for p in parcels or [] if m.harvest_date(p) is not None], key=lambda p: (m.harvest_date(p), p.code))
    lanes = [charts.Lane(f"{p.code} · {p.household_name}",
                         m.vn_day(p.cycle.sowed_at) if p.cycle and p.cycle.sowed_at else None,
                         m.harvest_date(p), "overdue" if m.harvest_date(p) < today else "plan") for p in cycles[:GANTT_LANES]]
    gantt = charts.timeline(lanes, today) if lanes else None
    months = m.expected_by_month(parcels) if parcels is not None else []
    month_chart = charts.column_chart([label for label, _ in months], [[kg / 1000 for _, kg in months]], ["Sản lượng (tấn)"],
                                      digits=1) if months else None
    crops = [(crop, kg / 1000) for crop, kg in m.expected_by_crop(parcels or [])]
    return {
        "r": r, "days": days, "harvest": harvest, "harvest_rows": harvest_rows, "yield": yield_,
        "cultivating": m.cultivating(parcels) if parcels is not None else None, "parcels_empty": parcels is not None and not parcels,
        "calendar": calendar, "calendar_total": len(journals) if journals is not None else 0,
        "mix": mix, "mix_items": m.by_activity(journals or []),
        "journals_empty": journals is not None and not journals,
        "top": charts.bar_rows(m.top_households(journals, 10)) if journals is not None else None,
        "silent_households": m.households_without_entries(households, journals) if households is not None and journals is not None else None,
        "gantt": gantt, "gantt_extra": len(cycles) - GANTT_LANES, "gantt_empty": parcels is not None and not cycles,
        "month_chart": month_chart, "crops": charts.bar_rows(crops, digits=1) if crops else [],
        "counts": counts, "note": cap_note(journals, "nhật ký"),
        "export": ("san-xuat", f"Lịch thu hoạch dự kiến ({days} ngày: vụ quá hạn và 30 ngày tới)",
                   ("Mã thửa", "Hộ", "Ngày thu hoạch dự kiến", "Còn (ngày)", "Sản lượng kỳ vọng (kg)", "Tình trạng"),
                   [(h.code, h.household, day_text(h.due), h.days_left, "" if h.kg is None else round(h.kg, 1),
                     "Quá hạn" if h.overdue else "Sắp tới") for h in harvest_rows]) if parcels is not None else None,
    }


# ---------------------------------------------------------------- parcels list

@dataclass(frozen=True)
class ParcelRow:
    parcel: m.Parcel
    readings: list[dict]
    disease: m.Disease | None


def parcels_list(core: cc.Core, auth: str, htx: str, now: datetime, days: int, query: dict) -> dict:
    start, end, _ = sensor_window(now, days)
    r = core.run(auth, {
        "parcels": block(cc.PARCELS, cc.parse_parcels, **limited()),
        "latest": block(cc.LATEST_READINGS, cc.parse_readings, htx=htx, **limited()),
        "diseases": block(cc.DISEASES, cc.parse_diseases, **limited()),
        "sensors": block(cc.SENSOR_DAILY, cc.parse_daily, htx=htx, limit=cc.HOT_LIMIT, **{"from": start.isoformat()}),
    })
    parcels, latest, diseases, sensors = ok(r, "parcels"), ok(r, "latest"), ok(r, "diseases"), ok(r, "sensors")
    q = (query.get("q") or "").strip()[:60]
    status = query.get("status") if query.get("status") in m.PARCEL_STATUS else ""
    with_sensor = query.get("sensor") == "1"
    by_parcel: dict[str, list[m.Reading]] = {}
    for reading in latest or []:
        by_parcel.setdefault(reading.parcel_code, []).append(reading)
    last_disease: dict[str, m.Disease] = {}
    for d in diseases or []:  # newest first
        last_disease.setdefault(d.parcel_code, d)
    spark_series = m.series_by_day(sensors, start, end) if sensors is not None else {}

    rows, page, wanted_all = [], None, []
    if parcels is not None:
        wanted_all = [p for p in parcels
                      if (not q or q.casefold() in p.code.casefold() or q.casefold() in p.household_name.casefold())
                      and (not status or p.status == status) and (not with_sensor or p.code in by_parcel)]
        page = appkit.page_of(query.get("page"), len(wanted_all))
        for p in wanted_all[page.offset: page.offset + page.size]:
            readings = [{"label": m.sensor_label(x.sensor)[0], "unit": m.sensor_label(x.sensor)[1], "value": appkit.number(x.value, 1),
                         "age": m.age_text(x.ts, now), "silent": now - x.ts > timedelta(hours=m.SENSOR_SILENT_HOURS),
                         "spark": charts.sparkline(spark_series.get((p.code, x.sensor), []))}
                        for x in sorted(by_parcel.get(p.code, []), key=lambda x: x.sensor)]
            rows.append(ParcelRow(p, readings, last_disease.get(p.code)))
    csv_rows = []
    if parcels is not None:
        for p in wanted_all:
            d = last_disease.get(p.code)
            csv_rows.append((p.code, p.household_name, p.area_ha, p.crop_type, m.PARCEL_STATUS.get(p.status, p.status),
                             "; ".join(f"{m.sensor_label(x.sensor)[0]}: {appkit.number(x.value, 1)} ({m.age_text(x.ts, now)})"
                                       for x in sorted(by_parcel.get(p.code, []), key=lambda x: x.sensor)),
                             "" if d is None else f"{day_text(m.vn_day(d.detection_date))} {m.disease_kind(d)}"))
    crop_bars = charts.bar_rows(m.area_by_crop(parcels), digits=1) if parcels else []
    return {
        "r": r, "days": days, "rows": rows, "page": page, "q": q, "status": status, "with_sensor": with_sensor,
        "statuses": list(m.PARCEL_STATUS.items()), "parcels_empty": parcels is not None and not parcels,
        "total": len(parcels) if parcels is not None else 0, "note": cap_note(parcels, "thửa"),
        "status_donut": charts.donut(status_items(parcels), appkit.number(len(parcels or []), 0)) if parcels else None,
        "status_items": status_items(parcels) if parcels else [], "crop_bars": crop_bars,
        "export": ("vung-trong", "Các thửa chè", ("Mã thửa", "Hộ", "Diện tích (ha)", "Cây", "Trạng thái", "Số đo mới nhất", "Báo cáo bệnh gần nhất"),
                   csv_rows) if parcels is not None else None,
        "filter": {k: v for k, v in (("q", q), ("status", status), ("sensor", "1" if with_sensor else "")) if v},
    }


# ---------------------------------------------------------------- one parcel (the digital twin)

def parcel_page(core: cc.Core, auth: str, htx: str, code: str, now: datetime, days: int) -> dict | None:
    first, _, sensor_days = sensor_window(now, days)
    r = core.run(auth, {
        "parcel": block(cc.PARCEL_ONE, cc.parse_parcel, code=code),
        "latest": block(cc.PARCEL_LATEST, cc.parse_readings, htx=htx, code=code),
        "daily": block(cc.PARCEL_DAILY, cc.parse_daily, htx=htx, code=code, **{"from": first.isoformat()}),
        "weather": block(cc.WEATHER, cc.parse_weather, code=code),
        "journals": block(cc.PARCEL_JOURNALS, cc.parse_parcel_journals, code=code),
        "diseases": block(cc.PARCEL_DISEASES, cc.parse_diseases, code=code),
        "lots": block(cc.PARCEL_LOTS, cc.parse_lots, code=code),
    })
    if r["parcel"].ok and r["parcel"].value is None:
        return None  # not found, or a parcel of another cooperative: Hasura filtered it out
    latest, daily = ok(r, "latest"), ok(r, "daily")
    sensors = []
    if latest is not None and daily is not None:
        names = sorted({x.sensor for x in latest} | {d.sensor for d in daily})
        for name in names:
            label, unit = m.sensor_label(name)
            reading = next((x for x in latest if x.sensor == name), None)
            rows = [d for d in daily if d.sensor == name]
            stats = m.sensor_stats(rows)
            silent = reading is not None and now - reading.ts > timedelta(hours=m.SENSOR_SILENT_HOURS)
            sensors.append({
                "name": name, "label": label, "unit": unit, "reading": reading, "silent": silent, "stats": stats,
                "age": m.age_text(reading.ts, now) if reading else None,
                "gauge": charts.gauge(reading.value, stats.min, stats.max) if reading and stats else None,
                "chart": charts.line_chart([charts.Point(d.day, d.avg, d.min, d.max) for d in rows])})
    combined = parcel_combined(daily) if daily is not None else None
    return {"r": r, "days": days, "code": code, "parcel": ok(r, "parcel"), "sensors": sensors, "sensor_days": sensor_days,
            "capped_sensors": days > SENSOR_DAYS_MAX, "weather": ok(r, "weather"), "journals": ok(r, "journals"),
            "diseases": ok(r, "diseases"), "lots": ok(r, "lots"), "combined": combined}


def parcel_combined(daily: list[m.Daily]) -> dict:
    """Air temperature against air humidity (one dot per day) and rainfall as columns per day, from the daily averages."""
    avg = {(d.sensor, d.day): d.avg for d in daily}
    days = sorted({d.day for d in daily})
    dots = [(avg[("air_temperature", d)], avg[("air_humidity", d)], f"{d:%d/%m}") for d in days
            if ("air_temperature", d) in avg and ("air_humidity", d) in avg]
    rain = [(f"{d:%d/%m}", avg.get(("rainfall", d))) for d in days]
    rain_chart = None
    if any(v is not None for _, v in rain):
        rain_chart = charts.column_chart([label for label, _ in rain], [[v or 0.0 for _, v in rain]], ["Lượng mưa TB (mm)"], digits=1)
    return {"scatter": charts.scatter(dots) if dots else None, "rain": rain_chart, "dots": len(dots)}


# ---------------------------------------------------------------- health

def health(core: cc.Core, auth: str, htx: str, now: datetime, days: int) -> dict:
    r = core.run(auth, {"diseases": block(cc.DISEASES, cc.parse_diseases, **limited())})
    rows = ok(r, "diseases")
    mine = [d for d in rows if m.in_period(d.created_at, now, days)] if rows is not None else None
    weekly = None
    if mine:
        weeks, names, series = m.disease_by_week(mine, now, days)
        weekly = charts.column_chart([m.week_label(w) for w in weeks], series, names, digits=0) if names else None
    confidence = charts.column_chart([label for label, _ in m.confidence_bins(mine)], [[n for _, n in m.confidence_bins(mine)]],
                                     ["Báo cáo"], digits=0) if mine else None
    status = charts.donut(m.disease_by_status(mine) if mine else [], appkit.number(len(mine or []), 0))
    return {
        "r": r, "days": days, "rows": mine, "pending": m.disease_pending(rows) if rows is not None else None,
        "recent": m.disease_recent(rows, now) if rows is not None else None, "empty": mine is not None and not mine,
        "weekly": weekly, "kinds": charts.bar_rows(m.disease_kinds(mine), digits=0) if mine else [],
        "status": status, "status_items": [(label, n) for label, n in m.disease_by_status(mine or []) if n],
        "confidence": confidence, "confirmed": charts.bar_rows(m.confirmed_vs_ai(mine), digits=0) if mine else [],
        "parcels": charts.bar_rows(m.disease_by_parcel(mine, 5), digits=0) if mine else [],
        "labels": m.DISEASE_STATUS, "kind": m.disease_kind, "note": cap_note(rows, "báo cáo bệnh"),
        "export": ("suc-khoe-cay", f"Báo cáo bệnh trong {days} ngày",
                   ("Ngày phát hiện", "Thửa", "Hộ", "Loại bệnh", "Độ tin cậy AI", "Trạng thái"),
                   [(day_text(m.vn_day(d.detection_date)), d.parcel_code, d.household_name, m.disease_kind(d),
                     round(d.confidence, 2), m.DISEASE_STATUS.get(d.status, d.status)) for d in mine]) if mine is not None else None,
    }


# ---------------------------------------------------------------- lots

def lots_page(core: cc.Core, auth: str, htx: str, now: datetime, days: int, query: dict) -> dict:
    r = core.run(auth, {"lots": block(cc.LOTS, cc.parse_lots, **limited())})
    rows = ok(r, "lots")
    page = appkit.page_of(query.get("page"), len(rows)) if rows is not None else None
    stacked = None
    if rows:
        labels, names, series = m.lots_by_month_status(rows, now, 6)
        stacked = charts.column_chart(labels, series, names, digits=0)
    pairs = m.lot_pairs(rows) if rows else []
    weights = None
    if pairs:
        weights = charts.column_chart([m.week_label(m.vn_day(lot.harvest_date)) for lot in pairs],
                                      [[lot.estimated_kg for lot in pairs], [lot.actual_kg for lot in pairs]],
                                      ["Dự kiến (kg)", "Thực tế (kg)"], stacked=False, digits=0)
    return {
        "r": r, "days": days, "rows": rows[page.offset: page.offset + page.size] if rows is not None else None, "page": page,
        "empty": rows is not None and not rows, "labels": m.LOT_STATUS, "total": len(rows) if rows is not None else 0,
        "funnel": charts.funnel_steps(m.lots_funnel(rows)) if rows else None,
        "stacked": stacked, "weights": weights, "pairs_count": len(pairs),
        "grades": charts.bar_rows(m.lot_grades(rows), digits=0) if rows else [],
        "weight_chart": charts.bar_rows(m.lot_weight_by_status(rows), digits=0) if rows else [], "note": cap_note(rows, "lô chè"),
        "export": ("lo-che", "Các lô chè", ("Mã lô", "Mặt hàng", "Hạng", "Ngày thu hoạch", "Khối lượng dự kiến (kg)", "Khối lượng thực (kg)", "Trạng thái", "Ngày tạo"),
                   [(lot.code, lot.commodity, lot.grade or "", day_text(m.vn_day(lot.harvest_date)), "" if lot.estimated_kg is None else lot.estimated_kg,
                     "" if lot.actual_kg is None else round(lot.actual_kg, 1), m.LOT_STATUS.get(lot.status, lot.status),
                     day_text(m.vn_day(lot.created_at))) for lot in rows]) if rows is not None else None,
    }


# ---------------------------------------------------------------- data lifecycle

RUN_LABEL = {"done": "Đã chuyển", "failed": "Lỗi", "running": "Đang chạy"}


def data_page(core: cc.Core, auth: str, htx: str, now: datetime, days: int) -> dict:
    first, _, _ = sensor_window(now, days)
    r = core.run(auth, {
        "runs": block(cc.RUNS, cc.parse_runs, htx=htx, limit=60),
        "daily": block(cc.DAILY_TOTALS, cc.parse_daily_totals, htx=htx, limit=cc.HOT_LIMIT, **{"from": first.isoformat()}),
        "latest": block(cc.LATEST_READINGS, cc.parse_readings, htx=htx, **limited()),
        "sensors": block(cc.SENSOR_DAILY, cc.parse_daily, htx=htx, limit=cc.HOT_LIMIT, **{"from": first.isoformat()}),
    })
    runs, daily, latest, sensors = ok(r, "runs"), ok(r, "daily"), ok(r, "latest"), ok(r, "sensors")
    hot = m.hot_rows_by_day(daily) if daily is not None else None
    silent = sorted(m.silent_sensors(latest, now), key=lambda x: x.ts) if latest is not None else None
    run_rows = [{"run": run, "quality": m.quality_summary(run.quality), "label": RUN_LABEL.get(run.status, run.status),
                 "tone": {"done": "", "failed": " danger", "running": " warn"}.get(run.status, " neutral")} for run in runs] if runs is not None else None
    volume = m.run_volume(runs) if runs is not None else []
    moved = None
    if volume:
        moved = charts.column_chart([f"{v.day:%d/%m}" + (" ✕" if v.failed else "") for v in volume],
                                    [[float(v.rows) for v in volume]], ["Số dòng chuyển"], digits=0)
    return {
        "r": r, "days": days, "hot": hot,
        "hot_chart": charts.line_chart([charts.Point(d, n, n, n) for d, n in hot], area=True) if hot else None,
        "hot_total": sum(n for _, n in hot) if hot else 0, "summary": m.sensor_summary(latest, now) if latest is not None else None,
        "silent": [{"reading": x, "label": m.sensor_label(x.sensor)[0], "age": m.age_text(x.ts, now)} for x in silent] if silent is not None else None,
        "runs": run_rows, "failed": len(m.failed_runs(runs, now)) if runs is not None else None,
        "moved": moved, "moved_empty": runs is not None and not runs,
        "by_sensor": charts.bar_rows(m.readings_by_sensor(sensors), digits=0) if sensors else [],
        "matrix": freshness_matrix(latest, now),
        "note": cap_note(daily, "số đo theo ngày", cc.HOT_LIMIT),
        "export": ("du-lieu", "Các lần chuyển dữ liệu cảm biến sang kho lạnh",
                   ("Ngày dữ liệu", "Trạng thái", "Số dòng", "Dung lượng (byte)", "SHA-256", "Số dòng kiểm chất lượng", "Dòng bị loại", "Lỗi"),
                   [(day_text(x["run"].partition_date), x["label"], "" if x["run"].row_count is None else x["run"].row_count,
                     "" if x["run"].size_bytes is None else x["run"].size_bytes, x["run"].sha256 or "",
                     x["quality"].rows if x["quality"] else "", x["quality"].rejects if x["quality"] else "", x["run"].error or "") for x in run_rows]) if run_rows is not None else None,
    }
