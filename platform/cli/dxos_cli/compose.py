# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Sinh docker/runtime/apps/<id>.compose.yml với các thiết lập cố định cho container app (spec §6.3)."""
import posixpath
from pathlib import Path

# Non-root, whatever the image's own USER says (same uid as the platform images).
APP_USER = "10001:10001"


def render_app_compose(manifest: dict, app_dir: Path) -> dict:
    """Compose override for service app-<id>, used as `-f docker/docker-compose.yml -f <this file>`.

    app_dir is relative to the repo root. Compose resolves relative paths against docker/, the directory
    of the first -f file, hence the leading '..' on build.context and env_file relative to docker/.

    shortcut: healthcheck assumes python in the image, upgrade when a non-Python mini-app appears
    """
    app_id, runtime = manifest["id"], manifest["runtime"]
    service = {}
    if "image" in runtime:
        service["image"] = runtime["image"]
    else:
        service["build"] = {"context": posixpath.normpath(posixpath.join("..", app_dir.as_posix(), runtime["build"]))}
    if "database" in manifest:
        service["env_file"] = [f"runtime/apps/{app_id}.env"]
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
        "networks": ["dxos-apps-net"],
        "healthcheck": {
            "test": ["CMD", "python", "-c", f"import urllib.request; urllib.request.urlopen({health_url!r}, timeout=3)"],
            "interval": "10s",
            "timeout": "5s",
            "retries": 5,
            "start_period": "10s",
        },
    })
    return {"services": {f"app-{app_id}": service}}
