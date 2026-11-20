# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Figures behind the 0.2.0 charts: previous period, weekly stacks, daily averages, freshness, funnels, prices, runs.
Fixed rows, Vietnam-time buckets, and the empty, single-point and capped inputs."""
from datetime import date, datetime, timedelta, timezone

from htx_dashboard import metrics as m

UTC = timezone.utc
NOW = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)  # 10:00 on 20/11/2026 in Vietnam


def journal(ts, activity="SPRAYING", status="APPROVED", parcel="P1", household="Hộ A"):
    return m.Journal(id=f"j{ts.timestamp()}", parcel_code=parcel, household_name=household, entry_date=ts,
                     activity_type=activity, status=status, created_at=ts, performed_by=household)


def disease(ts, kind=None, confidence=0.7, status="PENDING", confirmed=None, parcel="P1"):
    if kind:  # a kind of disease is what the core confirmed
        confirmed, status = kind, "CONFIRMED"
    return m.Disease(id=f"d{ts.timestamp()}", parcel_code=parcel, household_name="Hộ A", detection_date=ts,
                     ai_name="Bệnh thối búp", confidence=confidence, confirmed=confirmed, status=status, created_at=ts)


def lot(status="DRAFT", created=NOW, est=None, actual=None, grade=None):
    return m.Lot(code=f"L{created.timestamp()}", commodity="Chè xanh", grade=grade, harvest_date=created, estimated_kg=est,
                 actual_kg=actual, status=status, created_at=created)


def plot(code="P1", crop="Chè", area=1.0, yield_=1000.0, status="TENDING"):
    return m.Parcel(code=code, household_id="h1", household_name="Hộ A", crop_type=crop, area_ha=area, status=status,
                    yield_per_ha=yield_, cycle=None)


def reading(p, s, at, value=1.0):
    return m.Reading(p, s, at, value)


def daily(p, s, day, count, avg):
    t = datetime(day.year, day.month, day.day, tzinfo=UTC)
    return m.Daily(p, s, day, count, avg - 1, avg + 1, avg, t, t)


# ---------- previous period ----------

def test_previous_count_is_the_period_before_the_current_one():
    stamps = [NOW - timedelta(days=1), NOW - timedelta(days=10), NOW - timedelta(days=12), NOW - timedelta(days=40)]
    assert m.previous_count(stamps, NOW, 7) == 2  # days 10 and 12 fall in 07/11 to 13/11; day 40 is further back
    assert m.previous_count([], NOW, 7) == 0


def test_calendar_counts_are_per_vietnam_day_inside_the_period():
    at = datetime(2026, 11, 19, 18, 0, tzinfo=UTC)  # 20/11 01:00 in Vietnam
    counts = m.calendar_counts([at, at + timedelta(hours=1), NOW - timedelta(days=60)], NOW, 7)
    assert counts == {date(2026, 11, 20): 2}


# ---------- weekly stacks ----------

def test_activity_by_week_stacks_each_activity_and_drops_the_empty_ones():
    rows = [journal(NOW - timedelta(days=1), activity="SPRAYING"), journal(NOW - timedelta(days=2), activity="SPRAYING"),
            journal(NOW - timedelta(days=9), activity="IRRIGATION")]
    weeks, names, series = m.activity_by_week(rows, NOW, 30)
    assert names == ["Phun thuốc", "Tưới tiêu"]
    assert series[0][-1] == 2 and series[1][-2] == 1 and sum(series[1]) == 1


def test_disease_by_week_keeps_the_top_kinds_and_groups_the_rest():
    rows = [disease(NOW - timedelta(days=1), kind="Bệnh thối búp") for _ in range(3)] + \
           [disease(NOW - timedelta(days=1), kind=f"Loại {i}") for i in range(6)]
    weeks, names, series = m.disease_by_week(rows, NOW, 30, top=2)
    assert names == ["Bệnh thối búp", "Loại 0", "Khác"]
    assert sum(sum(s) for s in series) == 9


# ---------- disease confidence and confirmation ----------

def test_confidence_bins_cover_every_report_once():
    rows = [disease(NOW, confidence=c) for c in (0.55, 0.62, 0.7, 0.85, 0.95, 0.99)]
    bins = m.confidence_bins(rows)
    assert sum(n for _, n in bins) == 6
    assert dict(bins)["dưới 60%"] == 1 and dict(bins)["từ 90%"] == 2


def test_confirmed_against_ai_only_and_rejected_are_three_separate_counts():
    rows = [disease(NOW, status="CONFIRMED", confirmed="Rầy xanh"), disease(NOW, status="PENDING"),
            disease(NOW, status="PENDING"), disease(NOW, status="REJECTED")]
    assert m.confirmed_vs_ai(rows) == [("Đã xác nhận", 1), ("Chỉ AI, chưa xác nhận", 2), ("Bị bác bỏ", 1)]


# ---------- yield by crop, lots ----------

def test_expected_yield_by_crop_uses_the_core_definition():
    parcels = [plot("A", crop="Chè Shan", area=2.0, yield_=1000.0), plot("B", crop="Chè Shan", area=1.0, yield_=500.0),
               plot("C", crop="Chè Trung du", area=1.0, yield_=None), plot("D", crop="Chè Shan", status="HARVESTED", area=9, yield_=9)]
    assert m.expected_by_crop(parcels) == [("Chè Shan", 2500.0), ("Chè Trung du", 0.0)]


def test_lots_funnel_counts_each_lot_once_at_every_stage_it_reached():
    rows = [lot(status="DRAFT"), lot(status="READY"), lot(status="QR_EXPORTED"), lot(status="QR_EXPORTED")]
    assert m.lots_funnel(rows) == [("Đã tạo", 4), ("Sẵn sàng", 3), ("Đã xuất QR", 2)]


def test_lots_by_month_stacked_by_status_in_vietnam_time():
    rows = [lot(status="READY", created=NOW), lot(status="QR_EXPORTED", created=NOW), lot(status="DRAFT", created=NOW - timedelta(days=40))]
    labels, names, series = m.lots_by_month_status(rows, NOW, 3)
    assert labels == ["09/2026", "10/2026", "11/2026"] and names == ["Nháp", "Sẵn sàng", "Đã xuất QR"]
    assert series[0][-1] == 0 and series[1][-1] == 1 and series[2][-1] == 1 and series[0][1] == 1


def test_estimated_against_actual_keeps_only_lots_with_both_and_grades_name_the_missing():
    rows = [lot(est=100.0, actual=97.0), lot(est=50.0, actual=None), lot(est=None, actual=12.0)]
    assert [(x.estimated_kg, x.actual_kg) for x in m.lot_pairs(rows)] == [(100.0, 97.0)]
    assert m.lot_grades([lot(grade="Grade 1"), lot(grade=None), lot(grade="Grade 1")]) == [("Grade 1", 2), ("Chưa phân hạng", 1)]


# ---------- sensors: daily averages, freshness, sparklines ----------

def test_sensor_day_averages_weigh_each_parcel_by_its_reading_count():
    d = date(2026, 11, 19)
    rows = [daily("A", "soil_moisture", d, 10, 40.0), daily("B", "soil_moisture", d, 30, 20.0)]
    assert m.sensor_day_averages(rows) == {"soil_moisture": [(d, 25.0)]}


def test_series_by_day_has_a_none_for_every_day_without_readings():
    start, end = date(2026, 11, 18), date(2026, 11, 20)
    rows = [daily("A", "rainfall", date(2026, 11, 18), 5, 1.0), daily("A", "rainfall", date(2026, 11, 20), 5, 3.0)]
    series = m.series_by_day(rows, start, end)
    assert series[("A", "rainfall")] == [1.0, None, 3.0]


def test_freshness_marks_fresh_silent_and_never_reported_pairs():
    latest = [reading("A", "soil_moisture", NOW - timedelta(minutes=5)), reading("A", "rainfall", NOW - timedelta(hours=9))]
    state = m.freshness(m.sensor_parcels(latest), latest, NOW)
    assert state[("A", "soil_moisture")] == "fresh" and state[("A", "rainfall")] == "silent"
    assert state[("A", "air_humidity")] == "none" and m.sensor_parcels([]) == []


# ---------- prices and lifecycle runs ----------

def test_price_history_is_the_series_of_one_metric_oldest_first():
    rows = [m.Price("Tea", "export_price", 3.6, "USD/kg", "Mô phỏng (Toàn quốc)", NOW - timedelta(days=1)),
            m.Price("Tea", "export_price", 3.4, "USD/kg", "Mô phỏng (Toàn quốc)", NOW - timedelta(days=3)),
            m.Price("Tea", "producer_price_index", 108.0, "index", "FAOSTAT", NOW)]
    assert [v for _, v in m.price_series(rows, "export_price")] == [3.4, 3.6]
    assert m.price_series(rows, "missing") == []


def test_run_volume_is_ordered_by_partition_and_a_failed_run_has_no_rows():
    runs = [m.Run("r2", "t", date(2026, 11, 12), "failed", None, None, None, None, None, None, "x", NOW, None),
            m.Run("r1", "t", date(2026, 11, 10), "done", 2400, None, None, "a", 48000, None, None, NOW, None)]
    volume = m.run_volume(runs)
    assert [v.day for v in volume] == [date(2026, 11, 10), date(2026, 11, 12)]
    assert volume[0].rows == 2400 and volume[1].rows == 0 and volume[1].failed


def test_readings_by_sensor_sums_the_stored_counts_in_sensor_order():
    rows = [daily("A", "rainfall", date(2026, 11, 19), 5, 1.0), daily("A", "soil_moisture", date(2026, 11, 19), 9, 40.0),
            daily("B", "soil_moisture", date(2026, 11, 19), 1, 40.0)]
    assert m.readings_by_sensor(rows) == [("Độ ẩm đất", 10), ("Lượng mưa", 5)]


def test_area_by_crop_sums_every_parcel_largest_first():
    parcels = [plot("A", crop="Chè Shan", area=2.0), plot("B", crop="Chè Trung du", area=1.5), plot("C", crop="Chè Shan", area=0.5)]
    assert m.area_by_crop(parcels) == [("Chè Shan", 2.5), ("Chè Trung du", 1.5)]


def test_busiest_day_is_the_largest_count_and_the_earliest_on_a_tie():
    assert m.busiest_day({date(2026, 11, 3): 4, date(2026, 11, 9): 9, date(2026, 11, 12): 9}) == (date(2026, 11, 9), 9)
    assert m.busiest_day({}) is None
