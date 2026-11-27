#!/bin/sh
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Cào một trang hoặc một mục của trang web thành markdown, lưu vào _goc/web/ (không commit).
# Cần firecrawl-local (cargo install firecrawl-local). Dùng: ./cao_trang.sh <url> [số trang tối đa]
set -eu
[ $# -ge 1 ] || { echo "Dùng: $0 <url> [số trang tối đa]" >&2; exit 2; }
BIN=$(command -v firecrawl-local || echo "$HOME/.cargo/bin/firecrawl-local")
# Không gửi gì lên đám mây, không nhờ bên khác lấy hộ trang đã chặn máy này.
export FIRECRAWL_CLOUD=off
OUT="$(dirname "$0")/_goc/web/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
# Từ tốn (2 trang một lượt), có đọc robots.txt, chỉ địa chỉ công khai.
"$BIN" crawl "$1" --limit "${2:-30}" --max-depth 2 --concurrency 2 --public-only --out "$OUT"
echo "Đã lưu vào $OUT"
