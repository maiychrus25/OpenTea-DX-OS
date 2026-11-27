# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Pins the Hasura `agent` role: read-only, limited to its cooperative, no personal columns (spec §5.2, plan C7)."""
import json
from pathlib import Path

import yaml

TABLES = Path(__file__).resolve().parents[2] / "platform/hasura/metadata/databases/default/tables"
COOPERATIVE_FILTER = {"_and": [{"htx_code": {"_eq": "X-Hasura-Htx-Code"}}, {"htx_code": {"_neq": ""}}]}
PARCEL_FILTER = {"parcel": {"household": {"htx_profile": COOPERATIVE_FILTER}}}
PERSONAL_COLUMNS = {
    "photo_url", "photo_minio_key", "gps_lat", "gps_lng", "treatment_notes", "detected_by_id",
    "phone", "name", "address", "performed_by", "keycloak_user_id",
}
# Columns C7 adds for the field, disease, harvest and bulletin agents, keyed by "schema.table".
EXPECTED_COLUMNS = {
    "telemetry.sensor_readings": {"parcel_code", "sensor", "ts", "value"},
    "weather_cache": {"id", "parcel_id", "recorded_at", "precipitation_mm", "forecast_json"},
    "market_data": {"id", "source", "commodity", "metric", "value", "unit", "period", "fetched_at"},
    "disease_reports": {
        "id", "parcel_id", "household_id", "status", "detection_date", "created_at", "updated_at",
        "ai_disease_name", "confirmed_diagnosis",
    },
    "journal_entries": {
        "id", "parcel_id", "cycle_id", "entry_date", "activity_type", "submitted_role", "status",
        "approved_at", "review_note", "notes", "weather_condition", "weather_temperature",
        "weather_precipitation", "weather_humidity", "created_at", "updated_at",
    },
    "journal_activities": {
        "id", "journal_entry_id", "pesticide_product_id", "activity_detail", "product_name", "dosage",
        "withdrawal_days", "safe_harvest_date", "created_at",
    },
}
# Aggregate view with no personal column, so the agent may read all of its columns.
ALL_COLUMNS = {"telemetry.sensor_daily"}


def agent_permissions():
    found = {}
    for path in sorted(TABLES.glob("*.yaml")):
        doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(doc, dict):  # tables.yaml is the include list
            continue
        for perm in doc.get("select_permissions", []):
            if perm["role"] == "agent":
                found[f"{doc['table']['schema']}.{doc['table']['name']}"] = perm["permission"]
    return found


def public_name(key):
    return key.removeprefix("public.")


def test_no_agent_permission_exposes_personal_columns():
    for key, perm in agent_permissions().items():
        if perm["columns"] == "*":
            assert key in ALL_COLUMNS, f"{key} exposes every column to the agent"
            continue
        assert not PERSONAL_COLUMNS & set(perm["columns"]), key


def test_agent_reads_stay_in_its_cooperative():
    for key, perm in agent_permissions().items():
        if key == "public.market_data":
            assert perm["filter"] == {}, "market data is shared reference data"
        else:
            assert json.dumps(perm["filter"]).count("X-Hasura-Htx-Code") >= 1, key


def test_field_disease_harvest_and_bulletin_reads_match_the_contract():
    permissions = agent_permissions()
    for key, columns in EXPECTED_COLUMNS.items():
        perm_key = key if "." in key else f"public.{key}"
        assert set(permissions[perm_key]["columns"]) == columns, key
    assert permissions["telemetry.sensor_daily"]["columns"] == "*"
    assert permissions["public.weather_cache"]["filter"] == PARCEL_FILTER
    assert permissions["telemetry.sensor_readings"]["filter"] == COOPERATIVE_FILTER
    assert permissions["telemetry.sensor_daily"]["filter"] == COOPERATIVE_FILTER
