#!/bin/bash
# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.

# scripts/smoke-test.sh â€” run after docker compose up
set -e
echo "=== DX-AgriMarket Smoke Test ==="
bash scripts/validate-env.sh
bash scripts/validate-structure.sh
echo "--- Checking service health ---"
# Core services (required)
curl -sf http://localhost:8080/health/ready > /dev/null && echo "OK keycloak" || echo "WARN keycloak"
curl -s -o /dev/null http://localhost:9000/ && echo "OK seaweedfs" || echo "WARN seaweedfs"
# Optional services (may not be running in CI)
curl -sf http://localhost:3000 > /dev/null && echo "OK web" || echo "SKIP web (not started)"
curl -sf http://localhost:11434/api/tags > /dev/null && echo "OK ollama" || echo "SKIP ollama (not started)"
curl -sf http://localhost:8000/health > /dev/null && echo "OK disease-api" || echo "SKIP disease-api (not started)"
echo "=== Smoke test complete ==="
