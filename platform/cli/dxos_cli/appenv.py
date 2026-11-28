# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Tệp env docker/runtime/<project>/apps/<id>.env của mỗi mini-app (mode 0600): URL database và bí mật cổng gateway."""
import os
import secrets
from pathlib import Path

GATEWAY_SECRET_KEY = "DXOS_APP_GATEWAY_SECRET"


def read_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    return {key: value for key, _, value in (line.partition("=") for line in path.read_text(encoding="utf-8").splitlines())
            if key and not key.startswith("#")}


def update_env(path: Path, values: dict[str, str]) -> None:
    """Merge values into the file and replace it atomically; other keys stay, mode is always 0600."""
    path.parent.mkdir(parents=True, exist_ok=True)
    merged = {**read_env(path), **values}
    tmp = path.with_name(path.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        os.fchmod(handle.fileno(), 0o600)  # an older tmp file keeps its mode through O_TRUNC
        handle.writelines(f"{key}={value}\n" for key, value in merged.items())
    tmp.replace(path)


def ensure_gateway_secret(path: Path) -> tuple[str, bool]:
    """The app's gateway secret, made (32 random bytes, base64url) when the env file has none; True when made."""
    existing = read_env(path).get(GATEWAY_SECRET_KEY)
    if existing:
        return existing, False
    secret = secrets.token_urlsafe(32)
    update_env(path, {GATEWAY_SECRET_KEY: secret})
    return secret, True


def remove_key(path: Path, key: str) -> None:
    """Drop one key; the file goes away when nothing is left, so an app that was never installed leaves no env file."""
    values = read_env(path)
    if key not in values:
        return
    del values[key]
    if values:
        path.unlink()
        update_env(path, values)
    else:
        path.unlink(missing_ok=True)
