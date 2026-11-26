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


def load_document(path):
    return yaml.load(path.read_text(encoding="utf-8"), Loader=ComposeLoader)


def load_compose(path):
    return load_document(path)["services"]


def load_routes():
    return {route["id"]: route for route in yaml.safe_load(GATEWAY.read_text(encoding="utf-8"))["routes"]}


def test_user_routes_refuse_agent_telegram_and_staff_tokens():
    routes = load_routes()
    for route_id in ("workflow", "disease", "llm-chat"):
        schema = routes[route_id]["plugins"]["openid-connect"]["claim_schema"]
        assert schema["properties"]["realm_access"]["properties"]["roles"] == {
            "not": {"contains": {"enum": ["agent", "telegram", "staff-sync"]}}
        }, route_id


def test_staff_route_needs_a_staff_client_with_the_role_and_a_cooperative_on_the_internal_port():
    route = load_routes()["internal-staff"]
    assert route["uri"] == "/api/internal/staff/*"
    assert route["vars"] == [["server_port", "==", "9081"]]
    schema = route["plugins"]["openid-connect"]["claim_schema"]
    assert "htx_code" in schema["required"]
    assert schema["properties"]["azp"]["pattern"] == "^dxos-staff-[a-z0-9_-]{1,20}$"
    assert schema["properties"]["realm_access"]["properties"]["roles"]["contains"] == {"enum": ["staff-sync"]}
    assert schema["properties"]["htx_code"]["pattern"] == "^[A-Z0-9_-]{1,20}$"
    assert route["plugins"]["limit-count"]["key"] == "$http_authorization"
    assert "X-Dxos-Gateway" in route["plugins"]["proxy-rewrite"]["headers"]["set"]


def test_agent_and_telegram_tokens_cannot_use_the_staff_route():
    routes = load_routes()
    staff = routes["internal-staff"]["plugins"]["openid-connect"]["claim_schema"]["properties"]
    agent = routes["internal-agent"]["plugins"]["openid-connect"]["claim_schema"]["properties"]
    assert staff["azp"]["pattern"] != agent["azp"]["pattern"]
    assert staff["realm_access"]["properties"]["roles"]["contains"] != agent["realm_access"]["properties"]["roles"]["contains"]


def test_telegram_route_needs_the_relay_client_and_role_on_the_internal_port():
    route = load_routes()["internal-telegram"]
    assert route["uri"] == "/api/internal/telegram/*"
    assert route["vars"] == [["server_port", "==", "9081"]]
    schema = route["plugins"]["openid-connect"]["claim_schema"]
    assert schema["properties"]["azp"] == {"enum": ["dxos-telegram"]}
    assert schema["properties"]["realm_access"]["properties"]["roles"]["contains"] == {"enum": ["telegram"]}
    assert route["plugins"]["limit-count"]["key"] == "$http_authorization"
    assert "X-Dxos-Gateway" in route["plugins"]["proxy-rewrite"]["headers"]["set"]


def test_agent_route_refuses_telegram_tokens_by_claims():
    # The agent route requires htx_code and the agent role; a relay token has neither.
    schema = load_routes()["internal-agent"]["plugins"]["openid-connect"]["claim_schema"]
    assert "htx_code" in schema["required"]


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


def run_release_wrapper(service, **secrets):
    svc = load_compose(RELEASE)[service]
    # Compose escapes $ as $$; the wrapper's exec is swapped for echo so the test can see the decision.
    script = svc["entrypoint"][2].replace("$$", "$").replace("exec ", "echo started ")
    env = {"PATH": os.environ["PATH"], "DXOS_TELEGRAM_CALLBACK_KEY": "long-random-value", **secrets}
    return subprocess.run(["/bin/sh", "-c", script, "sh", "true"], capture_output=True, text=True, env=env)


