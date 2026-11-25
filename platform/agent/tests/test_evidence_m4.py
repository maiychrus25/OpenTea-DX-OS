# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Evidence rows of the M4 tables must reproduce every case of evidence-vectors-m4.json (contract C2)."""
import json
from pathlib import Path

import pytest

from dxos_agent.evidence import (
    canonical_json,
    disease_report_evidence_row,
    market_evidence_row,
    parcel_evidence_row,
    sensor_reading_evidence_row,
    weather_evidence_row,
)

VECTORS_PATH = Path(__file__).parent / "fixtures" / "evidence-vectors-m4.json"

BUILDERS = {
    "parcels": parcel_evidence_row,
    "disease_reports": disease_report_evidence_row,
    "sensor_readings": sensor_reading_evidence_row,
    "weather_cache": weather_evidence_row,
    "market_data": market_evidence_row,
}


def _load_cases() -> list[dict]:
    vectors = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    assert vectors["version"] == 2
    return vectors["cases"]


@pytest.mark.parametrize("case", _load_cases(), ids=lambda case: case["name"])
def test_m4_evidence_vector_matches(case):
    row = BUILDERS[case["table"]](case["source"])
    assert row["table"] == case["table"]
    assert row["values"] == case["values"]
    assert canonical_json(row["values"]) == case["canonical"]
    assert row["sha256"] == case["sha256"]
    assert row["id"] == case["values"]["id"]


def test_every_m4_table_has_a_vector():
    assert {case["table"] for case in _load_cases()} == set(BUILDERS)
