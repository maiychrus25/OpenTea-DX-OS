# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Calls to the web's internal Zalo API `/api/internal/zalo/*`, through APISIX on port 9081."""
import json
import urllib.error
import urllib.request
from typing import Any, Callable, Mapping, Optional


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
        try:
            headers = {"Authorization": f"Bearer {self._token_provider()}", "Content-Type": "application/json"}
            data = json.dumps(body).encode("utf-8") if body is not None else None
            req = urllib.request.Request(f"{self._base}{path}", data=data, method=method, headers=headers)
            with self._urlopen(req, timeout=self._timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            exc.close()
            raise GatewayError(f"{method} {path} answered {exc.code}") from None
        except (urllib.error.URLError, OSError, ValueError, RuntimeError) as exc:
            raise GatewayError(f"{method} {path} unreachable: {type(exc).__name__}") from None
        return payload.get("data")

    def lease_outbox(self, limit: int) -> list[dict[str, Any]]:
        return list(self._call("GET", f"/api/internal/zalo/outbox?limit={limit}") or [])

    def report_result(self, item_id: str, result: Mapping[str, Any]) -> None:
        self._call("POST", f"/api/internal/zalo/outbox/{item_id}/result", result)

    def tick(self) -> int:
        return int((self._call("POST", "/api/internal/zalo/tick", {}) or {}).get("queued", 0))

    def heartbeat(self, version: str) -> None:
        self._call("POST", "/api/internal/zalo/heartbeat", {"version": version})

    def get_credentials(self) -> Optional[dict[str, Any]]:
        """The OA tokens, or None while the platform admin has not entered them (the relay then idles)."""
        data = self._call("GET", "/api/internal/zalo/credentials")
        return dict(data) if data else None

    def save_credentials(self, credentials: Mapping[str, Any]) -> None:
        self._call("POST", "/api/internal/zalo/credentials", credentials)
