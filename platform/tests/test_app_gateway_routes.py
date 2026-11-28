# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Pins how the gateway lets the two machine callers into a mini-app (M9, C4): the agent and the apps actor."""
import json
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "platform" / "cli"))

from dxos_cli.gateway import app_routes, render_gateway  # noqa: E402

ACTING = ["X-DXOS-Acting-Sub", "X-DXOS-Acting-Role", "X-DXOS-Acting-Htx"]
MANIFEST = {
    "id": "shop", "runtime": {"port": 8080},
    "routes": {"public": ["/public/"], "protected": {"/": ["manager"], "/agent/": ["manager"]}},
    "agent": {"suggestions": "/agent/suggestions",
              "actions": [{"path": "/agent/actions/promotion-create"}, {"path": "/agent/actions/promotion-end"}]},
}
BASE = (REPO / "platform/gateway/apisix.yaml").read_text(encoding="utf-8")
ROUTES = {r["id"]: r for r in yaml.safe_load(render_gateway(BASE, {"shop": app_routes(MANIFEST, "secret-1")}))["routes"]}
APP = {i: r for i, r in ROUTES.items() if i.startswith("app-shop-")}


def test_every_app_route_is_internal_only():
    assert APP and all(r["vars"] == [["server_port", "==", "9081"]] for r in APP.values())


def test_suggestions_route_takes_the_agent_token_only_and_keeps_the_prefix_rewrite():
    route = APP["app-shop-agent-1"]
    assert route["uri"] == "/apps/shop/agent/suggestions" and route["methods"] == ["GET"]
    oidc = route["plugins"]["openid-connect"]
    assert oidc["claim_schema"] == ROUTES["internal-agent"]["plugins"]["openid-connect"]["claim_schema"]
    assert oidc["claim_schema"]["properties"]["realm_access"]["properties"]["roles"]["contains"] == {"enum": ["agent"]}
    assert route["plugins"]["proxy-rewrite"]["regex_uri"] == ["^/apps/shop(/.*)?$", "$1"]
    assert route["plugins"]["proxy-rewrite"]["headers"] == {"set": {"X-Dxos-App-Gateway": "secret-1"}, "remove": ACTING}


def test_actor_routes_take_only_the_apps_actor_and_keep_the_acting_headers():
    actors = [r for i, r in APP.items() if "-actor-" in i]
    assert [r["uri"] for r in actors] == ["/apps/shop/agent/actions/promotion-create", "/apps/shop/agent/actions/promotion-end"]
    for route in actors:
        schema = route["plugins"]["openid-connect"]["claim_schema"]
        assert route["methods"] == ["POST"]
        assert schema["properties"]["azp"] == {"enum": ["dxos-apps-actor"]}
        assert "realm_access" not in schema["properties"]
        # The acting headers must reach the app, so there is no remove list; only the gateway secret is set.
        assert route["plugins"]["proxy-rewrite"]["headers"] == {"set": {"X-Dxos-App-Gateway": "secret-1"}}
        assert route["plugins"]["proxy-rewrite"]["regex_uri"] == ["^/apps/shop(/.*)?$", "$1"]


def test_every_other_app_route_strips_the_acting_headers():
    others = {i: r for i, r in APP.items() if "-actor-" not in i}
    assert len(others) == 4
    for route_id, route in others.items():
        assert route["plugins"]["proxy-rewrite"]["headers"]["remove"] == ACTING, route_id


def test_user_routes_refuse_the_agent_and_the_actor_cannot_use_them():
    # A protected route needs a manager role the actor token does not carry; the agent role is refused by the claim schema.
    protected = APP["app-shop-protected-1"]["plugins"]["openid-connect"]["claim_schema"]
    assert protected["required"] == ["aud", "realm_access"]
    assert protected["properties"]["realm_access"]["properties"]["roles"]["contains"] == {"enum": ["manager"]}


def test_agent_reads_installed_apps_of_its_cooperative_only():
    tables = REPO / "platform/hasura/metadata/databases/default/tables"
    for name in ("platform_installed_apps", "platform_app_enablements"):
        doc = yaml.safe_load((tables / f"{name}.yaml").read_text(encoding="utf-8"))
        roles = [p["role"] for p in doc["select_permissions"]]
        assert roles == ["agent"]
        assert json.dumps(doc["select_permissions"][0]["permission"]["filter"]).count("X-Hasura-Htx-Code") == 1
    assert "!include platform_installed_apps.yaml" in (tables / "tables.yaml").read_text(encoding="utf-8")
