# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Calls to the web's internal Telegram API `/api/internal/telegram/*`, through APISIX on port 9081."""
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Mapping


class GatewayError(Exception):
    """The web or the gateway refused or could not be reached."""


class WebGateway:
    def __init__(
        self,
        gateway_url: str,
        token_provider: Callable[[], str],
        timeout_seconds: float = 15.0,
        urlopen_fn: Callable[..., Any] = urllib.request.urlopen,
    ) -> None:
        self._base = gateway_url.rstrip("/")
        self._token_provider = token_provider
        self._timeout = timeout_seconds
        self._urlopen = urlopen_fn

    def _call(self, method: str, path: str, body: Mapping[str, Any] | None = None) -> Any:
        headers = {"Authorization": f"Bearer {self._token_provider()}", "Content-Type": "application/json"}
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(f"{self._base}{path}", data=data, method=method, headers=headers)
        try:
            with self._urlopen(req, timeout=self._timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise GatewayError(f"{method} {path} answered {exc.code}") from None
        except (urllib.error.URLError, OSError) as exc:
            raise GatewayError(f"{method} {path} unreachable: {type(exc).__name__}") from None
        return payload.get("data")

    def fetch_media(self, build_id: str, name: str) -> bytes:
        """One build file (a screenshot) for an outbox item with photos; the answer is the file, not JSON."""
        query = urllib.parse.urlencode({"build": build_id, "name": name})
        req = urllib.request.Request(
            f"{self._base}/api/internal/telegram/media?{query}",
            headers={"Authorization": f"Bearer {self._token_provider()}"},
        )
        try:
            with self._urlopen(req, timeout=self._timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            raise GatewayError(f"GET media answered {exc.code}") from None
        except (urllib.error.URLError, OSError) as exc:
            raise GatewayError(f"GET media unreachable: {type(exc).__name__}") from None

    def forward_update(self, update: Mapping[str, Any]) -> dict[str, Any]:
        return dict(self._call("POST", "/api/internal/telegram/updates", update) or {})

    def lease_outbox(self, limit: int) -> list[dict[str, Any]]:
        return list(self._call("GET", f"/api/internal/telegram/outbox?limit={limit}") or [])

    def report_result(self, item_id: str, result: Mapping[str, Any]) -> None:
        self._call("POST", f"/api/internal/telegram/outbox/{item_id}/result", result)

    def heartbeat(self, version: str) -> None:
        self._call("POST", "/api/internal/telegram/heartbeat", {"version": version})
