# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""The core's internal API for mini-apps (S8). The user's own bearer token is forwarded as it came in; the core
verifies it again. Standard library only. Errors: CoreRefused for a 4xx the core answered, CoreUnavailable otherwise."""
import json
import os
import urllib.error
import urllib.request

CORE_URL = os.environ.get("DXOS_CORE_INTERNAL_URL", "http://apisix:9081")
TIMEOUT_S = 5
BASE = "/api/internal/apps/sales"


class CoreRefused(Exception):
    def __init__(self, code: str, body: dict):
        super().__init__(code)
        self.code, self.body = code, body


class CoreUnavailable(Exception):
    pass


def _call(authorization: str | None, method: str, path: str, payload: dict | None = None):
    request = urllib.request.Request(
        CORE_URL + path, method=method, data=None if payload is None else json.dumps(payload).encode(),
        headers={"Authorization": authorization or "", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return json.load(response)
    except urllib.error.HTTPError as err:
        with err:  # closes the response body
            if err.code >= 500:
                raise CoreUnavailable(str(err.code)) from err
            try:
                body = json.load(err)
            except ValueError:
                body = None
        body = body if isinstance(body, dict) else {}
        error = body.get("error")
        raise CoreRefused(error.get("code", str(err.code)) if isinstance(error, dict) else str(err.code), body) from err
    except (OSError, ValueError) as err:  # URLError, timeouts, a body that is not JSON
        raise CoreUnavailable(str(err)) from err


def sellable_lots(authorization: str | None) -> list[dict]:
    lots = _call(authorization, "GET", f"{BASE}/sellable-lots")
    if not isinstance(lots, list):
        raise CoreUnavailable("unexpected answer")
    return lots


def confirm_retail(authorization: str | None, external_ref: str, lines: list[dict], customer_name: str | None) -> dict:
    """Write a retail order into the core's sales book; sending the same external_ref again answers the same order."""
    order = _call(authorization, "POST", f"{BASE}/retail-orders",
                  {"external_ref": external_ref, "customer_name": customer_name, "lines": lines})
    if not isinstance(order, dict) or not order.get("order_no"):
        raise CoreUnavailable("unexpected answer")
    return order


def cancel_retail(authorization: str | None, external_ref: str) -> None:
    """Give the lot stock back. An order the core does not know has drawn nothing, so a 404 counts as done."""
    try:
        _call(authorization, "POST", f"{BASE}/retail-orders/{external_ref}/cancel", {})
    except CoreRefused as err:
        if err.code not in ("NOT_FOUND", "404"):
            raise
