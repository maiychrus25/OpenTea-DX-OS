# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The chart palette of dashboard.css: every category colour is readable on its card and neighbours in a stack differ.

Contrast is WCAG 2.x against the shared kit's card surfaces (light #ffffff, dark #112219, read from apps/web/public/dxos-app.css
on 2026-11-20); a chart mark needs at least 3:1 (WCAG 1.4.11). Neighbours (tone i and tone i+1) must differ in hue by 40 degrees
or more, since a stacked column puts them side by side."""
import colorsys
import re
from pathlib import Path

from htx_dashboard import charts

CSS = Path(__file__).resolve().parents[1] / "htx_dashboard" / "static" / "dashboard.css"
CARDS = {"light": "#ffffff", "dark": "#112219"}
NEUTRAL = 7  # tone-7 is a neutral grey: it is checked for contrast only


def luminance(hex_colour: str) -> float:
    rgb = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a: str, b: str) -> float:
    hi, lo = sorted([luminance(a), luminance(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def hue(hex_colour: str) -> float:
    rgb = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return colorsys.rgb_to_hls(*rgb)[0] * 360


def palettes() -> dict[str, list[str]]:
    """The eight tones of each of the three blocks in the stylesheet: light, dark by media query, dark by attribute."""
    tones = re.findall(r"--chart-tone-\d: (#[0-9a-f]{6});", CSS.read_text())
    assert len(tones) == 24, "three blocks of eight tones"
    return {"light": tones[0:8], "dark": tones[8:16], "dark-attribute": tones[16:24]}


def test_every_tone_reads_on_its_card_at_three_to_one_or_more():
    for name, tones in palettes().items():
        card = CARDS["light"] if name == "light" else CARDS["dark"]
        for i, tone in enumerate(tones):
            assert contrast(tone, card) >= 3.0, f"{name} tone-{i} {tone} on {card}"


def test_neighbours_in_a_stack_differ_in_hue():
    for name, tones in palettes().items():
        for i in range(NEUTRAL - 1):
            gap = abs(hue(tones[i]) - hue(tones[i + 1]))
            assert min(gap, 360 - gap) >= 40, f"{name} tone-{i} {tones[i]} and tone-{i + 1} {tones[i + 1]} look alike"


def test_the_palette_has_the_eight_tones_the_toolkit_wraps_to():
    assert charts.TONES == 8 and all(len(t) == 8 for t in palettes().values())
