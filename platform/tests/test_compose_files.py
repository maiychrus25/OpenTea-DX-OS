# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Static checks of the gateway and compose files, for settings the smoke test only sees on a running stack."""
import os
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
GATEWAY = ROOT / "platform" / "gateway" / "apisix.yaml"
COMPOSE = ROOT / "docker" / "docker-compose.yml"
RELEASE = ROOT / "docker" / "docker-compose.release.yml"


class ComposeLoader(yaml.SafeLoader):
    """Compose override files use !reset tags, which plain YAML does not know."""


ComposeLoader.add_multi_constructor("!", lambda loader, suffix, node: None)


def load_compose(path):
    return yaml.load(path.read_text(encoding="utf-8"), Loader=ComposeLoader)["services"]


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


@pytest.mark.parametrize("service", ["web", "apisix"])
def test_release_refuses_empty_or_dev_gateway_secret(service):
    svc = load_compose(RELEASE)[service]
    assert svc["environment"]["DXOS_INTERNAL_GATEWAY_SECRET"].startswith("${DXOS_INTERNAL_GATEWAY_SECRET:?")
    # Compose escapes $ as $$; the wrapper's exec is swapped for echo so the test can see the decision.
    script = svc["entrypoint"][2].replace("$$", "$").replace("exec ", "echo started ")
    env = {"PATH": os.environ["PATH"]}
    refused = subprocess.run(["/bin/sh", "-c", script, "sh", "true"], capture_output=True, text=True,
                             env={**env, "DXOS_INTERNAL_GATEWAY_SECRET": "dev-internal-gateway-secret"})
    assert refused.returncode == 1 and "Refusing to start" in refused.stderr and "started" not in refused.stdout
    started = subprocess.run(["/bin/sh", "-c", script, "sh", "true"], capture_output=True, text=True,
                             env={**env, "DXOS_INTERNAL_GATEWAY_SECRET": "long-random-value"})
    assert started.returncode == 0 and "started" in started.stdout


@pytest.mark.parametrize("service", ["dxos-agent", "dxos-telegram"])
def test_agent_containers_are_hardened(service):
    svc = load_compose(COMPOSE)[service]
    assert svc["read_only"] is True
    assert svc["tmpfs"] == ["/tmp:size=16m"]
    assert svc["cap_drop"] == ["ALL"]
    assert svc["security_opt"] == ["no-new-privileges:true"]
    assert svc["pids_limit"] == 64
    assert svc["cpus"] == "0.5"
    # The healthcheck heartbeat lives in /tmp, which stays writable through the tmpfs.
    assert f"/tmp/{service}.heartbeat" in svc["healthcheck"]["test"][3]
