# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Puts the app directory on sys.path so `import htx_dashboard` works from tests/."""
import sys
from pathlib import Path

import pytest

APP_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP_DIR))
sys.path.insert(0, str(APP_DIR / "tests"))


GATEWAY_SECRET = "test-gateway-secret"


@pytest.fixture(autouse=True)
def through_the_gateway(monkeypatch):
    """The tests act as APISIX: the app gets its secret, and every TestClient sends it (a test may drop it)."""
    from fastapi.testclient import TestClient

    monkeypatch.setenv("DXOS_APP_GATEWAY_SECRET", GATEWAY_SECRET)
    original = TestClient.__init__

    def init(self, *args, **kwargs):
        original(self, *args, **kwargs)
        self.headers["X-Dxos-App-Gateway"] = GATEWAY_SECRET

    monkeypatch.setattr(TestClient, "__init__", init)
