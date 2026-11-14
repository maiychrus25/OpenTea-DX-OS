# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
import copy
import subprocess
import sys
from pathlib import Path

import pytest

from dxos_cli.manifest import load_manifest, read_core_version, schema_name, validate_manifest

FIXTURES = Path(__file__).parent / "fixtures"
CLI_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture
def valid():
    return load_manifest(FIXTURES / "valid")


def errors(data, core="1.7.0", installed=frozenset()):
    return validate_manifest(data, core, set(installed))


def mutated(valid, **changes):
    data = copy.deepcopy(valid)
    data.update(changes)
    return data


def test_valid_manifest_has_no_errors(valid):
    assert errors(valid, core="1.8.0") == []


def test_rejects_unknown_field(valid):
    errs = errors(mutated(valid, privileged=True), core="1.8.0")
    assert len(errs) == 1 and "privileged" in errs[0]


@pytest.mark.parametrize("bad", ["Tea", "a", "1tea", "tea_tour", "a" * 32])
def test_rejects_bad_id(valid, bad):
    errs = errors(mutated(valid, id=bad), core="1.8.0")
    assert errs and all("id" in e for e in errs)


def test_rejects_installed_id(valid):
    errs = errors(valid, core="1.8.0", installed={"tea-tour"})
    assert len(errs) == 1 and "tea-tour" in errs[0]


def test_rejects_non_osi_license(valid):
    errs = errors(mutated(valid, license="BUSL-1.1"), core="1.8.0")
    assert len(errs) == 1 and "license" in errs[0] and "BUSL-1.1" in errs[0]


def test_rejects_core_too_old(valid):
    errs = errors(mutated(valid, requires={"core": ">=9.0.0"}), core="1.8.0")
    assert len(errs) == 1 and "requires.core" in errs[0]


def test_rejects_unpinned_image(valid):
    runtime = {"image": "ghcr.io/x/y:latest", "port": 8080, "health": "/healthz"}
    errs = errors(mutated(valid, runtime=runtime), core="1.8.0")
    assert errs and any("runtime.image" in e for e in errs)


def test_accepts_digest_pinned_image(valid):
    image = "ghcr.io/x/y@sha256:" + "a" * 64
    runtime = {"image": image, "port": 8080, "health": "/healthz"}
    assert errors(mutated(valid, runtime=runtime), core="1.8.0") == []


@pytest.mark.parametrize("bad", ["/../x", "//x", "/Ab"])
def test_rejects_route_traversal(valid, bad):
    routes = {"protected": {bad: ["manager"]}}
    errs = errors(mutated(valid, routes=routes), core="1.8.0")
    assert errs and any("routes" in e for e in errs)


def test_rejects_menu_path_traversal(valid):
    menu = [{"label": "x", "path": "/../x", "roles": ["manager"]}]
    errs = errors(mutated(valid, menu=menu), core="1.8.0")
    assert errs and any("menu" in e for e in errs)


def test_rejects_unknown_role(valid):
    routes = {"protected": {"/": ["admin"]}}
    errs = errors(mutated(valid, routes=routes), core="1.8.0")
    assert errs and any("admin" in e or "routes" in e for e in errs)


def test_rejects_prefix_both_public_and_protected(valid):
    routes = {"public": ["/public/", "/guide"], "protected": {"/": ["manager"], "/guide": ["farmer"]}}
    errs = errors(mutated(valid, routes=routes), core="1.8.0")
    assert len(errs) == 1 and "routes" in errs[0] and "'/guide'" in errs[0]


def test_rejects_protected_prefix_under_public_prefix(valid):
    # The web proxy treats a path as public by prefix, so a protected path under a public prefix gets no token.
    routes = {"public": ["/"], "protected": {"/admin/": ["manager"]}}
    errs = errors(mutated(valid, routes=routes), core="1.8.0")
    assert len(errs) == 1 and "routes" in errs[0] and "'/admin/'" in errs[0] and "'/'" in errs[0]
    # tea-tour's shape: the protected '/' is the parent of the public prefix, not under it.
    routes = {"public": ["/public/"], "protected": {"/": ["manager"], "/guide": ["farmer"]}}
    assert errors(mutated(valid, routes=routes), core="1.8.0") == []


