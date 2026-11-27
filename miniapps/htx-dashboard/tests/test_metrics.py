# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Every figure and attention rule of spec §5 on fixed rows, with the boundaries (3 days, 6 hours, due today, empty)."""
from datetime import date, datetime, timedelta, timezone

from htx_dashboard import metrics as m

UTC = timezone.utc
# 2026-11-20 10:00 in Vietnam
NOW = datetime(2026, 11, 20, 3, 0, tzinfo=UTC)


def parcel(code="P1", status="TENDING", area=1.0, yield_per_ha=1000.0, cycle=None, household="Hộ A"):
    return m.Parcel(code=code, household_id="h-" + household, household_name=household, crop_type="Chè",
                    area_ha=area, status=status, yield_per_ha=yield_per_ha, cycle=cycle)


def cycle(harvest=None, season="Lứa 1"):
    return m.Cycle(season=season, sowed_at=None, estimated_harvest_date=harvest)


def at(days_ago=0.0, hours_ago=0.0):
    return NOW - timedelta(days=days_ago, hours=hours_ago)


# ---- Vietnam-time buckets ----

def test_vn_day_crosses_midnight_utc():
    assert m.vn_day(datetime(2026, 11, 19, 18, 30, tzinfo=UTC)) == date(2026, 11, 20)
    assert m.vn_day(datetime(2026, 11, 19, 16, 59, tzinfo=UTC)) == date(2026, 11, 19)


def test_week_start_is_monday():
    assert m.week_start(date(2026, 11, 20)) == date(2026, 11, 16)  # Friday
    assert m.week_start(date(2026, 11, 16)) == date(2026, 11, 16)
    assert m.week_start(date(2026, 11, 22)) == date(2026, 11, 16)  # Sunday


def test_week_buckets_use_vietnam_time():
    # Sunday 2026-11-15 18:30 UTC is Monday 16 in Vietnam: it belongs to the week of 16, not 9.
    weeks = m.weekly_counts([datetime(2026, 11, 15, 18, 30, tzinfo=UTC)], NOW, 14)
    assert dict(weeks)[date(2026, 11, 16)] == 1
    assert dict(weeks).get(date(2026, 11, 9), 0) == 0


def test_weekly_counts_fill_empty_weeks_and_include_the_current_one():
    weeks = m.weekly_counts([at(1)], NOW, 30)
    assert weeks[-1][0] == date(2026, 11, 16)
    assert [w for w, _ in weeks] == sorted(w for w, _ in weeks)
    assert len({w for w, _ in weeks}) == len(weeks)
    assert sum(n for _, n in weeks) == 1


def test_weekly_counts_for_no_rows_is_all_zero_not_empty():
    weeks = m.weekly_counts([], NOW, 30)
    assert weeks and all(n == 0 for _, n in weeks)


def test_period_start_is_midnight_of_the_first_vietnam_day():
    # 7 days including today: 2026-11-14 00:00 +07:00 = 2026-11-13 17:00 UTC
    assert m.period_start(NOW, 7) == datetime(2026, 11, 13, 17, 0, tzinfo=UTC)


def test_in_period_boundary():
    start = m.period_start(NOW, 7)
    assert m.in_period(start, NOW, 7)
    assert not m.in_period(start - timedelta(seconds=1), NOW, 7)


# ---- parcels, area, yield ----

def test_area_and_parcels_by_status_follow_the_core_labels():
    parcels = [parcel("P1", "TENDING", 2.0), parcel("P2", "TENDING", 1.5), parcel("P3", "HARVESTED", 3.0),
               parcel("P4", "DRAFT", 0.5)]
    assert m.total_area(parcels) == 7.0
    assert m.parcels_by_status(parcels) == [("Đang trồng mới", 0), ("Đang chăm sóc", 2), ("Đã duyệt thu hoạch", 0),
                                            ("Đã thu hoạch", 1), ("Khởi tạo", 1)]


def test_expected_yield_uses_the_core_definition_and_counts_missing_yield():
    # core dashboard: parcels that are not HARVESTED or DRAFT; area × yield per ha; the missing ones are counted
    parcels = [parcel("P1", "SOWING", 2.0, 1500.0), parcel("P2", "TENDING", 1.0, None),
               parcel("P3", "HARVESTED", 9.0, 9999.0), parcel("P4", "DRAFT", 9.0, 9999.0),
               parcel("P5", "HARVEST_APPROVED", 0.5, 2000.0)]
    result = m.expected_yield(parcels)
    assert result.kg == 4000.0 and result.missing == 1 and result.parcels == 3


