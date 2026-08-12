#!/bin/bash
# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.

# scripts/smoke-test.sh â€” run after docker compose up
set -e
echo "=== DX-AgriMarket Smoke Test ==="
bash scripts/validate-env.sh
bash scripts/validate-structure.sh
echo "--- Checking service health ---"
curl -sf http://localhost:3000 > /dev/null && echo "âœ… web" || echo "âŒ web"
curl -sf http://localhost:8080/health/ready > /dev/null && echo "âœ… keycloak" || echo "âŒ keycloak"
curl -sf http://localhost:11434/api/tags > /dev/null && echo "âœ… ollama" || echo "âŒ ollama"
curl -sf http://localhost:9000/minio/health/live > /dev/null && echo "âœ… minio" || echo "âŒ minio"
curl -sf http://localhost:8000/health > /dev/null && echo "âœ… disease-api" || echo "âŒ disease-api"
echo "=== Smoke test complete ==="