def test_rejects_ports_field(valid):
    errs = errors(mutated(valid, ports=["8080:8080"]), core="1.8.0")
    assert len(errs) == 1 and "ports" in errs[0]


def test_schema_name_replaces_dashes():
    assert schema_name("tea-tour") == "app_tea_tour"


def test_read_core_version(tmp_path):
    (tmp_path / "apps" / "web").mkdir(parents=True)
    (tmp_path / "apps" / "web" / "package.json").write_text('{"version": "1.7.0"}')
    assert read_core_version(tmp_path) == "1.7.0"


def run_cli(*args):
    return subprocess.run(
        [sys.executable, "-m", "dxos_cli", *args],
        cwd=CLI_DIR, capture_output=True, text=True,
        env={"DXOS_REPO_ROOT": str(CLI_DIR.parents[1]), "PATH": ""},
    )


def test_cli_validate_exit_codes():
    ok = run_cli("validate", str(FIXTURES / "valid"))
    assert ok.returncode == 0, ok.stderr
    bad = run_cli("validate", str(FIXTURES / "invalid"))
    assert bad.returncode == 1 and "ports" in bad.stderr
    missing = run_cli("validate", str(FIXTURES / "nope"))
    assert missing.returncode == 1


def test_cli_manifest_id_prints_only_a_valid_id():
    ok = run_cli("manifest-id", str(FIXTURES / "valid"))
    assert ok.returncode == 0, ok.stderr
    assert ok.stdout == "tea-tour\n"
    bad = run_cli("manifest-id", str(FIXTURES / "invalid"))
    assert bad.returncode == 1 and "ports" in bad.stderr and bad.stdout == ""


def test_accepts_description(valid):
    assert errors(mutated(valid, description="Ứng dụng mẫu."), core="1.8.0") == []


@pytest.mark.parametrize("bad", ["", "a" * 201])
def test_rejects_bad_description(valid, bad):
    errs = errors(mutated(valid, description=bad), core="1.8.0")
    assert errs and any("description" in e for e in errs)


STORE_FULL = {
    "category": "tourism",
    "icon": "leaf",
    "about": "About text",
    "data": ["one"],
    "personal_data": "None",
    "core_reads": ["members"],
    "screenshots": [{"file": "shots/a.png", "caption": "A"}],
}


def with_store(valid, **changes):
    return mutated(valid, store={**STORE_FULL, **changes})


def test_store_block_is_optional(valid):
    assert "store" not in valid and errors(valid, core="1.8.0") == []


def test_store_block_accepts_every_key(valid):
    assert errors(with_store(valid), core="1.8.0") == []


@pytest.mark.parametrize(
    "changes",
    [
        {"extra": 1},
        {"category": "other"},
        {"icon": "rocket"},
        {"about": "a" * 2001},
        {"data": ["x"] * 9},
        {"screenshots": [{"file": "a.png", "caption": "c"}] * 5},
        {"screenshots": [{"file": "../x.png", "caption": "c"}]},
        {"screenshots": [{"file": "/x.png", "caption": "c"}]},
        {"screenshots": [{"file": "x.png"}]},
    ],
)
def test_store_block_refuses(valid, changes):
    assert errors(with_store(valid, **changes), core="1.8.0")


def test_accepts_feed_under_a_protected_prefix(valid):
    assert errors(mutated(valid, feed="/feed"), core="1.8.0") == []


@pytest.mark.parametrize("bad", ["feed", "/a.json", "//x", "/a/../b"])
def test_rejects_malformed_feed(valid, bad):
    errs = errors(mutated(valid, feed=bad), core="1.8.0")
    assert errs and all("feed" in e for e in errs)


def test_rejects_feed_without_a_protected_prefix(valid):
    data = mutated(valid, feed="/feed")
    data["routes"] = {"protected": {"/books/": ["manager"]}}
    errs = errors(data, core="1.8.0")
    assert len(errs) == 1 and "feed" in errs[0]


def test_accepts_feed_covered_by_a_narrow_prefix(valid):
    data = mutated(valid, feed="/books/feed")
    data["routes"] = {"protected": {"/books/": ["manager"]}}
    assert errors(data, core="1.8.0") == []
