#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Assembles the public project site: site/ plus the product screenshots at their
# repository paths, copied (never duplicated in git) into media/. Used by the
# Pages workflow and for local preview.
# Usage: bash scripts/build-site.sh [output-dir]   (default: build/site)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/build/site}"

rm -rf "$OUT"
mkdir -p "$OUT/media"
cp -R "$ROOT/site/." "$OUT/"

# source (repository path) -> media file name
copy_media() {
  cp "$ROOT/$1" "$OUT/media/$2"
}
# Only the images the pages use. Frozen mini-apps (htx-dashboard, leaf-purchase, farm-supply) and the
# staff apps (Tea Work, desktop) have no image here; they are not advertised on the site.
copy_media docs/screenshots/web/director-board.png director-board.png
copy_media docs/screenshots/web/settlement-slip.png settlement-slip.png
copy_media docs/screenshots/web/lot-trace.png web-lot-trace.png
copy_media miniapps/tea-shop/store/public-order.png shop-public-order.png
copy_media miniapps/tea-shop/store/promotions.png shop-promotions.png
copy_media miniapps/custom-books/store/designer.png books-designer.png
copy_media apps/web/public/icon-512x512.png icon-512.png
copy_media apps/web/public/icon-192x192.png icon-192.png

# documentation pages, generated from the repository's Markdown (needs Python-Markdown, see DEPENDENCIES.md)
rm -rf "$OUT/docs-src"
rm -f "$OUT/README.md"
if ! python3 -c "import markdown" 2>/dev/null; then
  echo "Missing Python-Markdown: pip install markdown==3.7" >&2
  exit 1
fi
python3 "$ROOT/scripts/build-docs.py" "$OUT"
# release values read from the repository (version, latest release, release count, mini-apps)
python3 "$ROOT/scripts/inject-site-values.py" "$OUT"

echo "Site assembled in $OUT ($(find "$OUT" -type f | wc -l | tr -d ' ') files)"
