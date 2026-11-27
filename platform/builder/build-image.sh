#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Build the dxos-builder image from a small staged context (the repository root is far too big to send to Docker).
# Usage: platform/builder/build-image.sh   (DXOS_BUILDER_IMAGE names the image; DXOS_BUILDER_TOOLS = codex-cli, claude-code or both)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
IMAGE="${DXOS_BUILDER_IMAGE:-opentea-dx-os/builder:local}"
CTX="$(mktemp -d)"
trap 'rm -rf "$CTX"' EXIT

mkdir -p "$CTX/builder" "$CTX/cli" "$CTX/repo/platform/apps" "$CTX/repo/apps/web" "$CTX/repo/platform/appkit" "$CTX/hello"
cp -R "$ROOT"/platform/builder/{Dockerfile,allowed-requirements.txt,entrypoint.py,gates.py,dxos_report.py,prompt.md,review-prompt.md,replay} "$CTX/builder/"
cp -R "$ROOT/platform/cli/dxos_cli" "$CTX/cli/dxos_cli"
cp "$ROOT/platform/apps/manifest.schema.json" "$CTX/repo/platform/apps/"
cp "$ROOT/apps/web/package.json" "$CTX/repo/apps/web/"  # the gates read the core version from it
cp "$ROOT"/platform/appkit/{appkit.py,kit.html} "$CTX/repo/platform/appkit/"
cp "$ROOT"/miniapps/hello/{Dockerfile,README.md,app.py,app.yaml,test_app.py} "$CTX/hello/"
find "$CTX" -name __pycache__ -prune -exec rm -rf {} +
docker build -q -t "$IMAGE" -f "$CTX/builder/Dockerfile" --build-arg "DXOS_BUILDER_TOOLS=${DXOS_BUILDER_TOOLS:-codex-cli}" "$CTX"
echo "$IMAGE"
