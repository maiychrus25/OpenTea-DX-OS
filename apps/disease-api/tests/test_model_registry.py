# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers

import shutil

import pytest
from fastapi.testclient import TestClient

from app import main
from tests.test_model_selection import TEA_VERSION, _post, model_dir, write_registry  # noqa: F401


def _health_with(tmp_path, model_dir, monkeypatch, change):
    copy = tmp_path / "models"
    shutil.copytree(model_dir, copy)
    change(copy)
    monkeypatch.setattr(main, "MODEL_DIR", copy)
    monkeypatch.delenv("TEA_CONFIDENCE_THRESHOLD", raising=False)
    with TestClient(main.app) as client:
        return client.get("/health").json(), _post(client, "?model=tea").status_code, _post(client).status_code


def _tamper(copy):
    with open(copy / "tea_leaf_model.keras", "ab") as handle:
        handle.write(b"tampered")


@pytest.mark.parametrize(
    ("change", "reason"),
    [
        (_tamper, "sha256 mismatch"),
        (lambda copy: write_registry(copy, sha256="0" * 64), "sha256 mismatch"),
        (lambda copy: (copy / "tea" / "registry.json").unlink(), "registry.json missing"),
        (lambda copy: (copy / "tea" / "registry.json").write_text("{not json"), "registry.json unreadable"),
    ],
)
def test_tea_refused_when_the_registry_does_not_match(tmp_path, model_dir, monkeypatch, change, reason):
    health, tea_status, general_status = _health_with(tmp_path, model_dir, monkeypatch, change)
    assert health["models"] == {"general": True, "tea": False}
    assert health["versions"] == {"tea": None}
    assert health["reasons"] == {"tea": reason}
    assert tea_status == 503
    assert general_status == 200  # the general model keeps working


def test_tea_loads_when_the_registry_matches(tmp_path, model_dir, monkeypatch):
    health, tea_status, _ = _health_with(tmp_path, model_dir, monkeypatch, lambda copy: None)
    assert health["versions"] == {"tea": TEA_VERSION}
    assert health["reasons"] == {"tea": None}
    assert tea_status == 200
