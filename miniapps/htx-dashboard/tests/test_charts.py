# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Line chart geometry: points, axis ticks, empty and single-point series, gaps."""
from datetime import date, timedelta

from htx_dashboard import charts

D0 = date(2026, 11, 1)


def pts(values, start=D0, step=1):
    return [charts.Point(start + timedelta(days=i * step), v, v - 1, v + 1) for i, v in enumerate(values)]


def coords(segment: str) -> list[tuple[float, float]]:
    return [tuple(float(n) for n in pair.split(",")) for pair in segment.split()]


def test_no_points_is_an_empty_chart():
    chart = charts.line_chart([])
    assert chart.empty and chart.segments == [] and chart.dots == [] and chart.y_ticks == []


def test_a_single_point_is_a_dot_in_the_middle_without_a_line():
    chart = charts.line_chart(pts([5.0]))
    assert not chart.empty and chart.segments == [] and len(chart.dots) == 1
    x, y = chart.dots[0].x, chart.dots[0].y
    assert abs(x - (chart.plot_left + chart.plot_right) / 2) < 1 and chart.plot_top <= y <= chart.plot_bottom


def test_higher_values_are_higher_on_the_page_and_everything_stays_inside_the_plot():
    chart = charts.line_chart(pts([10.0, 20.0, 15.0]))
    assert len(chart.segments) == 1
    (x1, y1), (x2, y2), (x3, y3) = coords(chart.segments[0])
    assert x1 < x2 < x3 and y2 < y3 < y1
    for x, y in coords(chart.segments[0]):
        assert chart.plot_left <= x <= chart.plot_right and chart.plot_top <= y <= chart.plot_bottom


def test_a_missing_day_splits_the_line():
    values = pts([1.0, 2.0]) + pts([3.0, 4.0], start=D0 + timedelta(days=4))
    chart = charts.line_chart(values)
    assert len(chart.segments) == 2 and len(chart.dots) == 4


def test_constant_series_does_not_divide_by_zero():
    chart = charts.line_chart([charts.Point(D0 + timedelta(days=i), 7.0, 7.0, 7.0) for i in range(3)])
    assert chart.y_ticks and all(chart.plot_top <= t.y <= chart.plot_bottom for t in chart.y_ticks)
    assert chart.band is None


def test_band_covers_min_to_max_and_closes():
    chart = charts.line_chart(pts([10.0, 20.0, 15.0]))
    ring = coords(chart.band)
    assert len(ring) == 6  # three points out along the max, back along the min


def test_y_ticks_are_round_numbers_covering_the_range():
    chart = charts.line_chart(pts([12.0, 47.0, 30.0]))
    labels = [t.label for t in chart.y_ticks]
    assert 3 <= len(labels) <= 6
    values = [t.value for t in chart.y_ticks]
    assert values == sorted(values) and values[0] <= 11.0 and values[-1] >= 48.0


def test_nice_ticks_step_is_1_2_or_5_times_a_power_of_ten():
    for lo, hi in ((0, 1), (0, 100), (13, 17), (-5, 23), (0.1, 0.35)):
        ticks = charts.nice_ticks(lo, hi)
        steps = {round(b - a, 9) for a, b in zip(ticks, ticks[1:])}
        assert len(steps) == 1
        step = steps.pop()
        mantissa = step / 10 ** __import__("math").floor(__import__("math").log10(step))
        assert round(mantissa, 6) in (1.0, 2.0, 5.0, 10.0)
        assert ticks[0] <= lo and ticks[-1] >= hi


def test_x_ticks_are_day_month_labels_and_at_most_six():
    chart = charts.line_chart(pts([float(i) for i in range(30)]))
    assert 2 <= len(chart.x_ticks) <= 6
    assert chart.x_ticks[0].label == "01/11"


def test_table_rows_mirror_the_points_for_screen_readers():
    chart = charts.line_chart(pts([1.0, 2.0]))
    assert [r[0] for r in chart.rows] == ["01/11", "02/11"] and len(chart.rows[0]) == 4


def test_a_line_chart_asks_for_few_ticks_so_its_labels_stay_readable():
    chart = charts.line_chart(pts([float(i) for i in range(30)]))
    assert len(chart.y_ticks) <= 4 and len(chart.x_ticks) <= 4
