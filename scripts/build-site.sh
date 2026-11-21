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
copy_media miniapps/htx-dashboard/store/overview.png htx-overview.png
copy_media miniapps/htx-dashboard/store/parcel.png htx-parcel.png
copy_media miniapps/htx-dashboard/store/parcels.png htx-parcels.png
copy_media miniapps/htx-dashboard/store/data.png htx-data.png
copy_media miniapps/leaf-purchase/store/manager-period.png leaf-period.png
copy_media miniapps/leaf-purchase/store/officer-tickets.png leaf-tickets.png
copy_media miniapps/tea-shop/store/public-order.png shop-public-order.png
copy_media miniapps/tea-shop/store/manager-orders.png shop-orders.png
copy_media miniapps/tea-tour/store/manager-tour.png tour-manager.png
copy_media miniapps/farm-supply/store/manager-round.png supply-round.png
copy_media miniapps/custom-books/store/designer.png books-designer.png
copy_media miniapps/custom-books/store/book-in-use.png books-in-use.png
copy_media apps/staff-desktop/docs/screenshots/08-payroll.png desktop-payroll.png
copy_media apps/staff-mobile/docs/screenshots/02-tasks.png mobile-tasks.png
copy_media apps/staff-mobile/docs/screenshots/04-attendance.png mobile-attendance.png
copy_media docs/screenshots/web/lot-trace.png web-lot-trace.png
copy_media docs/screenshots/web/app-store.png web-app-store.png
copy_media apps/web/public/icon-512x512.png icon-512.png
copy_media apps/web/public/icon-192x192.png icon-192.png

echo "Site assembled in $OUT ($(find "$OUT" -type f | wc -l | tr -d ' ') files)"
