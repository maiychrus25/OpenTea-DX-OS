# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Claim của người dùng, đọc từ access token mà gateway đã kiểm (spec §6.1)."""
import base64
import json
from dataclasses import dataclass

ROLES = ("farmer", "officer", "manager")


@dataclass(frozen=True)
class Claims:
    sub: str
    name: str
    htx_code: str
    roles: tuple[str, ...]


def read_claims(authorization: str | None) -> Claims | None:
    # No signature check: only APISIX reaches this container, after it verified the token (trust boundary, spec §6.2).
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        payload = authorization.removeprefix("Bearer ").split(".")[1]
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("sub"), str) or not data["sub"]:
        return None
    access = data.get("realm_access")
    roles = access.get("roles") if isinstance(access, dict) else None
    htx_code = data.get("htx_code")
    return Claims(
        sub=data["sub"],
        name=str(data.get("name") or data.get("preferred_username") or ""),
        htx_code=htx_code if isinstance(htx_code, str) else "",
        # An odd claim means no roles, never a crash.
        roles=tuple(r for r in ROLES if r in roles) if isinstance(roles, list) else (),
    )
