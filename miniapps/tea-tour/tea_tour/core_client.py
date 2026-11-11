# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Nông hộ của HTX lấy từ lõi qua gateway, bằng token của chính người dùng (spec §7)."""
import json
import urllib.error
import urllib.request
from dataclasses import dataclass

# The only core service the app's network reaches; Hasura filters households by the token's htx_code.
GRAPHQL_URL = "http://apisix:9081/api/data/graphql"
QUERY = "query { households(order_by: { name: asc }) { id name keycloak_user_id } }"
TIMEOUT_S = 5


class CoreError(Exception):
    pass


@dataclass(frozen=True)
class Household:
    id: str
    name: str
    keycloak_user_id: str | None


def list_households(authorization: str) -> list[Household]:
    request = urllib.request.Request(
        GRAPHQL_URL, data=json.dumps({"query": QUERY}).encode(), method="POST",
        headers={"Authorization": authorization, "Content-Type": "application/json", "x-hasura-role": "manager"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as reply:
            rows = json.loads(reply.read())["data"]["households"]
        return [Household(id=str(row["id"]), name=str(row["name"]), keycloak_user_id=row.get("keycloak_user_id"))
                for row in rows]
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:  # URLError and timeouts are OSError
        raise CoreError(str(exc)) from exc
