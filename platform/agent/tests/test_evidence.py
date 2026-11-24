# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Cross-language canonical JSON and evidence digest tests matching TypeScript (evidence contract v2)."""
from datetime import datetime, timezone
import json
from pathlib import Path

import pytest

from dxos_agent.evidence import (
    build_evidence,
    canonical_json,
    crop_cycle_evidence_row,
    journal_entry_evidence_row,
    normalize_iso_millis,
    sha256_hex,
)

VECTORS_PATH = Path(__file__).parent / "fixtures" / "evidence-vectors.json"


def test_canonical_json_matches_documented_cross_language_vector():
    # Matches docs/api-contract.md fixed cross-language verification vector.
    payload = {"b": 1, "a": [{"d": "é", "c": None}]}
    serialized = canonical_json(payload)
    assert serialized == '{"a":[{"c":null,"d":"é"}],"b":1}'
    assert sha256_hex(serialized) == "2d39a9eff5fc38971ac13f9187b86e18b6531fd0fe2c17e45a200a5948144ae7"


def test_canonical_json_rejects_nan():
    with pytest.raises(ValueError):
        canonical_json({"bad": float("nan")})


def test_canonical_json_rejects_non_integer_numbers_at_any_depth():
    with pytest.raises(ValueError):
        canonical_json({"a": [{"weight": 1.5}]})
    with pytest.raises(ValueError):
        canonical_json({"whole": 1.0})


def test_normalize_iso_millis_handles_offsets_and_naive_datetimes():
    assert normalize_iso_millis("2026-11-23T07:00:00+07:00") == "2026-11-23T00:00:00.000Z"
    assert normalize_iso_millis("2026-11-23T00:00:00.123456Z") == "2026-11-23T00:00:00.123Z"
    assert normalize_iso_millis(datetime(2026, 11, 23, 0, 0, 0, tzinfo=timezone.utc)) == "2026-11-23T00:00:00.000Z"
    assert normalize_iso_millis(None) is None


def test_evidence_vectors_match_for_every_case():
    vectors = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
    assert vectors["version"] == 2
    for case in vectors["cases"]:
        if case["table"] == "journal_entries":
            row = journal_entry_evidence_row(case["source"])
        elif case["table"] == "parcel_crop_cycles":
            row = crop_cycle_evidence_row(case["source"])
        else:
            raise AssertionError(f"Unknown table in vectors: {case['table']}")
        assert row["values"] == case["values"], case["name"]
        assert canonical_json(row["values"]) == case["canonical"], case["name"]
        assert row["sha256"] == case["sha256"], case["name"]


def test_journal_entry_evidence_sorts_activities_and_computes_root_digest():
    entry = {
        "id": "je_1",
        "parcel_id": "pc_1",
        "status": "PENDING_APPROVAL",
        "entry_date": "2026-11-23T00:00:00.000Z",
        "activity_type": "SPRAYING",
        "notes": None,
        "updated_at": "2026-11-23T01:00:00",
        "activities": [
            {"id": "b", "activity_detail": "B", "product_name": "B", "dosage": "10 ml", "withdrawal_days": 14,
             "safe_harvest_date": None},
            {"id": "a", "activity_detail": "A", "product_name": "A", "dosage": None, "withdrawal_days": 7,
             "safe_harvest_date": None},
        ],
    }
    row = journal_entry_evidence_row(entry)
    assert [a["id"] for a in row["values"]["activities"]] == ["a", "b"]
    assert row["values"]["updated_at"] == "2026-11-23T01:00:00.000Z"
    assert row["sha256"] == sha256_hex(canonical_json(row["values"]))
    evidence = build_evidence([row])
    assert evidence["sha256"] == sha256_hex(
        canonical_json([{"table": "journal_entries", "id": "je_1", "sha256": row["sha256"]}])
    )
