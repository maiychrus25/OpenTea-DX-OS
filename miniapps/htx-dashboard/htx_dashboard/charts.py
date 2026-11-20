# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Line chart geometry for the server-drawn SVG (no script, no style attribute): coordinates are computed here and the
colours come from CSS classes. A point is one day: its average, minimum and maximum."""
import math
from dataclasses import dataclass, field
from datetime import date

from htx_dashboard import appkit

WIDTH, HEIGHT = 480, 220
LEFT, RIGHT, TOP, BOTTOM = 44, 14, 12, 26


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
    band: str | None = None  # min..max polygon of the whole series
    dots: list[Dot] = field(default_factory=list)
    y_ticks: list[Tick] = field(default_factory=list)
    x_ticks: list[Tick] = field(default_factory=list)
    rows: list[tuple[str, str, str, str]] = field(default_factory=list)  # day, avg, min, max: the same data as text
    empty: bool = True


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


def _fmt(value: float) -> str:
    return appkit.number(value, 1)


def line_chart(points: list[Point]) -> LineChart:
    if not points:
        return LineChart()
    points = sorted(points, key=lambda p: p.day)
    ticks = nice_ticks(min(p.min for p in points), max(p.max for p in points))
    low, high = ticks[0], ticks[-1]
    right, bottom = WIDTH - RIGHT, HEIGHT - BOTTOM
    first, span = points[0].day, (points[-1].day - points[0].day).days

    def x_of(day: date) -> float:
        return round((LEFT + right) / 2 if span == 0 else LEFT + (day - first).days / span * (right - LEFT), 1)

    def y_of(value: float) -> float:
        return round(bottom - (value - low) / (high - low) * (bottom - TOP), 1)

    segments, current, previous = [], [], None
    for p in points:
        if previous is not None and (p.day - previous).days > 1:
            segments.append(current)
            current = []
        current.append(f"{x_of(p.day)},{y_of(p.avg)}")
        previous = p.day
    segments.append(current)
    # A run of one day is drawn as a dot only.
    lines = [" ".join(s) for s in segments if len(s) > 1]

    band = None
    if len(points) > 1 and any(p.max > p.min for p in points):
        upper = [f"{x_of(p.day)},{y_of(p.max)}" for p in points]
        lower = [f"{x_of(p.day)},{y_of(p.min)}" for p in reversed(points)]
        band = " ".join(upper + lower)

    step = max(1, math.ceil(span / 5)) if span else 1
    x_ticks = [Tick(x_of(p.day), p.day.strftime("%d/%m")) for p in points if span == 0 or (p.day - first).days % step == 0]
    return LineChart(
        segments=lines, band=band,
        dots=[Dot(x_of(p.day), y_of(p.avg), f"{p.day:%d/%m}: {_fmt(p.avg)}") for p in points],
        y_ticks=[Tick(y_of(v), _fmt(v), v) for v in ticks],
        x_ticks=x_ticks[:6],
        rows=[(f"{p.day:%d/%m}", _fmt(p.avg), _fmt(p.min), _fmt(p.max)) for p in points],
        empty=False)