@pytest.mark.parametrize("service", ["web", "apisix"])
def test_release_refuses_empty_or_dev_gateway_secret(service):
    svc = load_compose(RELEASE)[service]
    assert svc["environment"]["DXOS_INTERNAL_GATEWAY_SECRET"].startswith("${DXOS_INTERNAL_GATEWAY_SECRET:?")
    refused = run_release_wrapper(service, DXOS_INTERNAL_GATEWAY_SECRET="dev-internal-gateway-secret")
    assert refused.returncode == 1 and "Refusing to start" in refused.stderr and "started" not in refused.stdout
    started = run_release_wrapper(service, DXOS_INTERNAL_GATEWAY_SECRET="long-random-value")
    assert started.returncode == 0 and "started" in started.stdout


@pytest.mark.parametrize("value", ["dev-telegram-callback-key", ""])
def test_release_web_refuses_the_dev_or_empty_telegram_callback_key(value):
    svc = load_compose(RELEASE)["web"]
    assert svc["environment"]["DXOS_TELEGRAM_CALLBACK_KEY"].startswith("${DXOS_TELEGRAM_CALLBACK_KEY:?")
    refused = run_release_wrapper("web", DXOS_INTERNAL_GATEWAY_SECRET="long-random-value", DXOS_TELEGRAM_CALLBACK_KEY=value)
    assert refused.returncode == 1 and "DXOS_TELEGRAM_CALLBACK_KEY" in refused.stderr and "started" not in refused.stdout


def test_telegram_credentials_are_separate_volumes_mounted_read_only():
    doc = load_document(COMPOSE)
    services, volumes = doc["services"], doc["volumes"]
    assert "dxos-telegram-env:/run/dxos-telegram:ro" in services["dxos-telegram"]["volumes"]
    assert "dxos-web-env:/run/dxos-web:ro" in services["web"]["volumes"]
    helper = services["dxos-telegram-env"]
    assert helper["profiles"] == ["tools"] and helper["user"] == "0:0" and helper["network_mode"] == "none"
    assert helper["volumes"] == ["dxos-telegram-env:/run/dxos-telegram", "dxos-web-env:/run/dxos-web"]
    assert {"dxos-telegram-env", "dxos-web-env"} <= set(volumes)


def test_telegram_stub_is_test_only_and_loopback_published():
    stub = load_compose(COMPOSE)["dxos-telegram-stub"]
    assert stub["profiles"] == ["telegram-test"]
    assert stub["ports"] == ["127.0.0.1:8081:8081"]
    assert "dxos-telegram-stub" not in load_compose(RELEASE)


def test_relay_token_is_passed_from_the_operator_environment_only():
    env = load_compose(COMPOSE)["dxos-telegram"]["environment"]
    assert env["TELEGRAM_BOT_TOKEN"] == "${TELEGRAM_BOT_TOKEN:-}"
    assert env["DXOS_GATEWAY_URL"] == "http://apisix:9081"


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


def test_every_init_script_is_mounted_into_fresh_databases():
    # Postgres runs only what is mounted in docker-entrypoint-initdb.d; platform-init applies the whole directory.
    init = sorted(path.name for path in (ROOT / "platform" / "postgres" / "init").glob("*.sql"))
    mounts = load_compose(COMPOSE)["postgres"]["volumes"]
    for name in init:
        assert f"../platform/postgres/init/{name}:/docker-entrypoint-initdb.d/{name}" in mounts, name


def test_agent_credentials_live_in_a_named_volume_written_by_a_root_helper():
    doc = load_document(COMPOSE)
    assert "dxos-agent-env:/run/dxos-agent:ro" in doc["services"]["dxos-agent"]["volumes"]
    helper = doc["services"]["dxos-agent-env"]
    assert helper["profiles"] == ["tools"] and helper["user"] == "0:0" and helper["network_mode"] == "none"
    assert helper["volumes"] == ["dxos-agent-env:/run/dxos-agent"]
    assert "dxos-agent-env" in doc["volumes"]


def test_release_pulls_the_telegram_helper_from_the_registry():
    helper = load_compose(RELEASE)["dxos-telegram-env"]
    assert helper["image"].startswith("${OPENTEA_IMAGE_PREFIX:-ghcr.io/maiychrus25/opentea-dx-os}-telegram:")
    assert helper["build"] is None