def test_expected_yield_without_parcels_is_zero_with_no_missing():
    result = m.expected_yield([])
    assert (result.kg, result.missing, result.parcels) == (0.0, 0, 0)


def test_cultivating_parcels_have_an_open_crop_cycle():
    parcels = [parcel("P1", cycle=cycle()), parcel("P2", cycle=None), parcel("P3", cycle=cycle())]
    assert m.cultivating(parcels) == 2


# ---- harvest calendar ----

def test_harvest_due_today_is_due_not_overdue():
    today_noon_vn = datetime(2026, 11, 20, 0, 0, tzinfo=UTC)  # 07:00 VN on the 20th
    parcels = [parcel("P1", cycle=cycle(today_noon_vn))]
    result = m.harvest_calendar(parcels, NOW)
    assert [p.code for p in result.upcoming_7] == ["P1"] and result.overdue == []


def test_harvest_yesterday_is_overdue_and_in_seven_days_is_upcoming():
    yesterday = datetime(2026, 11, 19, 3, 0, tzinfo=UTC)
    in_seven = datetime(2026, 11, 27, 3, 0, tzinfo=UTC)
    in_eight = datetime(2026, 11, 28, 3, 0, tzinfo=UTC)
    parcels = [parcel("P1", cycle=cycle(yesterday)), parcel("P2", cycle=cycle(in_seven)),
               parcel("P3", cycle=cycle(in_eight)), parcel("P4", cycle=cycle(None))]
    result = m.harvest_calendar(parcels, NOW)
    assert [p.code for p in result.overdue] == ["P1"]
    assert [p.code for p in result.upcoming_7] == ["P2"]
    assert [p.code for p in result.upcoming_30] == ["P2", "P3"]
    assert result.without_date == 1


def test_harvest_calendar_ignores_parcels_without_an_open_cycle():
    assert m.harvest_calendar([parcel("P1", cycle=None)], NOW).upcoming_30 == []


def test_expected_yield_by_month():
    parcels = [parcel("P1", area=1, yield_per_ha=1000, cycle=cycle(datetime(2026, 12, 3, tzinfo=UTC))),
               parcel("P2", area=2, yield_per_ha=500, cycle=cycle(datetime(2026, 12, 20, tzinfo=UTC))),
               parcel("P3", area=1, yield_per_ha=100, cycle=cycle(datetime(2027, 1, 2, tzinfo=UTC))),
               parcel("P4", area=1, yield_per_ha=None, cycle=cycle(datetime(2027, 1, 2, tzinfo=UTC)))]
    assert m.expected_by_month(parcels) == [("12/2026", 2000.0), ("01/2027", 100.0)]


# ---- journals ----

def entry(id="e1", status="PENDING_APPROVAL", created=None, date_=None, activity="SPRAYING", household="Hộ A", parcel_code="P1"):
    created = created or at(1)
    return m.Journal(id=id, parcel_code=parcel_code, household_name=household, entry_date=date_ or created,
                     activity_type=activity, status=status, created_at=created, performed_by=household)


def test_pending_older_than_three_days_boundary():
    rows = [entry("a", created=at(3)),                      # exactly 3 days: not over
            entry("b", created=at(3, hours_ago=0.01)),       # a little over
            entry("c", created=at(10), status="APPROVED"),   # not pending
            entry("d", created=at(4), status="REQUEST_CHANGES")]
    assert [e.id for e in m.pending_over(rows, NOW)] == ["b"]


def test_pending_counts_keep_request_changes_apart():
    rows = [entry("a"), entry("b"), entry("c", status="REQUEST_CHANGES"), entry("d", status="APPROVED")]
    assert m.journal_status_counts(rows) == {"PENDING_APPROVAL": 2, "REQUEST_CHANGES": 1, "APPROVED": 1, "REJECTED": 0}


def test_journals_by_activity_labels_in_vietnamese_and_keeps_zero_out():
    rows = [entry(activity="SPRAYING"), entry(activity="SPRAYING"), entry(activity="HARVEST")]
    assert m.by_activity(rows) == [("Phun thuốc", 2), ("Thu hoạch", 1)]


