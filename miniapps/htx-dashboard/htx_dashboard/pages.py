# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""One builder per tab: runs the tab's core queries in parallel, turns the rows into figures with `metrics` and returns
the context its template shows. A block that failed is None here and the template shows the error text in its place."""
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


def tile(label: str, value, hint: str = "", missing: bool = False) -> dict:
    if missing:
        return {"label": label, "value": "—", "hint": ERROR_TEXT}
    return {"label": label, "value": value, "hint": hint}


def cap_note(rows, what: str, limit: int | None = None) -> str | None:
    limit = limit or cc.LIMIT
    if rows is not None and m.capped(len(rows), limit):
        return f"Chỉ tính trên {appkit.number(limit, 0)} dòng mới nhất của {what}."
    return None


def kg_text(kg: float) -> str:
    return f"{appkit.number(kg / 1000, 1)} tấn" if kg >= 1000 else f"{appkit.number(kg, 0)} kg"


def bars(pairs, fmt=appkit.number):
    return appkit.chart_rows(pairs, fmt)


def weekly_rows(timestamps, now, days):
    return bars([(f"Tuần {m.week_label(w)}", n) for w, n in m.weekly_counts(timestamps, now, days)], lambda n: appkit.number(n, 0))


def int_rows(pairs):
    return bars(pairs, lambda n: appkit.number(n, 0))


# ---------------------------------------------------------------- overview

def overview(core: cc.Core, auth: str, htx: str, now: datetime, days: int) -> dict:
    since = iso(m.period_start(now, days))
    r = core.run(auth, {
        "parcels": block(cc.PARCELS, cc.parse_parcels, **limited()),
        "households": block(cc.HOUSEHOLDS, cc.parse_households, **limited()),
        "journals": block(cc.JOURNALS, cc.parse_journals, since=since, **limited()),
        "pending": block(cc.JOURNALS_PENDING, cc.parse_journals, **limited()),
        "counts": block(cc.JOURNAL_COUNTS, cc.parse_journal_counts, since=since),
        "diseases": block(cc.DISEASES, cc.parse_diseases, **limited()),
        "lots": block(cc.LOTS, cc.parse_lots, **limited()),
        "latest": block(cc.LATEST_READINGS, cc.parse_readings, htx=htx, **limited()),
        "runs": block(cc.RUNS, cc.parse_runs, htx=htx, limit=60),
        "prices": block(cc.PRICES, cc.parse_prices),
    })
    parcels, households, journals, pending = ok(r, "parcels"), ok(r, "households"), ok(r, "journals"), ok(r, "pending")
    counts, diseases, lots, latest, runs = ok(r, "counts"), ok(r, "diseases"), ok(r, "lots"), ok(r, "latest"), ok(r, "runs")

    harvest = m.harvest_calendar(parcels, now) if parcels is not None else None
    stale = m.pending_over(pending, now) if pending is not None else None
    sensors = m.sensor_summary(latest, now) if latest is not None else None
    in_period = [d for d in diseases if m.in_period(d.created_at, now, days)] if diseases is not None else None
    yield_ = m.expected_yield(parcels) if parcels is not None else None

    # Attention rows need every source of the rule; a rule whose source failed is named under the list, not hidden.
    unchecked = [label for label, value in (("nhật ký chờ duyệt", stale), ("báo cáo bệnh", diseases), ("cảm biến", latest),
                                            ("lịch thu hoạch", harvest), ("chuyển dữ liệu sang kho lạnh", runs)) if value is None]
    items = m.attention(
        pending_stale=len(stale) if stale is not None else 0,
        disease_pending=m.disease_pending(diseases) if diseases is not None else 0,
        disease_recent=m.disease_recent(diseases, now) if diseases is not None else 0,
        silent=sensors.silent if sensors else 0,
        harvest_week=len(harvest.upcoming_7) if harvest else 0,
        harvest_overdue=len(harvest.overdue) if harvest else 0,
        failed_runs=len(m.failed_runs(runs, now)) if runs is not None else 0)

    silent_codes = {x.parcel_code for x in m.silent_sensors(latest, now)} if latest is not None else set()
    has_sensor = {x.parcel_code for x in latest} if latest is not None else set()
    grid = [{"code": p.code, "short": p.code.rsplit("-", 1)[-1], "cls": STATUS_CLASS.get(p.status, "draft"),
             "label": m.PARCEL_STATUS.get(p.status, p.status), "area": appkit.number(p.area_ha, 1),
             "alert": p.code in silent_codes, "sensor": p.code in has_sensor, "household": p.household_name} for p in parcels or []]

    scale = [
        tile("Hộ thành viên", appkit.number(len(households), 0) if households is not None else 0, "đang có trong HTX", households is None),
        tile("Thửa chè", appkit.number(len(parcels), 0) if parcels is not None else 0,
             f"tổng {appkit.number(m.total_area(parcels), 1)} ha" if parcels is not None else "", parcels is None),
        tile("Đang canh tác", appkit.number(m.cultivating(parcels), 0) if parcels is not None else 0, "thửa có vụ chưa thu hoạch", parcels is None),
        tile("Sản lượng kỳ vọng", kg_text(yield_.kg) if yield_ else 0,
             (f"{yield_.missing} thửa chưa khai năng suất" if yield_.missing else f"{yield_.parcels} thửa đang chăm sóc") if yield_ else "", yield_ is None),
    ]
    activity = [
        tile(f"Nhật ký {days} ngày", appkit.number(counts.in_period, 0) if counts else 0, "đã ghi trong kỳ", counts is None),
        tile("Chờ duyệt", appkit.number(counts.pending, 0) if counts else 0,
             (f"{counts.changes} cần sửa" if counts and counts.changes else "không có nhật ký cần sửa") if counts else "", counts is None),
        tile(f"Báo cáo bệnh {days} ngày", appkit.number(len(in_period), 0) if in_period is not None else 0, "báo cáo trong kỳ", in_period is None),
        tile("Bệnh chờ xử lý", appkit.number(m.disease_pending(diseases), 0) if diseases is not None else 0, "báo cáo chưa được xác nhận", diseases is None),
    ]
    sensor_tiles = [
        tile("Thửa có cảm biến", appkit.number(sensors.parcels, 0) if sensors else 0,
             f"{sensors.sensors} cảm biến gửi số đo trong 30 ngày" if sensors else "", sensors is None),
        tile("Cảm biến im lặng", appkit.number(sensors.silent, 0) if sensors else 0,
             f"không gửi số đo quá {m.SENSOR_SILENT_HOURS} giờ", sensors is None),
    ]
    lot_counts = dict(m.lots_by_status(lots)) if lots is not None else None
    lot_tiles = [tile(label, appkit.number(lot_counts[label], 0) if lot_counts else 0, "lô chè", lot_counts is None) for label in m.LOT_STATUS.values()]
    return {
        "r": r, "days": days, "attention": items, "unchecked": unchecked, "grid": grid,
        "groups": [("Quy mô và sản xuất", scale), ("Nhật ký và sức khoẻ cây", activity), ("Cảm biến", sensor_tiles), ("Lô chè", lot_tiles)],
        "journal_weeks": weekly_rows([j.entry_date for j in journals], now, days) if journals is not None else None,
        "journals_empty": journals is not None and not journals, "lots_chart": int_rows(m.lots_by_status(lots)) if lots else None,
        "lots_empty": lots is not None and not lots, "prices": ok(r, "prices"),
        "notes": [n for n in (cap_note(parcels, "thửa"), cap_note(journals, "nhật ký"), cap_note(diseases, "báo cáo bệnh"), cap_note(lots, "lô chè")) if n],
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
        "counts": block(cc.JOURNAL_COUNTS, cc.parse_journal_counts, since=since),
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
    top = m.top_households(journals, 10) if journals is not None else None
    csv_rows = [(h.code, h.household, day_text(h.due), h.days_left, "" if h.kg is None else round(h.kg, 1),
                 "Quá hạn" if h.overdue else "Sắp tới") for h in harvest_rows]
    return {
        "r": r, "days": days, "harvest": harvest, "harvest_rows": harvest_rows, "yield": yield_,
        "cultivating": m.cultivating(parcels) if parcels is not None else None,
        "status_chart": int_rows(m.parcels_by_status(parcels)) if parcels else None, "parcels_empty": parcels is not None and not parcels,
        "month_chart": bars([(label, kg) for label, kg in m.expected_by_month(parcels)], lambda kg: kg_text(kg)) if parcels is not None else None,
        "week_chart": weekly_rows([j.entry_date for j in journals], now, days) if journals is not None else None,
        "activity_chart": int_rows(m.by_activity(journals)) if journals else None, "journals_empty": journals is not None and not journals,
        "top": top, "silent_households": m.households_without_entries(households, journals) if households is not None and journals is not None else None,
        "counts": counts, "note": cap_note(journals, "nhật ký"),
        "export": ("san-xuat", f"Lịch thu hoạch dự kiến ({days} ngày: vụ quá hạn và 30 ngày tới)",
                   ("Mã thửa", "Hộ", "Ngày thu hoạch dự kiến", "Còn (ngày)", "Sản lượng kỳ vọng (kg)", "Tình trạng"), csv_rows) if parcels is not None else None,
    }


# ---------------------------------------------------------------- parcels list

@dataclass(frozen=True)
class ParcelRow:
    parcel: m.Parcel
    readings: list[dict]
    disease: m.Disease | None


def parcels_list(core: cc.Core, auth: str, htx: str, now: datetime, days: int, query: dict) -> dict:
    r = core.run(auth, {
        "parcels": block(cc.PARCELS, cc.parse_parcels, **limited()),
        "latest": block(cc.LATEST_READINGS, cc.parse_readings, htx=htx, **limited()),
        "diseases": block(cc.DISEASES, cc.parse_diseases, **limited()),
    })
    parcels, latest, diseases = ok(r, "parcels"), ok(r, "latest"), ok(r, "diseases")
    q = (query.get("q") or "").strip()[:60]
    status = query.get("status") if query.get("status") in m.PARCEL_STATUS else ""
    with_sensor = query.get("sensor") == "1"
    by_parcel: dict[str, list[m.Reading]] = {}
    for reading in latest or []:
        by_parcel.setdefault(reading.parcel_code, []).append(reading)
    last_disease: dict[str, m.Disease] = {}
    for d in diseases or []:  # newest first
        last_disease.setdefault(d.parcel_code, d)

    rows, page = [], None
    if parcels is not None:
        wanted = [p for p in parcels
                  if (not q or q.casefold() in p.code.casefold() or q.casefold() in p.household_name.casefold())
                  and (not status or p.status == status) and (not with_sensor or p.code in by_parcel)]
        page = appkit.page_of(query.get("page"), len(wanted))
        for p in wanted[page.offset: page.offset + page.size]:
            readings = [{"label": m.sensor_label(x.sensor)[0], "unit": m.sensor_label(x.sensor)[1], "value": appkit.number(x.value, 1),
                         "age": m.age_text(x.ts, now), "silent": now - x.ts > timedelta(hours=m.SENSOR_SILENT_HOURS)}
                        for x in sorted(by_parcel.get(p.code, []), key=lambda x: x.sensor)]
            rows.append(ParcelRow(p, readings, last_disease.get(p.code)))
        wanted_all = wanted
    csv_rows = []
    if parcels is not None:
        for p in wanted_all:
            d = last_disease.get(p.code)
            csv_rows.append((p.code, p.household_name, p.area_ha, p.crop_type, m.PARCEL_STATUS.get(p.status, p.status),
                             "; ".join(f"{m.sensor_label(x.sensor)[0]}: {appkit.number(x.value, 1)} ({m.age_text(x.ts, now)})"
                                       for x in sorted(by_parcel.get(p.code, []), key=lambda x: x.sensor)),
                             "" if d is None else f"{day_text(m.vn_day(d.detection_date))} {m.disease_kind(d)}"))
    return {
        "r": r, "days": days, "rows": rows, "page": page, "q": q, "status": status, "with_sensor": with_sensor,
        "statuses": list(m.PARCEL_STATUS.items()), "parcels_empty": parcels is not None and not parcels,
        "total": len(parcels) if parcels is not None else 0, "note": cap_note(parcels, "thửa"),
        "export": ("vung-trong", "Các thửa chè", ("Mã thửa", "Hộ", "Diện tích (ha)", "Cây", "Trạng thái", "Số đo mới nhất", "Báo cáo bệnh gần nhất"),
                   csv_rows) if parcels is not None else None,
        "filter": {k: v for k, v in (("q", q), ("status", status), ("sensor", "1" if with_sensor else "")) if v},
    }


# ---------------------------------------------------------------- one parcel (the digital twin)

def parcel_page(core: cc.Core, auth: str, htx: str, code: str, now: datetime, days: int) -> dict | None:
    sensor_days = min(days, SENSOR_DAYS_MAX)
    first = m.vn_day(now) - timedelta(days=sensor_days - 1)
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
                "chart": charts.line_chart([charts.Point(d.day, d.avg, d.min, d.max) for d in rows])})
    return {"r": r, "days": days, "code": code, "parcel": ok(r, "parcel"), "sensors": sensors, "sensor_days": sensor_days,
            "capped_sensors": days > SENSOR_DAYS_MAX, "weather": ok(r, "weather"), "journals": ok(r, "journals"),
            "diseases": ok(r, "diseases"), "lots": ok(r, "lots")}


# ---------------------------------------------------------------- health

def health(core: cc.Core, auth: str, htx: str, now: datetime, days: int) -> dict:
    r = core.run(auth, {"diseases": block(cc.DISEASES, cc.parse_diseases, **limited())})
    rows = ok(r, "diseases")
    mine = [d for d in rows if m.in_period(d.created_at, now, days)] if rows is not None else None
    return {
        "r": r, "days": days, "rows": mine, "pending": m.disease_pending(rows) if rows is not None else None,
        "recent": m.disease_recent(rows, now) if rows is not None else None, "empty": mine is not None and not mine,
        "week_chart": weekly_rows([d.created_at for d in mine], now, days) if mine is not None else None,
        "kind_chart": int_rows(m.disease_kinds(mine)) if mine else None,
        "status_chart": int_rows(m.disease_by_status(mine)) if mine else None,
        "parcel_chart": int_rows(m.disease_by_parcel(mine, 5)) if mine else None,
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
    return {
        "r": r, "days": days, "rows": rows[page.offset: page.offset + page.size] if rows is not None else None, "page": page,
        "empty": rows is not None and not rows, "labels": m.LOT_STATUS, "total": len(rows) if rows is not None else 0,
        "status_chart": int_rows(m.lots_by_status(rows)) if rows else None,
        "month_chart": int_rows(m.lots_by_month(rows, now, 6)) if rows else None,
        "weight_chart": bars(m.lot_weight_by_status(rows), lambda kg: kg_text(kg)) if rows else None, "note": cap_note(rows, "lô chè"),
        "export": ("lo-che", "Các lô chè", ("Mã lô", "Mặt hàng", "Hạng", "Ngày thu hoạch", "Khối lượng dự kiến (kg)", "Khối lượng thực (kg)", "Trạng thái", "Ngày tạo"),
                   [(lot.code, lot.commodity, lot.grade or "", day_text(m.vn_day(lot.harvest_date)), "" if lot.estimated_kg is None else lot.estimated_kg,
                     "" if lot.actual_kg is None else round(lot.actual_kg, 1), m.LOT_STATUS.get(lot.status, lot.status),
                     day_text(m.vn_day(lot.created_at))) for lot in rows]) if rows is not None else None,
    }


# ---------------------------------------------------------------- data lifecycle

RUN_LABEL = {"done": "Đã chuyển", "failed": "Lỗi", "running": "Đang chạy"}


def data_page(core: cc.Core, auth: str, htx: str, now: datetime, days: int) -> dict:
    first = m.vn_day(now) - timedelta(days=SENSOR_DAYS_MAX - 1)
    r = core.run(auth, {
        "runs": block(cc.RUNS, cc.parse_runs, htx=htx, limit=60),
        "daily": block(cc.DAILY_TOTALS, cc.parse_daily_totals, htx=htx, limit=cc.HOT_LIMIT, **{"from": first.isoformat()}),
        "latest": block(cc.LATEST_READINGS, cc.parse_readings, htx=htx, **limited()),
    })
    runs, daily, latest = ok(r, "runs"), ok(r, "daily"), ok(r, "latest")
    hot = m.hot_rows_by_day(daily) if daily is not None else None
    silent = sorted(m.silent_sensors(latest, now), key=lambda x: x.ts) if latest is not None else None
    run_rows = [{"run": run, "quality": m.quality_summary(run.quality), "label": RUN_LABEL.get(run.status, run.status),
                 "tone": {"done": "", "failed": " danger", "running": " warn"}.get(run.status, " neutral")} for run in runs] if runs is not None else None
    return {
        "r": r, "days": days, "hot": hot, "hot_chart": charts.line_chart([charts.Point(d, n, n, n) for d, n in hot]) if hot else None,
        "hot_total": sum(n for _, n in hot) if hot else 0, "summary": m.sensor_summary(latest, now) if latest is not None else None,
        "silent": [{"reading": x, "label": m.sensor_label(x.sensor)[0], "age": m.age_text(x.ts, now)} for x in silent] if silent is not None else None,
        "runs": run_rows, "failed": len(m.failed_runs(runs, now)) if runs is not None else None,
        "note": cap_note(daily, "số đo theo ngày", cc.HOT_LIMIT),
        "export": ("du-lieu", "Các lần chuyển dữ liệu cảm biến sang kho lạnh",
                   ("Ngày dữ liệu", "Trạng thái", "Số dòng", "Dung lượng (byte)", "SHA-256", "Số dòng kiểm chất lượng", "Dòng bị loại", "Lỗi"),
                   [(day_text(x["run"].partition_date), x["label"], "" if x["run"].row_count is None else x["run"].row_count,
                     "" if x["run"].size_bytes is None else x["run"].size_bytes, x["run"].sha256 or "",
                     x["quality"].rows if x["quality"] else "", x["quality"].rejects if x["quality"] else "", x["run"].error or "") for x in run_rows]) if run_rows is not None else None,
    }
