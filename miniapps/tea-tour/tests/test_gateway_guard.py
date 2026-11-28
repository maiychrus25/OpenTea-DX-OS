# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The app trusts only requests that came through APISIX, which sets X-Dxos-App-Gateway (appkit.require_gateway)."""
from fastapi.testclient import TestClient

from tea_tour import main


def direct():
    client = TestClient(main.app, root_path=main.app.root_path, raise_server_exceptions=False)
    client.headers.pop("X-Dxos-App-Gateway")  # what a container on dxos-apps-net sends
    return client


def test_a_direct_call_without_the_gateway_header_is_refused():
    client = direct()
    assert client.get("/healthz").status_code == 200  # the Docker healthcheck
    for path in ("/", "/public/", "/nope"):
        assert client.get(path).status_code == 403, path
    assert client.post("/public/", headers={"X-Dxos-App-Gateway": "wrong"}).status_code == 403
