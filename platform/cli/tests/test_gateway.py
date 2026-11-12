# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import copy
import os
import shutil
from pathlib import Path

import pytest
import yaml

from dxos_cli import gateway
from dxos_cli.gateway import GatewayError, app_routes, render_gateway, sync_gateway
from dxos_cli.manifest import load_manifest, repo_root

FIXTURES = Path(__file__).parent / "fixtures"
BASE_PATH = repo_root() / "platform" / "gateway" / "apisix.yaml"


@pytest.fixture
def manifest():
    data = load_manifest(FIXTURES / "valid")
    data["routes"]["protected"] = {"/": ["manager"], "/guide": ["farmer"]}
    return data


@pytest.fixture
def base_text():
    return BASE_PATH.read_text(encoding="utf-8")


def by_id(routes):
    return {route["id"]: route for route in routes}


def merged_routes(base_text, fragments):
    return by_id(yaml.safe_load(render_gateway(base_text, fragments))["routes"])


def test_public_route_has_no_auth(manifest):
    route = by_id(app_routes(manifest))["app-tea-tour-public-1"]
    assert route["uri"] == "/apps/tea-tour/public/*"
    assert route["priority"] == 20
    assert route["upstream"] == {"nodes": {"app-tea-tour:8080": 1}}
    assert route["plugins"] == {"proxy-rewrite": {"regex_uri": ["^/apps/tea-tour(/.*)?$", "$1"]}}


def test_protected_route_requires_roles_and_audience(manifest, base_text):
    routes = merged_routes(base_text, {"tea-tour": app_routes(manifest)})
    guide = routes["app-tea-tour-protected-2"]
    assert guide["uri"] == "/apps/tea-tour/guide*"
    assert guide["upstream"] == {"nodes": {"app-tea-tour:8080": 1}}
    assert guide["plugins"]["proxy-rewrite"] == {"regex_uri": ["^/apps/tea-tour(/.*)?$", "$1"]}
    oidc = guide["plugins"]["openid-connect"]
    # The merge key resolved to the base &oidc settings, so the secret stays in one place.
    assert oidc["client_id"] == "dxos-gateway"
    assert oidc["bearer_only"] is True
    schema = oidc["claim_schema"]
    assert schema["required"] == ["aud", "realm_access"]
    base_aud = routes["workflow"]["plugins"]["openid-connect"]["claim_schema"]["properties"]["aud"]
    assert schema["properties"]["aud"] == base_aud
    assert schema["properties"]["realm_access"] == {
        "required": ["roles"],
        "properties": {"roles": {"type": "array", "contains": {"enum": ["farmer"]}}},
    }
    assert render_gateway(base_text, {"tea-tour": app_routes(manifest)}).count("client_secret") == 1


def test_every_app_route_matches_only_the_internal_listener(manifest):
    # 9080 is published to the host; only web's proxy (on 9081) may reach an app (R23).
    routes = app_routes(manifest)
    assert len(routes) == 3
    assert all(route["vars"] == [["server_port", "==", "9081"]] for route in routes)


def test_longer_prefix_has_higher_priority(manifest):
    routes = by_id(app_routes(manifest))
    assert routes["app-tea-tour-protected-1"]["uri"] == "/apps/tea-tour/*"
    assert routes["app-tea-tour-protected-2"]["priority"] > routes["app-tea-tour-protected-1"]["priority"]
    assert routes["app-tea-tour-protected-1"]["priority"] == 11


def test_render_without_apps_equals_base(base_text):
    assert render_gateway(base_text, {}) == base_text
    assert render_gateway(base_text, {"empty": []}) == base_text


def test_render_keeps_end_marker(manifest, base_text):
    out = render_gateway(base_text, {"tea-tour": app_routes(manifest)})
    assert out.endswith("\n#END\n") and out.count("#END") == 1
    assert out.startswith(base_text[: -len("#END\n")])
    assert "&id" not in out


