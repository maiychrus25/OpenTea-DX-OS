# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import pytest

from tea_tour.domain import tour_templates

CATEGORIES = {"PICKING", "CRAFTING", "TASTING", "SIGHTSEEING", "EDUCATION"}


def test_four_templates_with_the_titles_of_the_spec():
    assert set(tour_templates.TEMPLATES) == {"picking", "crafting", "sunrise", "classroom"}
    titles = {t.title for t in tour_templates.TEMPLATES.values()}
    assert titles == {"Một ngày làm người hái chè", "Sao chè thủ công và thưởng trà", "Bình minh trên đồi chè",
                      "Lớp học trên đồi chè"}
    durations = {k: t.duration_minutes for k, t in tour_templates.TEMPLATES.items()}
    assert durations == {"picking": 240, "crafting": 180, "sunrise": 150, "classroom": 210}
    categories = {k: t.category for k, t in tour_templates.TEMPLATES.items()}
    assert categories == {"picking": "PICKING", "crafting": "CRAFTING", "sunrise": "SIGHTSEEING",
                          "classroom": "EDUCATION"}


@pytest.mark.parametrize("key", sorted(tour_templates.TEMPLATES))
def test_every_template_is_within_the_limits_of_spec_section_8(key):
    t = tour_templates.TEMPLATES[key]
    assert t.category in CATEGORIES and 30 <= t.duration_minutes <= 2880
    assert 1 <= len(t.title) <= 120 and 1 <= len(t.summary) <= 200 and 1 <= len(t.description) <= 4000
    assert 4 <= len(t.itinerary) <= 6
    for item in t.itinerary:
        assert set(item) == {"time", "title", "detail"}
        assert 1 <= len(item["time"]) <= 20 and 1 <= len(item["title"]) <= 80 and len(item["detail"]) <= 300
    for lines in (t.includes, t.excludes, t.bring):
        assert 1 <= len(lines) <= 10 and all(1 <= len(line) <= 120 for line in lines)
    assert len(t.faq) == 3
    for item in t.faq:
        assert set(item) == {"q", "a"} and 1 <= len(item["q"]) <= 160 and 1 <= len(item["a"]) <= 500
    assert t.price_adult_vnd > 0 and 0 <= t.price_child_vnd <= t.price_adult_vnd and 1 <= t.default_seats <= 200
