# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Cross-language canonical JSON and evidence digest tests matching TypeScript."""
from datetime import datetime, timezone

import pytest

from dxos_agent.evidence import (
    build_evidence,
    canonical_json,
    journal_entry_evidence_row,
    normalize_iso_millis,
    sha256_hex,
)


def test_canonical_json_matches_documented_cross_language_vector():
    # Matches docs/api-contract.md fixed cross-language verification vector.
    payload = {"b": 1, "a": [{"d": "é", "c": None}]}
    serialized = canonical_json(payload)
    assert serialized == '{"a":[{"c":null,"d":"é"}],"b":1}'
    assert sha256_hex(serialized) == "2d39a9eff5fc38971ac13f9187b86e18b6531fd0fe2c17e45a200a5948144ae7"


def test_canonical_json_rejects_nan():
    with pytest.raises(ValueError):
        canonical_json({"bad": float("nan")})


def test_normalize_iso_millis_handles_offsets_and_naive_datetimes():
    assert normalize_iso_millis("2026-11-23T07:00:00+07:00") == "2026-11-23T00:00:00.000Z"
    assert normalize_iso_millis("2026-11-23T00:00:00.123456Z") == "2026-11-23T00:00:00.123Z"
    assert normalize_iso_millis(datetime(2026, 11, 23, 0, 0, 0, tzinfo=timezone.utc)) == "2026-11-23T00:00:00.000Z"


def test_journal_entry_evidence_sorts_activities_and_computes_root_digest():
    entry = {
        "id": "je_1",
        "status": "PENDING_APPROVAL",
        "entry_date": "2026-11-23T00:00:00.000Z",
        "activity_type": "SPRAYING",
        "activities": [
            {"id": "b", "product_name": "B", "dosage": "10 ml", "withdrawal_days": 14},
            {"id": "a", "product_name": "A", "dosage": None, "withdrawal_days": 7},
        ],
    }
    row = journal_entry_evidence_row(entry)
    assert [a["id"] for a in row["values"]["activities"]] == ["a", "b"]
    expected_values = (
        '{"activities":[{"dosage":null,"id":"a","product_name":"A","withdrawal_days":7},'
        '{"dosage":"10 ml","id":"b","product_name":"B","withdrawal_days":14}],'
        '"activity_type":"SPRAYING","entry_date":"2026-11-23T00:00:00.000Z","status":"PENDING_APPROVAL"}'
    )
    assert row["sha256"] == sha256_hex(expected_values)
    evidence = build_evidence([row])
    assert evidence["sha256"] == sha256_hex(
        canonical_json([{"table": "journal_entries", "id": "je_1", "sha256": row["sha256"]}])
    )
