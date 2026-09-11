#!/bin/bash
# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.

REQUIRED_KEYS=(
  "OLLAMA_MODEL"
  "DATABASE_URL"
  "AUTH_SECRET"
  "KEYCLOAK_CLIENT_ID"
  "KEYCLOAK_CLIENT_SECRET"
  "KEYCLOAK_ISSUER"
  "MINIO_ENDPOINT"
  "MINIO_ACCESS_KEY"
  "MINIO_SECRET_KEY"
  "DISEASE_API_URL"
  "PIPER_URL"
  "N8N_ENCRYPTION_KEY"
  "MINIO_BUCKET_NAME"
)

MISSING=0
for key in "${REQUIRED_KEYS[@]}"; do
  if ! grep -q "^${key}=" .env.example; then
    echo "[ERROR] MISSING in .env.example: $key"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -eq 0 ]; then
  echo "[OK] All required env vars present in .env.example"
  exit 0
else
  echo "[ERROR] $MISSING keys missing"
  exit 1
fi
