# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The relay fetches a build's screenshots from the web's media route with its own token."""
import io
import urllib.error

import pytest

from dxos_telegram.gateway import GatewayError, WebGateway


class Body(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_fetch_media_gets_the_file_bytes_with_the_bearer_token():
    seen = []

    def opener(req, timeout):
        seen.append((req.full_url, req.get_header("Authorization")))
        return Body(b"\x89PNG")

    web = WebGateway("http://apisix:9081/", lambda: "tok", urlopen_fn=opener)
    assert web.fetch_media("b-1", "mobile dark.png") == b"\x89PNG"
    assert seen == [("http://apisix:9081/api/internal/telegram/media?build=b-1&name=mobile+dark.png", "Bearer tok")]


def test_fetch_media_failure_is_a_gateway_error_without_the_token():
    def refuse(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 404, "x", {}, io.BytesIO(b"{}"))

    with pytest.raises(GatewayError) as info:
        WebGateway("http://apisix:9081", lambda: "secret", urlopen_fn=refuse).fetch_media("b", "n.png")
    assert "404" in str(info.value) and "secret" not in str(info.value)
