# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Client credentials of dxos-telegram: read from its env file, exchanged for cached Keycloak tokens."""
import json
import logging
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger("dxos_telegram")


@dataclass(frozen=True)
class ClientCredentials:
    client_id: str
    client_secret: str


def load_credentials(path: Path) -> ClientCredentials:
    """Read DXOS_TELEGRAM_CLIENT_ID and DXOS_TELEGRAM_CLIENT_SECRET from the mode-600 env file written by `./dxos telegram enable`."""
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            values[key.strip()] = val.strip()
    client_id = values.get("DXOS_TELEGRAM_CLIENT_ID", "")
    client_secret = values.get("DXOS_TELEGRAM_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        # The file holds the secret, so only the name is logged.
        raise ValueError(f"incomplete credentials file {path.name}")
    return ClientCredentials(client_id=client_id, client_secret=client_secret)


class KeycloakTokenClient:
    """Fetches Keycloak client_credentials tokens and refreshes them 30 s before expiry."""

    def __init__(
        self,
        keycloak_url: str,
        credentials: ClientCredentials,
        timeout_seconds: float = 10.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._token_url = f"{keycloak_url.rstrip('/')}/protocol/openid-connect/token"
        self._credentials = credentials
        self._timeout = timeout_seconds
        self._clock = clock
        self._token = ""
        self._expires_at = 0.0

    def get_token(self) -> str:
        if self._token and self._expires_at - self._clock() > 30.0:
            return self._token
        form = urllib.parse.urlencode(
            {
                "grant_type": "client_credentials",
                "client_id": self._credentials.client_id,
                "client_secret": self._credentials.client_secret,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            self._token_url,
            data=form,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(req, timeout=self._timeout) as resp:
            payload: dict[str, Any] = json.loads(resp.read().decode("utf-8"))
        token = payload.get("access_token")
        if not token:
            raise RuntimeError("Keycloak token response missing access_token")
        self._token = str(token)
        self._expires_at = self._clock() + float(payload.get("expires_in") or 60)
        return self._token
