#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Copy the shared mini-app kit (platform/appkit/appkit.py and kit.html) into each app package, because every app
# image is built from its own directory. --check changes nothing and exits 1 naming each copy that differs or is missing.
# Usage: scripts/appkit-sync.sh [--check]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES=(
  miniapps/leaf-purchase/leaf_purchase
  miniapps/tea-shop/tea_shop
  miniapps/farm-supply/farm_supply
  miniapps/tea-tour/tea_tour
  miniapps/custom-books/custom_books
)
# source file : path inside the package
FILES=(
  "platform/appkit/appkit.py:appkit.py"
  "platform/appkit/kit.html:templates/kit.html"
)

check=0
case "${1:-}" in
  "") ;;
  --check) check=1 ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac

stale=0
for package in "${PACKAGES[@]}"; do
  for pair in "${FILES[@]}"; do
    source="$ROOT/${pair%%:*}"
    target="$ROOT/$package/${pair##*:}"
    if cmp -s "$source" "$target"; then
      continue
    elif [ "$check" = 1 ]; then
      echo "appkit copy differs or is missing: $package/${pair##*:} (run make appkit-sync)" >&2
      stale=1
    else
      mkdir -p "$(dirname "$target")"
      cp "$source" "$target"
      echo "synced $package/${pair##*:}"
    fi
  done
done
exit "$stale"
