# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Deterministic JSON serialization and SHA-256 evidence hashing matching TypeScript web (evidence contract v2)."""
from datetime import datetime, timezone
import hashlib
import json
from typing import Any, Mapping, Sequence


def _reject_non_integer_numbers(value: Any) -> None:
    if isinstance(value, float):
        raise ValueError(f"Non-integer number in evidence: {value!r}")
    if isinstance(value, Mapping):
        for item in value.values():
            _reject_non_integer_numbers(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _reject_non_integer_numbers(item)


def canonical_json(value: Any) -> str:
    """Serialize *value* deterministically matching `apps/web/src/domain/agent/evidence.ts`."""
    _reject_non_integer_numbers(value)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def sha256_hex(text: str) -> str:
    """Return lowercase hexadecimal SHA-256 digest of UTF-8 *text*."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalize_iso_millis(ts: str | datetime | None) -> str | None:
    """Normalize an ISO-8601 timestamp or datetime to `YYYY-MM-DDTHH:MM:SS.mmmZ`; a missing value stays null."""
    if ts is None:
        return None
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


def _row(table: str, row_id: Any, values: dict[str, Any]) -> dict[str, Any]:
    return {"table": table, "id": row_id, "sha256": sha256_hex(canonical_json(values)), "values": values}


def journal_entry_evidence_row(entry: Mapping[str, Any]) -> dict[str, Any]:
    """Build a verifiable `journal_entries` evidence row matching `journalEntryEvidence` in TypeScript."""
    activities = sorted(entry.get("activities") or [], key=lambda item: str(item["id"]))
    values = {
        "id": entry["id"],
        "parcel_id": entry.get("parcel_id"),
        "status": entry["status"],
        "entry_date": normalize_iso_millis(entry["entry_date"]),
        "activity_type": entry["activity_type"],
        "notes": entry.get("notes"),
        "updated_at": normalize_iso_millis(entry.get("updated_at")),
        "activities": [
            {
                "id": item["id"],
                "activity_detail": item.get("activity_detail"),
                "product_name": item.get("product_name"),
                "dosage": item.get("dosage"),
                "withdrawal_days": item.get("withdrawal_days"),
                "safe_harvest_date": normalize_iso_millis(item.get("safe_harvest_date")),
            }
            for item in activities
        ],
    }
    return _row("journal_entries", entry["id"], values)


def crop_cycle_evidence_row(cycle: Mapping[str, Any]) -> dict[str, Any]:
    """Build a verifiable `parcel_crop_cycles` evidence row."""
    values = {
        "id": cycle["id"],
        "parcel_id": cycle.get("parcel_id"),
        "season": cycle.get("season"),
        "sowed_at": normalize_iso_millis(cycle.get("sowed_at")),
        "estimated_harvest_date": normalize_iso_millis(cycle.get("estimated_harvest_date")),
        "harvested_at": normalize_iso_millis(cycle.get("harvested_at")),
    }
    return _row("parcel_crop_cycles", cycle["id"], values)


def build_evidence(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Assemble proposal evidence payload and root SHA-256 digest over source rows."""
    digest_input = [{"table": row["table"], "id": row["id"], "sha256": row["sha256"]} for row in rows]
    return {
        "rows": [dict(row) for row in rows],
        "sha256": sha256_hex(canonical_json(digest_input)),
    }
