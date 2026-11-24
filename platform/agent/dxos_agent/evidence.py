# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Deterministic JSON serialization and SHA-256 evidence hashing matching TypeScript web."""
from datetime import datetime, timezone
import hashlib
import json
from typing import Any, Mapping, Sequence


def canonical_json(value: Any) -> str:
    """Serialize *value* deterministically matching `apps/web/src/domain/agent/evidence.ts`."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def sha256_hex(text: str) -> str:
    """Return lowercase hexadecimal SHA-256 digest of UTF-8 *text*."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalize_iso_millis(ts: str | datetime) -> str:
    """Normalize an ISO-8601 timestamp or datetime to JavaScript `Date.toISOString()` format."""
    if isinstance(ts, datetime):
        dt = ts
    else:
        raw = str(ts).strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def journal_entry_evidence_row(entry: Mapping[str, Any]) -> dict[str, Any]:
    """Build a verifiable evidence row matching `journalEntryEvidence` in TypeScript."""
    activities = sorted(entry.get("activities") or [], key=lambda item: str(item["id"]))
    formatted_activities = [
        {
            "id": item["id"],
            "product_name": item.get("product_name"),
            "dosage": item.get("dosage"),
            "withdrawal_days": item.get("withdrawal_days"),
        }
        for item in activities
    ]
    values = {
        "status": entry["status"],
        "entry_date": normalize_iso_millis(entry["entry_date"]),
        "activity_type": entry["activity_type"],
        "activities": formatted_activities,
    }
    return {
        "table": "journal_entries",
        "id": entry["id"],
        "sha256": sha256_hex(canonical_json(values)),
        "values": values,
    }


def build_evidence(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Assemble proposal evidence payload and root SHA-256 digest over source rows."""
    digest_input = [{"table": row["table"], "id": row["id"], "sha256": row["sha256"]} for row in rows]
    return {
        "rows": [dict(row) for row in rows],
        "sha256": sha256_hex(canonical_json(digest_input)),
    }
