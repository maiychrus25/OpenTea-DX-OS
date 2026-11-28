# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Deterministic JSON serialization and SHA-256 evidence hashing matching TypeScript web (evidence contract v2)."""
from datetime import datetime, timezone
import hashlib
import json
import math
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


def _milli(value: Any) -> int | None:
    """Thousandths of a measurement, floored in IEEE double arithmetic (evidence contract v2); null stays null."""
    if value is None:
        return None
    return math.floor(float(value) * 1000)


def parcel_evidence_row(parcel: Mapping[str, Any]) -> dict[str, Any]:
    """Build a verifiable `parcels` evidence row (contract C2 of the M4 plan)."""
    values = {
        "id": parcel["id"],
        "parcel_code": parcel["parcel_code"],
        "status": parcel["status"],
        "harvest_approved_at": normalize_iso_millis(parcel.get("harvest_approved_at")),
        "updated_at": normalize_iso_millis(parcel.get("updated_at")),
    }
    return _row("parcels", parcel["id"], values)


def disease_report_evidence_row(report: Mapping[str, Any]) -> dict[str, Any]:
    """Build a verifiable `disease_reports` evidence row."""
    values = {
        "id": report["id"],
        "parcel_id": report["parcel_id"],
        "status": report["status"],
        "detection_date": normalize_iso_millis(report.get("detection_date")),
        "ai_disease_name": report.get("ai_disease_name"),
        "confirmed_diagnosis": report.get("confirmed_diagnosis"),
        "updated_at": normalize_iso_millis(report.get("updated_at")),
    }
    return _row("disease_reports", report["id"], values)


def sensor_reading_evidence_row(reading: Mapping[str, Any]) -> dict[str, Any]:
    """Build a `sensor_readings` evidence row; the table has no id column, so the id is parcel|sensor|ts."""
    ts = normalize_iso_millis(reading["ts"])
    row_id = f"{reading['parcel_code']}|{reading['sensor']}|{ts}"
    values = {
        "id": row_id,
        "parcel_code": reading["parcel_code"],
        "sensor": reading["sensor"],
        "ts": ts,
        "value_milli": _milli(reading.get("value")),
    }
    return _row("sensor_readings", row_id, values)


def weather_evidence_row(row: Mapping[str, Any]) -> dict[str, Any]:
    """Build a `weather_cache` evidence row; a null forecast gives two empty arrays."""
    forecast = row.get("forecast_json") or {}
    values = {
        "id": row["id"],
        "parcel_id": row["parcel_id"],
        "recorded_at": normalize_iso_millis(row.get("recorded_at")),
        "precipitation_milli": _milli(row.get("precipitation_mm")),
        "forecast_days": list(forecast.get("time") or []),
        "forecast_precipitation_milli": [_milli(value) for value in forecast.get("precipitation_sum") or []],
    }
    return _row("weather_cache", row["id"], values)


def market_evidence_row(row: Mapping[str, Any]) -> dict[str, Any]:
    """Build a `market_data` evidence row; shared reference data, so it has no cooperative in its values."""
    values = {
        "id": row["id"],
        "source": row["source"],
        "commodity": row["commodity"],
        "metric": row["metric"],
        "value_milli": _milli(row.get("value")),
        "unit": row.get("unit"),
        "period": row.get("period"),
        "fetched_at": normalize_iso_millis(row.get("fetched_at")),
    }
    return _row("market_data", row["id"], values)


def advance_evidence_row(advance: Mapping[str, Any]) -> dict[str, Any]:
    """Build a verifiable `input_advances` evidence row; the money columns are not read, so none is in it."""
    values = {
        "id": advance["id"],
        "household_id": advance["household_id"],
        "item_id": advance["item_id"],
        "quantity_milli": _milli(advance.get("quantity")),
        "advanced_on": str(advance["advanced_on"])[:10],
        "status": advance["status"],
        "settlement_id": advance.get("settlement_id"),
    }
    return _row("input_advances", advance["id"], values)


def ticket_evidence_row(ticket: Mapping[str, Any]) -> dict[str, Any]:
    """Build a verifiable `fresh_leaf_tickets` evidence row; the price columns are not read, so none is in it."""
    values = {
        "id": ticket["id"],
        "household_id": ticket["household_id"],
        "parcel_id": ticket["parcel_id"],
        "cycle_id": ticket.get("cycle_id"),
        "weighed_at": normalize_iso_millis(ticket["weighed_at"]),
        "net_kg_milli": _milli(ticket.get("net_kg")),
        "status": ticket["status"],
    }
    return _row("fresh_leaf_tickets", ticket["id"], values)


def build_evidence(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Assemble proposal evidence payload and root SHA-256 digest over source rows."""
    digest_input = [{"table": row["table"], "id": row["id"], "sha256": row["sha256"]} for row in rows]
    return {
        "rows": [dict(row) for row in rows],
        "sha256": sha256_hex(canonical_json(digest_input)),
    }