def test_release_pulls_the_agent_helper_from_the_registry():
    helper = load_compose(RELEASE)["dxos-agent-env"]
    assert helper["image"].startswith("${OPENTEA_IMAGE_PREFIX:-ghcr.io/maiychrus25/opentea-dx-os}-agent:")
    assert helper["build"] is None


def test_llm_stub_is_test_only_loopback_published_and_hardened():
    stub = load_compose(COMPOSE)["llm-test-stub"]
    assert stub["profiles"] == ["llm-test"]
    assert stub["ports"] == ["127.0.0.1:8082:8082"]
    assert stub["read_only"] is True and stub["cap_drop"] == ["ALL"]
    assert stub["volumes"] == ["../platform/tests/stub_llm.py:/app/stub_llm.py:ro"]
    assert "llm-test-stub" not in load_compose(RELEASE)


PROVIDER_KEYS = ("ANTHROPIC_API_KEY", "OPENAI_API_KEY")


def environment_of(svc):
    env = svc.get("environment") or {}
    if isinstance(env, list):
        return dict(item.split("=", 1) if "=" in item else (item, None) for item in env)
    return env


def test_provider_keys_reach_only_the_agent_container():
    services = load_compose(COMPOSE)
    agent_env = environment_of(services["dxos-agent"])
    assert agent_env["ANTHROPIC_API_KEY"] == "${ANTHROPIC_API_KEY:-}"
    assert agent_env["OPENAI_API_KEY"] == "${OPENAI_API_KEY:-}"
    for name, svc in services.items():
        if name == "dxos-agent":
            continue
        env = environment_of(svc)
        for key in PROVIDER_KEYS:
            assert env.get(key) in (None, ""), (name, key)  # no service gets a real key from its environment
        if svc.get("env_file"):  # env_file loads .env.local, which may hold the keys: blank them here
            for key in PROVIDER_KEYS:
                assert key in env, (name, key)


def test_env_example_lists_the_provider_keys_empty():
    lines = (ROOT / "docker" / ".env.local.example").read_text(encoding="utf-8").splitlines()
    assert "ANTHROPIC_API_KEY=" in lines and "OPENAI_API_KEY=" in lines


def test_campaign_items_follow_their_proposal_on_delete():
    # The earlier smokes delete their proposals at cleanup; A9 may have put them in a campaign by then (M7 CI).
    import re
    sources = [
        ROOT / "platform/postgres/init/08-agent.sql",
        ROOT / "apps/web/prisma/migrations/20261126180000_daily_campaigns/migration.sql",
    ]
    for path in sources:
        text = path.read_text(encoding="utf-8")
        assert re.search(r"proposal_id\s+uuid\s+NOT NULL REFERENCES platform\.agent_proposals\(id\) ON DELETE CASCADE", text), path


def test_mcp_route_takes_only_the_bridge_client_and_no_agent_or_relay_role():
    route = load_routes()["mcp"]
    assert route["uri"] == "/api/mcp/*"
    assert route["upstream_id"] == "web"
    assert route["methods"] == ["GET", "POST"]
    schema = route["plugins"]["openid-connect"]["claim_schema"]
    assert schema["properties"]["azp"] == {"enum": ["dxos-mcp"]}
    assert schema["properties"]["aud"]["anyOf"][0] == {"enum": ["dx-os-core"]}
    assert schema["properties"]["realm_access"]["properties"]["roles"] == {
        "not": {"contains": {"enum": ["agent", "telegram"]}}
    }


def test_mcp_route_is_on_the_public_port():
    # Like the other user routes it has no server_port filter, so the browser-facing port serves it.
    assert "vars" not in load_routes()["mcp"]


def test_mcp_client_target_creates_the_device_grant_client_idempotently():
    text = (ROOT / "Makefile").read_text(encoding="utf-8")
    target = text[text.index("\nmcp-client:") :]
    assert "clientId=dxos-mcp" in target and "clients -r agrimarket" in target
    assert 'oauth2.device.authorization.grant.enabled\\"=true' in target
    assert "dxos-mcp updated" in target and "dxos-mcp created" in target
