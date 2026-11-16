#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
#
# One command: install the locked dependencies, check, test, build the APK.
#   ./tool/build.sh          -> build/app/outputs/flutter-apk/app-release.apk
#   ./tool/build.sh check    -> only analyze + test (no Android SDK needed)
set -euo pipefail
cd "$(dirname "$0")/.."

flutter pub get --enforce-lockfile
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test

if [ "${1:-}" != "check" ]; then
  flutter build apk --release
fi
