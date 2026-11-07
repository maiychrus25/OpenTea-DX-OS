#!/usr/bin/env bash
# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.
#
# Validate a release version and print its CHANGELOG.md section.
# Usage: scripts/release-notes.sh <version>   (e.g. 1.2.0 or 1.2.0-rc.1, without the leading "v")
# Fails when the version is not SemVer, does not match apps/web/package.json,
# or has no "## [<version>] - YYYY-MM-DD" section in CHANGELOG.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-}"

fail() { echo "release-notes: $*" >&2; exit 1; }

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
  || fail "'$VERSION' is not a SemVer version (expected X.Y.Z or X.Y.Z-pre)"

PACKAGE_VERSION="$(node -p "require('$ROOT/apps/web/package.json').version")"
[[ "$PACKAGE_VERSION" == "$VERSION" ]] \
  || fail "apps/web/package.json version is $PACKAGE_VERSION, expected $VERSION"

NOTES="$(awk -v heading="## [$VERSION] - " '
  index($0, heading) == 1 { found = 1; next }
  found && /^## \[/       { exit }
  found                   { print }
' "$ROOT/CHANGELOG.md" | sed -e '/^---$/d' -e '/./,$!d')"  # drop section separators and leading blank lines

[[ -n "${NOTES//[[:space:]]/}" ]] \
  || fail "CHANGELOG.md has no non-empty section '## [$VERSION] - YYYY-MM-DD'"

printf '%s\n' "$NOTES"
