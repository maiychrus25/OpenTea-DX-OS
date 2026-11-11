# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
from pathlib import Path

import pytest

from dxos_cli.compose import render_app_compose
from dxos_cli.manifest import load_manifest

FIXTURES = Path(__file__).parent / "fixtures"
IMAGE = "ghcr.io/opentea/tea-tour@sha256:" + "a" * 64


@pytest.fixture
def manifest():
    return load_manifest(FIXTURES / "valid")


def service(manifest, app_dir="miniapps/tea-tour"):
    return render_app_compose(manifest, Path(app_dir))["services"]["app-tea-tour"]


def test_compose_has_every_hardening_option(manifest):
    svc = service(manifest)
    assert svc["read_only"] is True
    assert svc["tmpfs"] == ["/tmp"]
    assert svc["cap_drop"] == ["ALL"]
    assert svc["security_opt"] == ["no-new-privileges:true"]
    assert svc["mem_limit"] == "256m"
    assert svc["cpus"] == 0.5
    assert svc["user"] == "10001:10001"
    test = svc["healthcheck"]["test"]
    assert test[:3] == ["CMD", "python", "-c"]
    assert "http://127.0.0.1:8080/healthz" in test[3]


def test_compose_has_no_ports_and_only_apps_network(manifest):
    doc = render_app_compose(manifest, Path("miniapps/tea-tour"))
    # An override file: the network is the main file's dxos-apps-net key, never redeclared here.
    assert list(doc) == ["services"]
    assert list(doc["services"]) == ["app-tea-tour"]
    svc = doc["services"]["app-tea-tour"]
    assert "ports" not in svc
    assert svc["networks"] == ["dxos-apps-net"]


def test_compose_paths_resolve_from_docker_dir(manifest):
    # compose resolves relative paths against docker/, the directory of the first -f file.
    svc = service(manifest)
    assert svc["build"] == {"context": "../miniapps/tea-tour"}
    assert svc["env_file"] == ["runtime/apps/tea-tour.env"]
    manifest["runtime"]["build"] = "app/"
    assert service(manifest)["build"] == {"context": "../miniapps/tea-tour/app"}


def test_compose_uses_image_and_skips_env_file_without_database(manifest):
    del manifest["runtime"]["build"], manifest["database"]
    manifest["runtime"]["image"] = IMAGE
    svc = service(manifest)
    assert svc["image"] == IMAGE
    assert "build" not in svc
    assert "env_file" not in svc
