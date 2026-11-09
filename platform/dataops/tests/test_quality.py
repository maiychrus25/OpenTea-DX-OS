# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from dxos_dataops.quality import build_quality


def test_quality_per_sensor():
    rows = [("soil_moisture", 10.0), ("soil_moisture", 20.0), ("rainfall", 1.5)]
    assert build_quality(rows, {"out_of_range": 1}) == {
        "rows": 3,
        "sensors": {
            "soil_moisture": {"count": 2, "min": 10.0, "max": 20.0, "avg": 15.0},
            "rainfall": {"count": 1, "min": 1.5, "max": 1.5, "avg": 1.5},
        },
        "rejects": {"out_of_range": 1},
    }
