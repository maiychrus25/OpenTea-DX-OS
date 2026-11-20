# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Chart toolkit geometry: columns, bars, donut, sparkline, gauge, ring, calendar, grid levels, funnel, timeline, delta,
scatter. Every function is pure; the numbers asserted here are the ones the templates draw."""
import math
import re
from datetime import date, timedelta

from htx_dashboard import charts

D0 = date(2026, 11, 2)  # a Monday
TODAY = date(2026, 11, 20)


def coords(text: str) -> list[tuple[float, float]]:
    return [tuple(float(n) for n in pair.split(",")) for pair in text.split()]


# ---------- line and area ----------

def test_area_fill_closes_each_unbroken_run_on_the_baseline():
    points = [charts.Point(D0 + timedelta(days=i), float(v), v - 1.0, v + 1.0) for i, v in enumerate([4, 6, 5])]
    plain = charts.line_chart(points)
    filled = charts.line_chart(points, area=True)
    assert plain.fills == []
    assert len(filled.fills) == 1
    ring = coords(filled.fills[0])
    assert ring[0][1] == ring[-1][1] == filled.plot_bottom  # back down to the baseline at both ends
    assert ring[0][0] == coords(filled.segments[0])[0][0]


# ---------- columns ----------

def test_stacked_columns_add_up_to_the_column_total_on_one_scale():
    chart = charts.column_chart(["T1", "T2"], [[2, 0], [3, 4]], ["A", "B"], stacked=True)
    assert not chart.empty
    first = [m for m in chart.marks if m.title.startswith("T1")]
    assert sorted(m.title for m in first) == ["T1 · A: 2", "T1 · B: 3"]
    top_of_stack = min(m.y for m in first)
    bottom_of_stack = max(m.y + m.height for m in first)
    assert abs((bottom_of_stack - top_of_stack) - (chart.plot_bottom - chart.plot_top) * 5 / chart.y_ticks[-1].value) < 0.5
    assert all(chart.plot_top <= m.y and m.y + m.height <= chart.plot_bottom + 0.01 for m in chart.marks)


def test_zero_values_draw_no_mark_and_all_zero_is_empty():
    assert charts.column_chart(["a"], [[0]], ["x"]).empty
    assert charts.column_chart([], [], []).empty
    chart = charts.column_chart(["a", "b"], [[0, 3]], ["x"])
    assert len(chart.marks) == 1 and chart.marks[0].title == "b · x: 3"


def test_grouped_columns_sit_side_by_side_without_overlap():
    chart = charts.column_chart(["Ước tính", "Thực tế"], [[10, 4], [12, 8]], ["Ước", "Thực"], stacked=False)
    by_title = {m.title: m for m in chart.marks}
    a, b = by_title["Ước tính · Ước: 10"], by_title["Ước tính · Thực: 12"]
    assert a.x + a.width <= b.x + 0.01
    assert all(m.y >= chart.plot_top - 0.01 for m in chart.marks)


def test_many_categories_thin_their_labels_and_keep_the_table_rows():
    labels = [f"w{i}" for i in range(30)]
    chart = charts.column_chart(labels, [[float(i) for i in range(30)]], ["n"])
    assert 1 <= len(chart.labels) <= 12
    assert len(chart.rows) == 30 and chart.rows[0] == ("w0", "0")


def test_tones_wrap_after_eight_series():
    chart = charts.column_chart(["a"], [[1.0] for _ in range(10)], [f"s{i}" for i in range(10)])
    assert {m.tone for m in chart.marks} == set(range(charts.TONES))


# ---------- horizontal bars as rows ----------

def test_bar_rows_scale_to_the_largest_and_keep_zero_rows():
    rows = charts.bar_rows([("Hộ A", 10), ("Hộ B", 5), ("Hộ C", 0)])
    assert [r.percent for r in rows] == [100.0, 50.0, 0.0]
    assert rows[0].value == "10" and rows[0].title == "Hộ A: 10"


def test_bar_rows_with_nothing_is_all_zero_not_a_division_error():
    assert [r.percent for r in charts.bar_rows([("x", 0), ("y", 0)])] == [0.0, 0.0]
    assert charts.bar_rows([]) == []


# ---------- donut ----------

def test_donut_arcs_follow_the_shares_and_the_total_is_kept():
    donut = charts.donut([("Đang gieo", 1), ("Đang chăm sóc", 3)], centre="4")
    assert not donut.empty and donut.total == 4 and donut.centre == "4"
    assert [round(a.share) for a in donut.arcs] == [25, 75]
    assert all(a.d.startswith("M") and a.d.endswith("Z") for a in donut.arcs)


def test_a_single_full_slice_is_drawn_as_two_arcs_not_a_degenerate_one():
    donut = charts.donut([("Tất cả", 5)])
    assert len(donut.arcs) == 1 and donut.arcs[0].d.count("A") == 4  # two arcs each on the outer and inner ring


def test_empty_donut_when_nothing_to_show():
    assert charts.donut([("a", 0)]).empty and charts.donut([]).empty


# ---------- sparkline ----------

def test_sparkline_breaks_at_missing_days_and_marks_the_last_point():
    spark = charts.sparkline([1.0, 2.0, None, 3.0, 4.0])
    assert len(spark.lines) == 2 and spark.end is not None and not spark.empty
    assert spark.end[0] > 100  # the last day sits at the right edge


def test_sparkline_of_one_point_is_a_dot_and_of_none_is_empty():
    single = charts.sparkline([5.0])
    assert single.lines == [] and single.end is not None
    assert charts.sparkline([None, None]).empty


def test_sparkline_constant_series_sits_in_the_middle():
    spark = charts.sparkline([7.0, 7.0, 7.0], height=32)
    assert len({y for _, y in coords(spark.lines[0])}) == 1


# ---------- gauge and ring ----------

def test_gauge_places_the_value_inside_its_range_and_clamps_outside():
    assert charts.gauge(45.0, 15.0, 75.0).percent == 50.0
    assert charts.gauge(90.0, 15.0, 75.0).percent == 100.0
    assert charts.gauge(-5.0, 0.0, 10.0).percent == 0.0


def test_gauge_with_a_flat_range_or_no_value_is_safe():
    assert charts.gauge(3.0, 3.0, 3.0).percent == 50.0
    assert charts.gauge(None, 0.0, 1.0).empty


def test_ring_dash_is_the_share_out_of_one_hundred():
    assert charts.ring(25.0).dash == 25.0
    assert charts.ring(140.0).dash == 100.0 and charts.ring(-3.0).dash == 0.0


# ---------- calendar heatmap ----------

def test_calendar_is_a_grid_of_weeks_down_and_weekdays_across():
    cal = charts.calendar({}, D0, D0 + timedelta(days=13))
    assert len(cal.cells) == 14 and all(c.tone == 0 for c in cal.cells)
    mon0, tue0, mon1 = cal.cells[0], cal.cells[1], cal.cells[7]
    assert tue0.x == mon0.x + charts.PITCH and tue0.y == mon0.y  # Tuesday to the right of Monday
    assert mon1.x == mon0.x and mon1.y == mon0.y + charts.PITCH  # the next Monday on the next row
    assert [t.label for t in cal.row_labels] == ["02/11", "09/11"]  # the Monday that starts each row
    assert [t.label for t in cal.col_labels] == ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]


def test_calendar_rows_are_labelled_once_each_and_never_by_month():
    cal = charts.calendar({}, D0, D0 + timedelta(days=29))
    assert len(cal.row_labels) == 5 and len({t.pos for t in cal.row_labels}) == 5
    assert not any("/2026" in t.label for t in cal.row_labels)


def test_calendar_levels_scale_to_the_busiest_day_and_title_says_the_count():
    counts = {D0: 1, D0 + timedelta(days=1): 4, D0 + timedelta(days=2): 0}
    cal = charts.calendar(counts, D0, D0 + timedelta(days=2))
    assert [c.tone for c in cal.cells] == [1, 4, 0]
    assert cal.cells[1].title == "03/11/2026: 4 nhật ký"


def test_calendar_with_no_entries_is_all_empty_cells():
    cal = charts.calendar({}, D0, TODAY)
    assert all(c.tone == 0 for c in cal.cells) and len(cal.cells) == (TODAY - D0).days + 1


# ---------- matrix levels ----------

def test_heat_levels_map_zero_and_missing_to_none_and_scale_the_rest():
    assert charts.heat_levels([0, None, 2, 4]) == [0, 0, 2, 4]
    assert charts.heat_levels([0, 0]) == [0, 0]
    assert charts.heat_levels([1, 100]) == [1, 4]


# ---------- funnel ----------

def test_funnel_steps_share_of_the_first_and_conversion_from_the_one_before():
    steps = charts.funnel_steps([("Nháp", 10), ("Sẵn sàng", 5), ("Đã xuất QR", 0)])
    assert [s.percent for s in steps] == [100.0, 50.0, 0.0]
    assert steps[0].conversion == "" and steps[1].conversion == "50% của bước trước"
    assert steps[2].conversion == "0% của bước trước"


def test_funnel_with_no_first_step_does_not_divide_by_zero():
    steps = charts.funnel_steps([("a", 0), ("b", 0)])
    assert [s.percent for s in steps] == [0.0, 0.0] and steps[1].conversion == "—"


# ---------- timeline ----------

def test_timeline_places_due_dates_on_a_shared_scale_with_today_in_it():
    lanes = [charts.Lane("P-TC-001", None, TODAY + timedelta(days=5)), charts.Lane("P-TC-002", D0, TODAY - timedelta(days=2), "overdue")]
    tl = charts.timeline(lanes, TODAY)
    assert not tl.empty and len(tl.tracks) == 2
    for track in tl.tracks:
        for bar in track.bars:
            assert 0 <= bar.x and bar.x + bar.width <= 1000.01
    assert 0 < tl.today < 1000
    assert tl.tracks[1].bars[0].tone == "overdue"
    assert tl.tracks[0].marker > tl.today


def test_timeline_with_no_lanes_is_empty():
    assert charts.timeline([], TODAY).empty


# ---------- period delta ----------

def test_delta_shows_direction_and_percent_against_the_previous_period():
    up = charts.delta(125, 100)
    assert up.tone == "up" and up.text == "▲ 25% so với kỳ trước"
    down = charts.delta(80, 100)
    assert down.tone == "down" and down.text == "▼ 20% so với kỳ trước"


def test_delta_without_a_previous_value_and_when_flat():
    assert charts.delta(4, 0).tone == "new"
    assert charts.delta(0, 0).tone == "flat" and charts.delta(10, 10).text == "không đổi so với kỳ trước"


# ---------- scatter ----------

def test_scatter_keeps_every_dot_inside_the_plot_and_has_ticks_on_both_axes():
    sc = charts.scatter([(18.0, 70.0, "02/11"), (25.0, 60.0, "03/11"), (31.0, 40.0, "04/11")])
    assert not sc.empty and len(sc.dots) == 3
    assert all(sc.plot_left <= d.x <= sc.plot_right and sc.plot_top <= d.y <= sc.plot_bottom for d in sc.dots)
    assert len(sc.x_ticks) >= 2 and len(sc.y_ticks) >= 2
    assert sc.rows == [("02/11", "18", "70"), ("03/11", "25", "60"), ("04/11", "31", "40")]


def test_scatter_of_one_point_or_none_is_safe():
    assert charts.scatter([]).empty
    single = charts.scatter([(5.0, 5.0, "x")])
    assert not single.empty and len(single.dots) == 1


# ---------- lint-like guards on what the templates will print ----------

def test_no_geometry_string_contains_a_style_or_script_marker():
    chart = charts.column_chart(["a", "b"], [[1, 2]], ["x"])
    donut = charts.donut([("a", 1), ("b", 2)])
    text = " ".join([m.title for m in chart.marks] + [a.d for a in donut.arcs])
    assert not re.search(r"style|script|<", text)


def test_tone_and_level_helpers_are_within_the_css_classes():
    assert charts.TONES == 8 and charts.SEQUENCE == 5
    assert all(0 <= c.tone <= 4 for c in charts.calendar({D0: 9}, D0, TODAY).cells)
    assert math.isfinite(charts.gauge(1.0, 0.0, 2.0).percent)


def test_column_labels_never_run_into_each_other():
    """A label is about 54 units wide: labels are thinned until neighbours are at least that far apart."""
    labels = [f"{d:02d}/10" for d in range(9, 21)]  # twelve runs, as the data tab shows them
    chart = charts.column_chart(labels, [[float(i + 1) for i in range(12)]], ["n"])
    xs = [t.pos for t in chart.labels]
    assert len(xs) >= 2 and all(b - a >= 54 for a, b in zip(xs, xs[1:]))
