# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Static checks of the gateway and compose files, for settings the smoke test only sees on a running stack."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
GATEWAY = ROOT / "platform" / "gateway" / "apisix.yaml"


def load_routes():
    return {route["id"]: route for route in yaml.safe_load(GATEWAY.read_text(encoding="utf-8"))["routes"]}


def test_user_routes_refuse_agent_tokens():
    routes = load_routes()
    for route_id in ("workflow", "disease", "llm-chat"):
        schema = routes[route_id]["plugins"]["openid-connect"]["claim_schema"]
        assert schema["properties"]["realm_access"]["properties"]["roles"] == {
            "not": {"contains": {"enum": ["agent"]}}
        }, route_id


def test_llm_chat_stays_reachable_on_the_internal_port():
    # The web chatbot calls it through CORE_GATEWAY_URL (apisix:9081), so it must not be limited to 9080.
    assert "vars" not in load_routes()["llm-chat"]


def test_internal_agent_route_has_its_own_budget_per_token():
    limit = load_routes()["internal-agent"]["plugins"]["limit-count"]
    assert limit == {
        "count": 120,
        "time_window": 60,
        "key_type": "var_combination",
        "key": "$http_authorization",
        "rejected_code": 429,
    }
