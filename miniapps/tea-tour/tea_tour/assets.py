# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Static files, read from the package once at start-up and served under content-hashed names.

The container's root filesystem is read-only and the files never change while it runs, so each name carries a hash of
the content (tokens.1a2b3c4d5e.css) and can be cached for a year. A url(...) inside a CSS file is rewritten to the
hashed name of the file it points to, so fonts and illustrations are immutable too. Only the suffixes below are
served: templates and licence text that live in static/ stay private.
"""
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

STATIC_DIR = Path(__file__).parent / "static"
CONTENT_TYPES = {".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png",
                 ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon"}
CACHE_CONTROL = "public, max-age=31536000, immutable"
URL_RE = re.compile(r"url\((['\"]?)([^)'\"]+)\1\)")


@dataclass(frozen=True)
class Asset:
    body: bytes
    content_type: str


def _hashed(relative: str, body: bytes) -> str:
    path = Path(relative)
    return path.with_name(f"{path.stem}.{hashlib.sha256(body).hexdigest()[:10]}{path.suffix}").as_posix()


def build(root: Path = STATIC_DIR) -> tuple[dict[str, str], dict[str, Asset]]:
    """(plain name -> hashed name, hashed name -> asset). Names are paths relative to the static folder."""
    files = sorted(p for p in root.rglob("*") if p.is_file() and p.suffix in CONTENT_TYPES)
    names: dict[str, str] = {}
    assets: dict[str, Asset] = {}
    for path in (p for p in files if p.suffix != ".css"):
        relative, body = path.relative_to(root).as_posix(), path.read_bytes()
        names[relative] = _hashed(relative, body)
        assets[names[relative]] = Asset(body, CONTENT_TYPES[path.suffix])
    for path in (p for p in files if p.suffix == ".css"):  # after the rest: their urls need the hashed names
        relative = path.relative_to(root).as_posix()
        folder = Path(relative).parent

        def point(match: re.Match) -> str:
            target = (folder / match.group(2).removeprefix("./")).as_posix()
            hashed = names.get(target)
            return f"url({match.group(1)}{Path(hashed).relative_to(folder).as_posix() if hashed else match.group(2)}{match.group(1)})"

        body = URL_RE.sub(point, path.read_text(encoding="utf-8")).encode("utf-8")
        names[relative] = _hashed(relative, body)
        assets[names[relative]] = Asset(body, CONTENT_TYPES[".css"])
    return names, assets


NAMES, ASSETS = build()


def static_url(name: str) -> str:
    """The hashed file name of a static file (KeyError for a name that does not exist, so a typo fails loudly)."""
    return NAMES[name]
