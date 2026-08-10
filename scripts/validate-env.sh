#!/bin/bash
REQUIRED_KEYS=(
  "OLLAMA_MODEL"
  "DATABASE_URL"
  "NEXTAUTH_SECRET"
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
    echo "❌ MISSING in .env.example: $key"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -eq 0 ]; then
  echo "✅ All required env vars present in .env.example"
  exit 0
else
  echo "❌ $MISSING keys missing"
  exit 1
fi
