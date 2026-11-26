# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Ghép route của mini-app vào tệp gateway APISIX (spec §5, bước 3)."""
import re
import textwrap
from pathlib import Path

import yaml

END = "#END\n"
# Same audience rule as &oidc_aud in platform/gateway/apisix.yaml (test_gateway checks they match).
AUD = {"anyOf": [{"enum": ["dx-os-core"]}, {"type": "array", "contains": {"enum": ["dx-os-core"]}}]}
# PyYAML cannot emit an alias, so a merge key is dumped as a string pair and turned into `<<: *oidc` textually.
_MERGE_DUMPED = re.compile(r"'<<': '\*(oidc\w*)'")
# Only the web's executor sends these, with the dxos-apps-actor token; every other request loses them at the gateway.
ACTING_HEADERS = ["X-DXOS-Acting-Sub", "X-DXOS-Acting-Role", "X-DXOS-Acting-Htx"]
# App routes match only on the internal listener web's proxy uses; 9080 is published to the host (R23).
INTERNAL_ONLY = [["server_port", "==", "9081"]]
ACTOR_CLIENT = "dxos-apps-actor"


class GatewayError(Exception):
    pass


class _NoAliasDumper(yaml.SafeDumper):
    # Routes share dict objects; without this PyYAML emits &id001 anchors that make each route harder to read.
    def ignore_aliases(self, data):
        return True


def app_routes(manifest: dict) -> list[dict]:
    app_id, routes = manifest["id"], manifest["routes"]
    common = {"vars": INTERNAL_ONLY, "upstream": {"nodes": {f"app-{app_id}:{manifest['runtime']['port']}": 1}}}
    regex_uri = [f"^/apps/{app_id}(/.*)?$", "$1"]
    rewrite = {"proxy-rewrite": {"regex_uri": regex_uri, "headers": {"remove": ACTING_HEADERS}}}
    out = []
    for n, prefix in enumerate(routes.get("public", []), 1):
        out.append({"id": f"app-{app_id}-public-{n}", "uri": f"/apps/{app_id}{prefix}*", "priority": 20,
                    **common, "plugins": dict(rewrite)})
    for n, (prefix, roles) in enumerate(routes.get("protected", {}).items(), 1):
        oidc = {"<<": "*oidc", "claim_schema": {
            "required": ["aud", "realm_access"],
            "properties": {
                "aud": AUD,
                "realm_access": {"required": ["roles"],
                                 "properties": {"roles": {"type": "array", "contains": {"enum": list(roles)}}}},
            },
        }}
        # radixtree already picks the longest matching uri; priority only orders routes with the same uri.
        out.append({"id": f"app-{app_id}-protected-{n}", "uri": f"/apps/{app_id}{prefix}*",
                    "priority": 10 + len(prefix), **common, "plugins": {"openid-connect": oidc, **rewrite}})
    agent = manifest.get("agent")
    if agent:
        # Exact uris beat the protected prefixes above: only the agent reads suggestions, only the actor runs actions.
        out.append({"id": f"app-{app_id}-agent-1", "uri": f"/apps/{app_id}{agent['suggestions']}", "methods": ["GET"],
                    "priority": 100, **common,
                    "plugins": {"openid-connect": {"<<": "*oidc_agent"}, **rewrite}})
        actor = {"<<": "*oidc", "claim_schema": {
            "required": ["aud", "azp"], "properties": {"aud": AUD, "azp": {"enum": [ACTOR_CLIENT]}}}}
        for n, action in enumerate(agent["actions"], 1):
            out.append({"id": f"app-{app_id}-actor-{n}", "uri": f"/apps/{app_id}{action['path']}", "methods": ["POST"],
                        "priority": 100, **common,
                        "plugins": {"openid-connect": actor, "proxy-rewrite": {"regex_uri": regex_uri}}})
    return out


def render_gateway(base_text: str, fragments: dict[str, list[dict]]) -> str:
    """Nối route app vào cuối khoá routes của tệp gốc, giữ nguyên từng byte của tệp gốc (không qua PyYAML)."""
    routes = [route for app_id in sorted(fragments) for route in fragments[app_id]]
    if not routes:
        return base_text
    if not base_text.endswith("\n" + END):
        raise GatewayError("Tệp gateway gốc phải kết thúc bằng dòng #END")
    if re.findall(r"^([A-Za-z_][\w-]*):", base_text, re.M)[-1:] != ["routes"]:
        raise GatewayError("'routes:' phải là khoá cấp cao cuối cùng của tệp gateway gốc")
    dumped = yaml.dump(routes, Dumper=_NoAliasDumper, sort_keys=False, allow_unicode=True, width=1000)
    return base_text[: -len(END)] + textwrap.indent(_MERGE_DUMPED.sub(r"<<: *\1", dumped), "  ") + END


def sync_gateway(repo_root: Path) -> None:
    base_text = (repo_root / "platform" / "gateway" / "apisix.yaml").read_text(encoding="utf-8")
    runtime = repo_root / "docker" / "runtime" / "gateway"
    fragments = {}
    for path in sorted((runtime / "apps").glob("*.yaml")):
        routes = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(routes, list):
            raise GatewayError(f"{path} phải là danh sách route")
        app_id = path.stem
        # A fragment may only route its own app's paths; it must never shadow a core route or another app.
        for route in routes:
            if not (isinstance(route, dict)
                    and re.fullmatch(rf"app-{re.escape(app_id)}-(public|protected|agent|actor)-\d+", str(route.get("id", "")))
                    and str(route.get("uri", "")).startswith(f"/apps/{app_id}/")):
                raise GatewayError(f"{path}: route {route.get('id') if isinstance(route, dict) else route!r} "
                                   f"phải có id 'app-{app_id}-<public|protected|agent|actor>-<n>' và uri dưới '/apps/{app_id}/'")
            if route.get("vars") != INTERNAL_ONLY:
                raise GatewayError(f"{path}: route {route['id']} phải có đúng vars {INTERNAL_ONLY}, "
                                   "để app chỉ nhận request qua cổng nội bộ 9081 của gateway")
            if "-actor-" not in route["id"]:  # a fragment written before the acting headers existed gets them removed too
                rewrite = route.setdefault("plugins", {}).setdefault("proxy-rewrite", {})
                removed = rewrite.setdefault("headers", {}).setdefault("remove", [])
                removed += [h for h in ACTING_HEADERS if h not in removed]
        fragments[app_id] = routes
    text = render_gateway(base_text, fragments)
    target = runtime / "apisix.yaml"
    runtime.mkdir(parents=True, exist_ok=True)
    # Write in place, never rename: APISIX keeps the inode of its bind-mounted file and would miss a new one.
    # Truncate first so a torn write never ends in the old #END (APISIX ignores a file without it).
    with open(target, "r+" if target.exists() else "w", encoding="utf-8") as fh:
        fh.truncate(0)
        fh.write(text)
