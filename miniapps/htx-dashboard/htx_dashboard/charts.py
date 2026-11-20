# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Chart toolkit for the server-drawn charts (no script, no style attribute, no new dependency).

Every coordinate, width, share and colour level is computed here; the templates only print them. Colours are CSS
classes: `tone-N` (categorical, N < TONES) and `seq-N` (sequential, N < SEQUENCE) from dashboard.css. Each chart also
carries the numbers as text (rows, labels or a table in the template), so colour is never the only carrier of meaning.
Every function is pure: the caller passes the dates, nothing reads the clock.
"""
import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Mapping, Sequence

from htx_dashboard import appkit

WIDTH, HEIGHT = 480, 220
LEFT, RIGHT, TOP, BOTTOM = 44, 14, 12, 26
TONES = 8  # categorical colours tone-0 .. tone-7
SEQUENCE = 5  # sequential levels seq-0 (none) .. seq-4 (most)
PITCH, CELL = 30, 24  # calendar cell pitch and size in user units
HEAD, ROW_LABEL = 18, 52  # room for the weekday names above the grid and the week's first day at its left
DONUT_CENTRE, DONUT_OUTER, DONUT_INNER = 100, 92, 62
LABEL_WIDTH = 54  # user units a column label of up to six characters takes at the axis text size
MAX_STACK_BAR, MAX_GROUP_BAR = 40, 56  # a wide chart spreads its categories instead of fattening its bars
PHONE_WIDTH = 326  # the drawing of a phone: the content width of a card on a 390 px screen
# The drawing width of a card's content at 1280 px, by its span of the twelve columns (the text stays the same size).
CARD_WIDTH = {3: 224, 4: 315, 5: 405, 6: 496, 7: 587, 8: 677, 12: 1056}
X_LABEL_WIDTH = 100  # user units a line chart's date label needs, so ticks thin as the chart narrows
GANTT_SPAN = 1000  # a timeline is drawn on 0..1000 and stretched by the page


@dataclass(frozen=True)
class Point:
    day: date
    avg: float
    min: float
    max: float


@dataclass(frozen=True)
class Tick:
    pos: float  # x for an x tick, y for a y tick
    label: str
    value: float = 0.0

    @property
    def y(self) -> float:
        return self.pos


@dataclass(frozen=True)
class Dot:
    x: float
    y: float
    label: str


@dataclass(frozen=True)
class LineChart:
    width: int = WIDTH
    height: int = HEIGHT
    plot_left: float = LEFT
    plot_right: float = WIDTH - RIGHT
    plot_top: float = TOP
    plot_bottom: float = HEIGHT - BOTTOM
    segments: list[str] = field(default_factory=list)  # "x,y x,y ..." for each unbroken run of days
    fills: list[str] = field(default_factory=list)  # the same runs closed on the baseline, for an area chart
    band: str | None = None  # min..max polygon of the whole series
    dots: list[Dot] = field(default_factory=list)
    y_ticks: list[Tick] = field(default_factory=list)
    x_ticks: list[Tick] = field(default_factory=list)
    rows: list[tuple[str, str, str, str]] = field(default_factory=list)  # day, avg, min, max: the same data as text
    empty: bool = True


@dataclass(frozen=True)
class Mark:
    x: float
    y: float
    width: float
    height: float
    title: str
    tone: int = 0


@dataclass(frozen=True)
class Columns:
    width: int = WIDTH
    height: int = HEIGHT
    plot_left: float = LEFT
    plot_right: float = WIDTH - RIGHT
    plot_top: float = TOP
    plot_bottom: float = HEIGHT - BOTTOM
    marks: list[Mark] = field(default_factory=list)
    labels: list[Tick] = field(default_factory=list)  # x = centre of the category
    y_ticks: list[Tick] = field(default_factory=list)
    names: list[str] = field(default_factory=list)
    rows: list[tuple[str, ...]] = field(default_factory=list)  # category, then one value per series: the same data as text
    empty: bool = True


@dataclass(frozen=True)
class BarRow:
    label: str
    value: str
    percent: float
    tone: int
    title: str


@dataclass(frozen=True)
class Arc:
    d: str
    tone: int
    title: str
    share: float


@dataclass(frozen=True)
class Donut:
    arcs: list[Arc]
    total: float
    centre: str
    empty: bool


@dataclass(frozen=True)
class Spark:
    lines: list[str]
    end: tuple[float, float] | None
    empty: bool


@dataclass(frozen=True)
class Gauge:
    percent: float  # where the value sits in its range, 0..100
    low: str
    high: str
    value: str
    empty: bool


@dataclass(frozen=True)
class Ring:
    dash: float  # the share out of 100, the circle's dash length


@dataclass(frozen=True)
class Cell:
    x: float
    y: float
    size: float
    tone: int  # sequential level 0..SEQUENCE-1
    title: str


@dataclass(frozen=True)
class Calendar:
    cells: list[Cell]
    row_labels: list[Tick]  # the Monday that starts each row of weeks
    col_labels: list[Tick]  # the weekday names, T2 to CN
    width: int
    height: int
    empty: bool


@dataclass(frozen=True)
class Step:
    label: str
    value: str
    percent: float
    conversion: str
    tone: int


@dataclass(frozen=True)
class Lane:
    label: str
    start: date | None
    end: date
    tone: str = "plan"  # "plan" or "overdue"


@dataclass(frozen=True)
class Bar:
    x: float
    width: float
    tone: str
    title: str


@dataclass(frozen=True)
class Track:
    label: str
    bars: list[Bar]
    marker: float
    today: float
    title: str


@dataclass(frozen=True)
class Timeline:
    tracks: list[Track]
    ticks: list[Tick]
    today: float
    empty: bool


@dataclass(frozen=True)
class Delta:
    text: str
    tone: str  # "up", "down", "flat" or "new"


@dataclass(frozen=True)
class Scatter:
    dots: list[Dot]
    x_ticks: list[Tick]
    y_ticks: list[Tick]
    plot_left: float
    plot_right: float
    plot_top: float
    plot_bottom: float
    empty: bool
    rows: list[tuple[str, str, str]] = field(default_factory=list)  # label, x, y: the same dots as text
    width: int = WIDTH
    height: int = HEIGHT


def nice_ticks(low: float, high: float, target: int = 4) -> list[float]:
    """Evenly spaced round values (step 1, 2 or 5 × a power of ten) that cover [low, high]."""
    if high <= low:
        low, high = low - 1, high + 1
    raw = (high - low) / target
    power = 10 ** math.floor(math.log10(raw))
    step = next(m * power for m in (1, 2, 5, 10) if m * power >= raw)
    first = math.floor(low / step + 1e-9) * step
    count = math.ceil((high - first) / step - 1e-9)
    return [round(first + i * step, 10) for i in range(count + 1)]


def _fmt(value: float, digits: int = 1) -> str:
    return appkit.number(value, digits)


def _runs(indexed: Sequence[tuple[int, float | None]]) -> list[list[tuple[int, float]]]:
    """Splits a series at its missing values: each run is a list of (index, value) with values present."""
    runs: list[list[tuple[int, float]]] = []
    current: list[tuple[int, float]] = []
    for i, v in indexed:
        if v is None:
            if current:
                runs.append(current)
            current = []
        else:
            current.append((i, v))
    if current:
        runs.append(current)
    return runs


# ---------- line and area (one daily series) ----------

def line_chart(points: list[Point], area: bool = False, width: int = WIDTH) -> LineChart:
    if not points:
        return LineChart(width=width, plot_right=width - RIGHT)
    points = sorted(points, key=lambda p: p.day)
    ticks = nice_ticks(min(p.min for p in points), max(p.max for p in points), target=3)  # few ticks: readable text
    low, high = ticks[0], ticks[-1]
    right, bottom = width - RIGHT, HEIGHT - BOTTOM
    first, span = points[0].day, (points[-1].day - points[0].day).days

    def x_of(day: date) -> float:
        return round((LEFT + right) / 2 if span == 0 else LEFT + (day - first).days / span * (right - LEFT), 1)

    def y_of(value: float) -> float:
        return round(bottom - (value - low) / (high - low) * (bottom - TOP), 1)

    # A gap in the days splits the line; a run of one day is a dot only.
    runs, current, previous = [], [], None
    for p in points:
        if previous is not None and (p.day - previous).days > 1:
            runs.append(current)
            current = []
        current.append((x_of(p.day), y_of(p.avg)))
        previous = p.day
    runs.append(current)
    lines = [" ".join(f"{x},{y}" for x, y in run) for run in runs if len(run) > 1]
    fills = [f"{run[0][0]},{bottom} " + " ".join(f"{x},{y}" for x, y in run) + f" {run[-1][0]},{bottom}"
             for run in runs if len(run) > 1] if area else []

    band = None
    if len(points) > 1 and any(p.max > p.min for p in points):
        upper = [f"{x_of(p.day)},{y_of(p.max)}" for p in points]
        lower = [f"{x_of(p.day)},{y_of(p.min)}" for p in reversed(points)]
        band = " ".join(upper + lower)

    step = max(1, math.ceil(span / 5)) if span else 1
    x_ticks = [Tick(x_of(p.day), p.day.strftime("%d/%m")) for p in points if span == 0 or (p.day - first).days % step == 0]
    room = max(2, min(6, (width - LEFT - RIGHT) // X_LABEL_WIDTH))  # labels that fit the width, never more than six
    x_ticks = x_ticks[::max(1, math.ceil(len(x_ticks) / room))]
    return LineChart(
        width=width, plot_right=right,
        segments=lines, fills=fills, band=band,
        dots=[Dot(x_of(p.day), y_of(p.avg), f"{p.day:%d/%m}: {_fmt(p.avg)}") for p in points],
        y_ticks=[Tick(y_of(v), _fmt(v), v) for v in ticks],
        x_ticks=x_ticks,
        rows=[(f"{p.day:%d/%m}", _fmt(p.avg), _fmt(p.min), _fmt(p.max)) for p in points],
        empty=False)


# ---------- columns: stacked or grouped, one series per tone ----------

def column_chart(labels: Sequence[str], series: Sequence[Sequence[float]], names: Sequence[str], stacked: bool = True,
                 digits: int = 0, width: int = WIDTH, height: int = HEIGHT) -> Columns:
    """series[s][i] is series s at category i. Stacked columns add up to the total; grouped ones sit side by side."""
    if not labels or not series:
        return Columns(width=width, height=height, plot_right=width - RIGHT, names=list(names))
    totals = [sum(s[i] for s in series) for i in range(len(labels))]
    peak = max(totals) if stacked else max(v for s in series for v in s)
    if peak <= 0:
        return Columns(width=width, height=height, plot_right=width - RIGHT, names=list(names))
    ticks = nice_ticks(0, peak)
    high = ticks[-1]
    left, right, top, bottom = LEFT, width - RIGHT, TOP, height - BOTTOM
    slot = (right - left) / len(labels)

    def y_of(value: float) -> float:
        return round(bottom - value / high * (bottom - top), 1)

    marks = []
    for i, label in enumerate(labels):
        centre = left + (i + 0.5) * slot
        if stacked:
            bar = min(slot * 0.7, MAX_STACK_BAR)
            base = 0.0
            for s, values in enumerate(series):
                v = values[i]
                if v <= 0:
                    continue
                marks.append(Mark(round(centre - bar / 2, 1), y_of(base + v), round(bar, 1), round(y_of(base) - y_of(base + v), 1),
                                  f"{label} · {names[s]}: {_fmt(v, digits)}", s % TONES))
                base += v
        else:
            group = min(slot * 0.8, MAX_GROUP_BAR)
            sub = group / len(series)
            for s, values in enumerate(series):
                v = values[i]
                if v <= 0:
                    continue
                marks.append(Mark(round(centre - group / 2 + s * sub + 1, 1), y_of(v), round(max(sub - 2, 2), 1),
                                  round(y_of(0) - y_of(v), 1), f"{label} · {names[s]}: {_fmt(v, digits)}", s % TONES))
    step = max(1, math.ceil(LABEL_WIDTH / slot))  # keep every label that fits its slot and skip the rest
    label_ticks = [Tick(round(left + (i + 0.5) * slot, 1), label) for i, label in enumerate(labels) if i % step == 0]
    rows = [(label, *[_fmt(s[i], digits) for s in series]) for i, label in enumerate(labels)]
    return Columns(width=width, height=height, plot_right=width - RIGHT, marks=marks, labels=label_ticks,
                   y_ticks=[Tick(y_of(v), _fmt(v, digits), v) for v in ticks], names=list(names), rows=rows, empty=False)


# ---------- rows of horizontal bars (HTML rows with a percentage width) ----------

def bar_rows(items: Sequence[tuple[str, float]], digits: int = 0, tone: int = 0) -> list[BarRow]:
    """Each bar is the share of the largest value; a zero row keeps its place with an empty bar."""
    top = max((v for _, v in items), default=0)
    return [BarRow(label, _fmt(v, digits), round(v / top * 100, 2) if top > 0 else 0.0, tone, f"{label}: {_fmt(v, digits)}")
            for label, v in items]


# ---------- donut ----------

def _ring_path(a0: float, a1: float, outer: float, inner: float) -> str:
    """One annular slice from angle a0 to a1 (radians, clockwise from the top). A full turn is two half turns."""
    c = DONUT_CENTRE
    if a1 - a0 >= 2 * math.pi - 1e-9:
        mid = a0 + math.pi
        return _ring_path(a0, mid, outer, inner) + " " + _ring_path(mid, a0 + 2 * math.pi, outer, inner)

    def at(r: float, a: float) -> str:
        return f"{round(c + r * math.sin(a), 2)} {round(c - r * math.cos(a), 2)}"

    large = 1 if a1 - a0 > math.pi else 0
    return (f"M{at(outer, a0)} A{outer} {outer} 0 {large} 1 {at(outer, a1)} L{at(inner, a1)} "
            f"A{inner} {inner} 0 {large} 0 {at(inner, a0)} Z")


def donut(items: Sequence[tuple[str, float]], centre: str = "", digits: int = 0) -> Donut:
    positive = [(label, v) for label, v in items if v > 0]
    total = sum(v for _, v in positive)
    if total <= 0:
        return Donut([], 0.0, centre, True)
    arcs, angle = [], 0.0
    for s, (label, v) in enumerate(positive):
        share = v / total
        end = angle + share * 2 * math.pi
        arcs.append(Arc(_ring_path(angle, end, DONUT_OUTER, DONUT_INNER), s % TONES, f"{label}: {_fmt(v, digits)}",
                        round(share * 100, 1)))
        angle = end
    return Donut(arcs, total, centre, False)


# ---------- sparkline ----------

def sparkline(values: Sequence[float | None], width: int = 120, height: int = 32, pad: int = 3) -> Spark:
    present = [v for v in values if v is not None]
    if not present:
        return Spark([], None, True)
    low, high = min(present), max(present)
    n = len(values)

    def xy(i: int, v: float) -> tuple[float, float]:
        x = pad + ((i / (n - 1)) if n > 1 else 0.5) * (width - 2 * pad)
        share = 0.5 if high == low else (v - low) / (high - low)
        return round(x, 1), round(height - pad - share * (height - 2 * pad), 1)

    runs = _runs(list(enumerate(values)))
    lines = [" ".join(f"{x},{y}" for x, y in (xy(i, v) for i, v in run)) for run in runs if len(run) > 1]
    last_i, last_v = max(((i, v) for i, v in enumerate(values) if v is not None), key=lambda p: p[0])
    return Spark(lines, xy(last_i, last_v), False)


# ---------- gauge: the latest value inside its range ----------

def gauge(value: float | None, low: float, high: float, digits: int = 1) -> Gauge:
    if value is None:
        return Gauge(0.0, _fmt(low, digits), _fmt(high, digits), "", True)
    share = 50.0 if high <= low else (value - low) / (high - low) * 100
    return Gauge(round(min(100.0, max(0.0, share)), 1), _fmt(low, digits), _fmt(high, digits), _fmt(value, digits), False)


def ring(share: float) -> Ring:
    return Ring(round(min(100.0, max(0.0, share)), 2))


# ---------- calendar heatmap: days in weeks ----------

def calendar(counts: Mapping[date, int], start: date, end: date, unit: str = "nhật ký") -> Calendar:
    """One cell per day from start to end: a row per week (from Monday), a column per weekday."""
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    first = start - timedelta(days=start.weekday())
    peak = max((counts.get(d, 0) for d in days), default=0)
    cells, rows = [], {}
    for day in days:
        week, col = (day - first).days // 7, day.weekday()
        n = counts.get(day, 0)
        level = 0 if n <= 0 else max(1, min(SEQUENCE - 1, math.ceil(n / peak * (SEQUENCE - 1))))
        cells.append(Cell(ROW_LABEL + col * PITCH, HEAD + week * PITCH, CELL, level, f"{day:%d/%m/%Y}: {_fmt(n, 0)} {unit}"))
        rows.setdefault(week, first + timedelta(days=7 * week))
    weeks = (end - first).days // 7 + 1
    row_labels = [Tick(HEAD + week * PITCH + CELL / 2, f"{monday:%d/%m}") for week, monday in sorted(rows.items())]
    names = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
    col_labels = [Tick(ROW_LABEL + i * PITCH + CELL / 2, name) for i, name in enumerate(names)]
    return Calendar(cells, row_labels, col_labels, ROW_LABEL + 7 * PITCH, HEAD + weeks * PITCH, not days)


# ---------- matrix levels (the table is drawn in the template) ----------

def heat_levels(values: Sequence[float | None]) -> list[int]:
    """0 for nothing (zero or missing), 1..SEQUENCE-1 for the rest, scaled to the largest value."""
    peak = max((v for v in values if v), default=0)
    return [0 if not v or v <= 0 or peak <= 0 else max(1, min(SEQUENCE - 1, math.ceil(v / peak * (SEQUENCE - 1))))
            for v in values]


# ---------- funnel ----------

def funnel_steps(stages: Sequence[tuple[str, int]]) -> list[Step]:
    top = stages[0][1] if stages else 0
    steps, previous = [], None
    for i, (label, v) in enumerate(stages):
        if i == 0:
            conversion = ""
        elif previous and previous > 0:
            conversion = f"{round(v / previous * 100)}% của bước trước"
        else:
            conversion = "—"
        steps.append(Step(label, _fmt(v, 0), round(v / top * 100, 1) if top > 0 else 0.0, conversion, i % TONES))
        previous = v
    return steps


# ---------- timeline: one track per lane, a shared day scale ----------

def timeline(lanes: Sequence[Lane], today: date) -> Timeline:
    if not lanes:
        return Timeline([], [], 0.0, True)
    first = min([today] + [lane.start or lane.end for lane in lanes] + [lane.end for lane in lanes])
    last = max([today] + [lane.end for lane in lanes])
    span = max((last - first).days, 1)

    def x_of(day: date) -> float:
        return round((day - first).days / span * GANTT_SPAN, 1)

    tracks = []
    for lane in lanes:
        start = lane.start if lane.start is not None else first
        x0, x1 = x_of(start), x_of(lane.end)
        width = round(max(x1 - x0, 6.0), 1)
        bar = Bar(x0, width, lane.tone, f"{lane.label}: {lane.start:%d/%m} → {lane.end:%d/%m}" if lane.start else
                  f"{lane.label}: đến {lane.end:%d/%m}")
        tracks.append(Track(lane.label, [bar], x1, x_of(today), f"{lane.label}: dự kiến {lane.end:%d/%m/%Y}"))
    step = max(1, math.ceil(span / 6))
    ticks = [Tick(x_of(first + timedelta(days=i)), f"{(first + timedelta(days=i)):%d/%m}") for i in range(0, span + 1, step)]
    return Timeline(tracks, ticks, x_of(today), False)


# ---------- change against the previous period ----------

def delta(current: float, previous: float) -> Delta:
    if previous <= 0:
        if current <= 0:
            return Delta("không đổi so với kỳ trước", "flat")
        return Delta("▲ mới so với kỳ trước", "new")
    change = round((current - previous) / previous * 100)
    if change == 0:
        return Delta("không đổi so với kỳ trước", "flat")
    if change > 0:
        return Delta(f"▲ {_fmt(change, 0)}% so với kỳ trước", "up")
    return Delta(f"▼ {_fmt(-change, 0)}% so với kỳ trước", "down")


# ---------- scatter: two numbers per day ----------

def scatter(points: Sequence[tuple[float, float, str]], width: int = WIDTH) -> Scatter:
    left, right, top, bottom = LEFT, width - RIGHT, TOP, HEIGHT - BOTTOM
    if not points:
        return Scatter([], [], [], left, right, top, bottom, True, [], width, HEIGHT)
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    x_ticks, y_ticks = nice_ticks(min(xs), max(xs)), nice_ticks(min(ys), max(ys))
    x_lo, x_hi, y_lo, y_hi = x_ticks[0], x_ticks[-1], y_ticks[0], y_ticks[-1]

    def x_of(v: float) -> float:
        return round(left + (v - x_lo) / (x_hi - x_lo) * (right - left), 1)

    def y_of(v: float) -> float:
        return round(bottom - (v - y_lo) / (y_hi - y_lo) * (bottom - top), 1)

    dots = [Dot(x_of(x), y_of(y), label) for x, y, label in points]
    return Scatter(dots, [Tick(x_of(v), _fmt(v)) for v in x_ticks], [Tick(y_of(v), _fmt(v), v) for v in y_ticks],
                   left, right, top, bottom, False, [(label, _fmt(x), _fmt(y)) for x, y, label in points], width, HEIGHT)


# ---------- pairs: the same chart drawn for the card's width on a desktop and for a phone's width ----------

@dataclass(frozen=True)
class Pair:
    desktop: object  # drawn for the card's width at 1280 px
    phone: object  # drawn for the phone's card width, so its text keeps its size on a 390 px screen


def paired(draw, width: int, *args, **kwargs) -> Pair:
    """draw(*args, width=...) twice: the card's width and the phone's. Text is in user units, so the two keep one size."""
    return Pair(draw(*args, width=width, **kwargs), draw(*args, width=PHONE_WIDTH, **kwargs))
