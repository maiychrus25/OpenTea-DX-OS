# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Screenshot files of a manifest's `store` block: read safely, typed by their first bytes (no image library)."""
from pathlib import Path

from dxos_cli.manifest import ManifestError

MAX_BYTES = 409600


def _content_type(head: bytes) -> str | None:
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def read_screenshot(app_dir: Path, rel: str) -> tuple[str, bytes]:
    path = (app_dir / rel).resolve()  # resolve() first, so a symlink or ../ that leaves the app is caught
    if not path.is_relative_to(app_dir.resolve()):
        raise ManifestError(f"ảnh {rel} nằm ngoài thư mục app")
    if not path.is_file():
        raise ManifestError(f"ảnh {rel} không tồn tại hoặc không phải tệp thường")
    if path.stat().st_size > MAX_BYTES:
        raise ManifestError(f"ảnh {rel} lớn hơn {MAX_BYTES // 1024} KB")
    data = path.read_bytes()
    content_type = _content_type(data[:12])
    if content_type is None:
        raise ManifestError(f"ảnh {rel} phải là PNG, JPEG hoặc WebP")
    return content_type, data


def check_store_files(app_dir: Path, manifest: dict) -> list[str]:
    errors = []
    for shot in manifest.get("store", {}).get("screenshots", []):
        try:
            read_screenshot(app_dir, shot["file"])
        except ManifestError as exc:
            errors.append(str(exc))
    return errors