def test_top_households_and_silent_households():
    households = ["Hộ A", "Hộ B", "Hộ C"]
    rows = [entry("1", household="Hộ B"), entry("2", household="Hộ B"), entry("3", household="Hộ A")]
    assert m.top_households(rows, 10) == [("Hộ B", 2), ("Hộ A", 1)]
    assert m.top_households(rows, 1) == [("Hộ B", 2)]
    assert m.households_without_entries(households, rows) == ["Hộ C"]


# ---- disease reports ----

def disease(id="d1", status="PENDING", created=None, ai="Bệnh A", confirmed=None, parcel_code="P1"):
    created = created or at(1)
    return m.Disease(id=id, parcel_code=parcel_code, household_name="Hộ A", detection_date=created, ai_name=ai,
                     confidence=0.8, confirmed=confirmed, status=status, created_at=created)


def test_disease_kinds_use_confirmed_diagnosis_and_label_the_ai_guess():
    rows = [disease("1", status="CONFIRMED", confirmed="Thối búp"), disease("2", status="PENDING", ai="Rầy xanh"),
            disease("3", status="CONFIRMED", confirmed="Thối búp")]
    assert m.disease_kinds(rows) == [("Thối búp", 2), ("Rầy xanh (AI dự đoán)", 1)]
    # A rejection is a handling status, never a kind: a rejected report counts under the AI's name, marked as a guess.
    assert m.disease_kinds([disease("4", status="REJECTED", ai="Rầy xanh")]) == [("Rầy xanh (AI dự đoán)", 1)]
    assert m.disease_kind(disease("5", status="REJECTED", ai="Rầy xanh")) == "Rầy xanh (AI dự đoán)"


def test_disease_pending_and_recent_week_boundary():
    rows = [disease("1", status="PENDING", created=at(7)), disease("2", status="CONFIRMED", created=at(7, 0.01)),
            disease("3", status="PENDING", created=at(2))]
    assert m.disease_pending(rows) == 2
    assert m.disease_recent(rows, NOW, 7) == 2  # exactly 7 days still counts; a little over does not


def test_disease_by_parcel_top():
    rows = [disease("1", parcel_code="P2"), disease("2", parcel_code="P2"), disease("3", parcel_code="P1")]
    assert m.disease_by_parcel(rows, 5) == [("P2", 2), ("P1", 1)]


# ---- lots ----

def lot(code="L1", status="DRAFT", created=None, estimated=None, actual=None):
    return m.Lot(code=code, commodity="Chè", grade=None, harvest_date=at(1), estimated_kg=estimated, actual_kg=actual,
                 status=status, created_at=created or at(1))


def test_lots_by_status_in_order_and_estimated_weight():
    rows = [lot("1", "DRAFT", estimated=100), lot("2", "READY", estimated=50.5), lot("3", "READY", estimated=None),
            lot("4", "QR_EXPORTED", estimated=10)]
    assert m.lots_by_status(rows) == [("Nháp", 1), ("Sẵn sàng", 2), ("Đã xuất QR", 1)]
    assert m.lot_weight_by_status(rows) == [("Nháp", 100.0), ("Sẵn sàng", 50.5), ("Đã xuất QR", 10.0)]


def test_lots_by_month_uses_vietnam_time():
    rows = [lot("1", created=datetime(2026, 10, 31, 18, 0, tzinfo=UTC)),  # 01/11 in Vietnam
            lot("2", created=datetime(2026, 11, 5, tzinfo=UTC))]
    assert m.lots_by_month(rows, NOW, 3) == [("09/2026", 0), ("10/2026", 0), ("11/2026", 2)]


# ---- sensors ----

def reading(parcel_code="P1", sensor="soil_moisture", ts=None, value=40.0):
    return m.Reading(parcel_code=parcel_code, sensor=sensor, ts=ts or at(hours_ago=1), value=value)


def test_silent_sensor_boundary_is_strictly_over_six_hours():
    rows = [reading("P1", ts=at(hours_ago=6)), reading("P2", ts=at(hours_ago=6.01)), reading("P3", ts=at(hours_ago=1))]
    assert [r.parcel_code for r in m.silent_sensors(rows, NOW)] == ["P2"]


def test_sensor_summary_counts_parcels_and_silent():
    rows = [reading("P1", "a", at(hours_ago=1)), reading("P1", "b", at(hours_ago=9)), reading("P2", "a", at(hours_ago=9))]
    summary = m.sensor_summary(rows, NOW)
    assert (summary.parcels, summary.sensors, summary.silent) == (2, 3, 2)