def make_repo(tmp_path):
    (tmp_path / "platform" / "gateway").mkdir(parents=True)
    shutil.copy(BASE_PATH, tmp_path / "platform" / "gateway" / "apisix.yaml")
    return tmp_path


def write_fragment(repo, app_id, routes):
    apps = repo / "docker" / "runtime" / "gateway" / "apps"
    apps.mkdir(parents=True, exist_ok=True)
    (apps / f"{app_id}.yaml").write_text(yaml.safe_dump(routes, sort_keys=False), encoding="utf-8")


def test_sync_writes_in_place(tmp_path, manifest, base_text):
    repo = make_repo(tmp_path)
    target = repo / "docker" / "runtime" / "gateway" / "apisix.yaml"
    sync_gateway(repo)
    assert target.read_text(encoding="utf-8") == base_text
    inode = os.stat(target).st_ino
    write_fragment(repo, "tea-tour", app_routes(manifest))
    sync_gateway(repo)
    assert os.stat(target).st_ino == inode
    assert "app-tea-tour-public-1" in target.read_text(encoding="utf-8")


def test_sync_rebuilds_from_fragments(tmp_path, manifest):
    repo = make_repo(tmp_path)
    other = copy.deepcopy(manifest)
    other["id"] = "hello"
    write_fragment(repo, "tea-tour", app_routes(manifest))
    write_fragment(repo, "hello", app_routes(other))
    sync_gateway(repo)
    text = (repo / "docker" / "runtime" / "gateway" / "apisix.yaml").read_text(encoding="utf-8")
    ids = [route["id"] for route in yaml.safe_load(text)["routes"]]
    assert ids[-6:] == [
        "app-hello-public-1", "app-hello-protected-1", "app-hello-protected-2",
        "app-tea-tour-public-1", "app-tea-tour-protected-1", "app-tea-tour-protected-2",
    ]


def test_sync_never_leaves_old_end_marker_after_partial_write(tmp_path, manifest, monkeypatch):
    repo = make_repo(tmp_path)
    write_fragment(repo, "tea-tour", app_routes(manifest))
    sync_gateway(repo)
    target = repo / "docker" / "runtime" / "gateway" / "apisix.yaml"
    (repo / "docker" / "runtime" / "gateway" / "apps" / "tea-tour.yaml").unlink()
    real_open = open

    class HalfWrite:
        def __init__(self, fh):
            self.fh = fh

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            self.fh.close()

        def truncate(self, *args):
            return self.fh.truncate(*args)

        def write(self, text):
            self.fh.write(text[: len(text) // 2])
            self.fh.flush()
            raise OSError("disk full")

    monkeypatch.setattr(gateway, "open", lambda *a, **k: HalfWrite(real_open(*a, **k)), raising=False)
    with pytest.raises(OSError):
        sync_gateway(repo)
    # APISIX only loads a file ending in #END; a torn write must never end in the previous file's marker.
    assert not target.read_text(encoding="utf-8").endswith("#END\n")


@pytest.mark.parametrize("field,value", [("uri", "/api/data/graphql"), ("uri", "/apps/hello/x*"),
                                         ("id", "data-graphql"), ("id", "app-hello-public-1"),
                                         ("id", "app-tea-tour-x-public-1"), ("vars", None),
                                         ("vars", [["server_port", "==", "9080"]]),
                                         ("vars", [["server_port", "==", "9081"], ["arg_x", "==", "1"]])])
def test_sync_rejects_foreign_fragment_route(tmp_path, manifest, field, value):
    repo = make_repo(tmp_path)
    sync_gateway(repo)
    target = repo / "docker" / "runtime" / "gateway" / "apisix.yaml"
    before = target.read_bytes()
    routes = app_routes(manifest)
    if value is None:
        routes[0].pop(field, None)
    else:
        routes[0][field] = value
    write_fragment(repo, "tea-tour", routes)
    with pytest.raises(GatewayError, match="tea-tour"):
        sync_gateway(repo)
    assert target.read_bytes() == before
