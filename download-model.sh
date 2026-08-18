#!/usr/bin/env bash
# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.

# download-model.sh
# Downloads the disease detection model from ICTU-OpenAgri (MIT License)
# Run this script once before starting disease-api service.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_DIR="${SCRIPT_DIR}/ai-models"
MODEL_FILE="${MODEL_DIR}/leaf_disease_model.keras"
CLASS_NAMES_FILE="${MODEL_DIR}/class_names.txt"

BASE_URL="https://raw.githubusercontent.com/CuongKenn/ICTU-OpenAgri/main/backend/ml_models"

mkdir -p "${MODEL_DIR}"

echo "=== DX-AgriMarket: Disease Detection Model Downloader ==="
echo "Source: CuongKenn/ICTU-OpenAgri (MIT License)"
echo ""

# Download model
if [ -f "${MODEL_FILE}" ]; then
  SIZE=$(du -h "${MODEL_FILE}" | cut -f1)
  echo "[SKIP] leaf_disease_model.keras already exists (${SIZE})"
else
  echo "[DOWNLOAD] leaf_disease_model.keras (~10 MB)..."
  curl -fSL "${BASE_URL}/leaf_disease_model.keras" -o "${MODEL_FILE}"
  SIZE=$(du -h "${MODEL_FILE}" | cut -f1)
  echo "[OK] Downloaded: ${SIZE}"
fi

# Download class names
if [ -f "${CLASS_NAMES_FILE}" ]; then
  echo "[SKIP] class_names.txt already exists"
else
  echo "[DOWNLOAD] class_names.txt..."
  curl -fSL "${BASE_URL}/class_names.txt" -o "${CLASS_NAMES_FILE}"
  echo "[OK] Downloaded class_names.txt"
fi

echo ""
echo "=== Done! Model files are ready in ai-models/ ==="
echo "You can now start disease-api with: docker compose up disease-api"