def test_sensor_summary_with_no_readings_is_all_zero():
    summary = m.sensor_summary([], NOW)
    assert (summary.parcels, summary.sensors, summary.silent) == (0, 0, 0)


def test_age_text():
    assert m.age_text(at(hours_ago=0.05), NOW) == "vừa xong"
    assert m.age_text(at(hours_ago=0.2), NOW) == "12 phút trước"
    assert m.age_text(at(hours_ago=3), NOW) == "3 giờ trước"
    assert m.age_text(at(days_ago=2), NOW) == "2 ngày trước"
    assert m.age_text(at(hours_ago=0.5), NOW) == "30 phút trước"


# ---- lifecycle ----

def run(status="done", day=date(2026, 11, 10), started=None, error=None, quality=None):
    return m.Run(id="r", target="cold", partition_date=day, status=status, row_count=10, min_ts=None, max_ts=None,
                 sha256="ab" * 32, size_bytes=2048, quality=quality, error=error, started_at=started or at(1),
                 finished_at=None)


def test_failed_runs_within_seven_days():
    rows = [run("failed", started=at(7)), run("failed", started=at(7, 0.01)), run("done", started=at(1)),
            run("failed", started=at(1))]
    assert len(m.failed_runs(rows, NOW)) == 2


def test_quality_summary_reads_the_dataops_keys_and_tolerates_other_shapes():
    good = {"rows": 12, "sensors": {"soil_moisture": {"count": 12, "min": 1.0, "max": 9.0, "avg": 5.0}},
            "rejects": {"out_of_range": 2, "bad_topic": 1}}
    q = m.quality_summary(good)
    assert q.rows == 12 and q.sensors == [("soil_moisture", 12, 1.0, 9.0, 5.0)] and q.rejects == 3
    assert m.quality_summary(None) is None
    assert m.quality_summary("oops") is None
    odd = m.quality_summary({"rows": "x", "sensors": [1], "rejects": 5})
    assert odd.rows == 0 and odd.sensors == [] and odd.rejects == 0


def test_hot_rows_by_day_sums_the_daily_view():
    daily = [(date(2026, 11, 19), 10), (date(2026, 11, 19), 5), (date(2026, 11, 18), 7)]
    assert m.hot_rows_by_day(daily) == [(date(2026, 11, 18), 7), (date(2026, 11, 19), 15)]


# ---- attention list ----

def test_attention_lists_only_rows_above_zero_and_is_empty_when_calm():
    calm = m.attention(pending_stale=0, disease_pending=0, disease_recent=0, silent=0, harvest_week=0, harvest_overdue=0,
                       failed_runs=0)
    assert calm == []


def test_attention_rows_name_the_count_and_a_target():
    items = m.attention(pending_stale=3, disease_pending=2, disease_recent=4, silent=1, harvest_week=5, harvest_overdue=2,
                        failed_runs=1)
    keys = [i.key for i in items]
    assert keys == ["journal", "disease", "disease_new", "sensor", "harvest_week", "harvest_overdue", "lifecycle"]
    assert items[0].count == 3 and "3 ngày" in items[0].text
    assert all(i.count > 0 and i.target for i in items)


# ---- prices ----

def test_metric_names_are_vietnamese_and_unknown_ones_lose_their_underscores():
    assert m.metric_vn("producer_price_index") == "Chỉ số giá sản xuất" and m.metric_vn("export_price") == "Giá xuất khẩu"
    assert m.metric_vn("some_new_metric") == "some new metric"


# ---- caps ----

def test_capped_note():
    assert m.capped(5000, 5000) and not m.capped(4999, 5000)


# ---- sensor names, daily statistics ----

def test_sensor_label_and_unit_fall_back_to_the_raw_name():
    assert m.sensor_label("soil_moisture") == ("Độ ẩm đất", "%")
    assert m.sensor_label("rainfall") == ("Lượng mưa", "mm")
    assert m.sensor_label("wind_speed") == ("wind_speed", "")


def test_sensor_stats_weigh_the_average_by_reading_count():
    days = [m.Daily("P1", "a", date(2026, 11, 18), 10, 2.0, 8.0, 4.0, at(2), at(2)),
            m.Daily("P1", "a", date(2026, 11, 19), 30, 1.0, 9.0, 8.0, at(1), at(1))]
    stats = m.sensor_stats(days)
    assert (stats.min, stats.max, stats.count) == (1.0, 9.0, 40) and abs(stats.avg - 7.0) < 1e-9
    assert m.sensor_stats([]) is None
