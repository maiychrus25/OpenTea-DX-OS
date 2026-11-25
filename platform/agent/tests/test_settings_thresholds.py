# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Per-agent thresholds from the web settings (contract C1 of M3): defaults fill in missing or wrongly typed keys."""
from dxos_agent.settings import AgentSettings

FIELD_WATCH_DEFAULTS = {
    "silent_hours": 6,
    "dry_soil_pct": 35,
    "heat_c": 35,
    "frost_c": 4,
    "heavy_rain_mm": 15,
    "spray_lookback_days": 2,
    "forecast_days": 2,
    "fresh_reading_hours": 2,
}


def test_missing_agent_gets_every_default():
    assert AgentSettings().thresholds_for("field-watch") == FIELD_WATCH_DEFAULTS


def test_web_values_override_defaults_and_wrong_types_fall_back():
    settings = AgentSettings.from_payload(
        {
            "agents": {
                "field-watch": {
                    "provider": "ollama",
                    "model": None,
                    "thresholds": {"heat_c": 38, "frost_c": "2", "dry_soil_pct": True, "unknown_key": 9},
                }
            }
        }
    )
    thresholds = settings.thresholds_for("field-watch")
    assert thresholds["heat_c"] == 38
    assert thresholds["frost_c"] == FIELD_WATCH_DEFAULTS["frost_c"]
    assert thresholds["dry_soil_pct"] == FIELD_WATCH_DEFAULTS["dry_soil_pct"]
    assert "unknown_key" not in thresholds
    assert thresholds["silent_hours"] == FIELD_WATCH_DEFAULTS["silent_hours"]


def test_bulletin_commodity_is_a_string_and_defaults_to_tea():
    settings = AgentSettings.from_payload({"agents": {"bulletin": {"thresholds": {"commodity": "  "}}}})
    assert settings.thresholds_for("bulletin") == {"commodity": "Tea", "market_hours": 48}
