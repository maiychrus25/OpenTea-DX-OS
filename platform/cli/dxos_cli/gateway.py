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
# PyYAML cannot emit an alias, so the merge key is dumped as this string pair and turned into `<<: *oidc` textually.
_MERGE_DUMPED = "'<<': '*oidc'"


class GatewayError(Exception):
    pass


class _NoAliasDumper(yaml.SafeDumper):
    # Routes share dict objects; without this PyYAML emits &id001 anchors that make each route harder to read.
    def ignore_aliases(self, data):
        return True


def app_routes(manifest: dict) -> list[dict]:
    app_id, routes = manifest["id"], manifest["routes"]
    common = {"upstream": {"nodes": {f"app-{app_id}:{manifest['runtime']['port']}": 1}}}
    rewrite = {"proxy-rewrite": {"regex_uri": [f"^/apps/{app_id}(/.*)?$", "$1"]}}
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
    return base_text[: -len(END)] + textwrap.indent(dumped.replace(_MERGE_DUMPED, "<<: *oidc"), "  ") + END


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
                    and re.fullmatch(rf"app-{re.escape(app_id)}-(public|protected)-\d+", str(route.get("id", "")))
                    and str(route.get("uri", "")).startswith(f"/apps/{app_id}/")):
                raise GatewayError(f"{path}: route {route.get('id') if isinstance(route, dict) else route!r} "
                                   f"phải có id 'app-{app_id}-<public|protected>-<n>' và uri dưới '/apps/{app_id}/'")
        fragments[app_id] = routes
    text = render_gateway(base_text, fragments)
    target = runtime / "apisix.yaml"
    runtime.mkdir(parents=True, exist_ok=True)
    # Write in place, never rename: APISIX keeps the inode of its bind-mounted file and would miss a new one.
    # Truncate first so a torn write never ends in the old #END (APISIX ignores a file without it).
    with open(target, "r+" if target.exists() else "w", encoding="utf-8") as fh:
        fh.truncate(0)
        fh.write(text)
