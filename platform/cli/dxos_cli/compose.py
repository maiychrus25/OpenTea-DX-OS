# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Sinh docker/runtime/<project>/apps/<id>.compose.yml với các thiết lập cố định cho container app (spec §6.3)."""
import os
import posixpath
from pathlib import Path

# Non-root, whatever the image's own USER says (same uid as the platform images).
APP_USER = "10001:10001"


def render_app_compose(manifest: dict, app_dir: Path) -> dict:
    """Compose override for service app-<id>, used as `-f docker/docker-compose.yml -f <this file>`.

    app_dir is relative to the repo root. Compose resolves relative paths against docker/, the directory
    of the first -f file, hence the leading '..' on build.context and env_file relative to docker/.
    Runtime state is per compose project (ruling R13): dxos-cli mounts docker/runtime/<project> at
    /repo/docker/runtime and sets DXOS_RUNTIME_SUBDIR=<project>, so only host-side paths name the project.

    shortcut: healthcheck assumes python in the image, upgrade when a non-Python mini-app appears
    """
    app_id, runtime = manifest["id"], manifest["runtime"]
    project = os.environ.get("DXOS_RUNTIME_SUBDIR", "docker")  # compose's default project for docker/
    if app_dir.parts[:3] == ("docker", "runtime", "generated"):
        # Inside dxos-cli the project folder is the mount; on the host (where compose builds) it is part of the path.
        app_dir = Path("docker", "runtime", project, *app_dir.parts[2:])
    service = {}
    if "image" in runtime:
        service["image"] = runtime["image"]
    else:
        service["build"] = {"context": posixpath.normpath(posixpath.join("..", app_dir.as_posix(), runtime["build"]))}
    if "database" in manifest:
        service["env_file"] = [f"runtime/{project}/apps/{app_id}.env"]
    generated = app_id.startswith("gen-")
    network = f"dxos-gen-{app_id}" if generated else "dxos-apps-net"
    health_url = f"http://127.0.0.1:{runtime['port']}{runtime['health']}"
    service.update({
        "restart": "unless-stopped",
        "user": APP_USER,
        "read_only": True,
        "tmpfs": ["/tmp"],
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges:true"],
        "mem_limit": "256m",
        "cpus": 0.5,
        # Defined in docker-compose.yml: internal, shared with apisix and postgres only. No ports, ever.
        "networks": [network],
        "healthcheck": {
            "test": ["CMD", "python", "-c", f"import urllib.request; urllib.request.urlopen({health_url!r}, timeout=3)"],
            "interval": "10s",
            "timeout": "5s",
            "retries": 5,
            "start_period": "10s",
        },
    })
    if generated:
        # An app the AI wrote sees only apisix and postgres (spec 12.7); ./dxos connects the running containers too.
        return {"services": {f"app-{app_id}": service, "apisix": {"networks": [network]}, "postgres": {"networks": [network]}},
                "networks": {network: {"internal": True}}}
    return {"services": {f"app-{app_id}": service}}
