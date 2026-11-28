# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Evidence rows of the cross-check tables must reproduce every case of evidence-vectors-cross-check.json."""
import json
from pathlib import Path

import pytest

from dxos_agent.evidence import advance_evidence_row, canonical_json, ticket_evidence_row

VECTORS_PATH = Path(__file__).parent / "fixtures" / "evidence-vectors-cross-check.json"
BUILDERS = {"input_advances": advance_evidence_row, "fresh_leaf_tickets": ticket_evidence_row}
MONEY_KEYS = {"amount_vnd", "unit_price_vnd", "price_vnd_per_kg"}


def _load_cases() -> list[dict]:
    vectors = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    assert vectors["version"] == 2
    return vectors["cases"]


@pytest.mark.parametrize("case", _load_cases(), ids=lambda case: case["name"])
def test_cross_check_evidence_vector_matches(case):
    row = BUILDERS[case["table"]](case["source"])
    assert row["values"] == case["values"]
    assert canonical_json(row["values"]) == case["canonical"]
    assert row["sha256"] == case["sha256"]
    assert not MONEY_KEYS & set(row["values"])


def test_both_cross_check_tables_have_a_vector():
    assert {case["table"] for case in _load_cases()} == set(BUILDERS)
