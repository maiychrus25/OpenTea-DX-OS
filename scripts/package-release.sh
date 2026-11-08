#!/usr/bin/env bash
# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.
#
# Build the deployment bundle for a release from tracked files at HEAD.
# Usage: scripts/package-release.sh <version> <output-dir>
# Produces <output-dir>/opentea-dx-os-<version>.tar.gz and <output-dir>/SHA256SUMS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:?usage: package-release.sh <version> <output-dir>}"
OUT_DIR="${2:?usage: package-release.sh <version> <output-dir>}"
NAME="opentea-dx-os-${VERSION}"

# Everything the release compose stack mounts or needs at deploy time; no application source.
BUNDLE_PATHS=(
  LICENSE
  README.md
  CHANGELOG.md
  .env.example
  download-model.sh
  docker/docker-compose.yml
  docker/docker-compose.release.yml
  docker/.env.local.example
  docker/postgres-init.sql
  docker/keycloak
  ai-models
  piper-voices
  workflows
  platform
  apps/web/prisma
)

mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"

git -C "$ROOT" archive --format=tar.gz --prefix="${NAME}/" \
  -o "${OUT_DIR}/${NAME}.tar.gz" HEAD -- "${BUNDLE_PATHS[@]}"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUT_DIR" && sha256sum "${NAME}.tar.gz" > SHA256SUMS)
else
  (cd "$OUT_DIR" && shasum -a 256 "${NAME}.tar.gz" > SHA256SUMS)
fi

echo "Created ${OUT_DIR}/${NAME}.tar.gz"
