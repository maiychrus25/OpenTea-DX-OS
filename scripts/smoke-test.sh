#!/bin/bash
# scripts/smoke-test.sh — run after docker compose up
set -e
echo "=== DX-AgriMarket Smoke Test ==="
bash scripts/validate-env.sh
bash scripts/validate-structure.sh
echo "--- Checking service health ---"
curl -sf http://localhost:3000 > /dev/null && echo "✅ web" || echo "❌ web"
curl -sf http://localhost:8080/health/ready > /dev/null && echo "✅ keycloak" || echo "❌ keycloak"
curl -sf http://localhost:11434/api/tags > /dev/null && echo "✅ ollama" || echo "❌ ollama"
curl -sf http://localhost:9000/minio/health/live > /dev/null && echo "✅ minio" || echo "❌ minio"
curl -sf http://localhost:8000/health > /dev/null && echo "✅ disease-api" || echo "❌ disease-api"
echo "=== Smoke test complete ==="
