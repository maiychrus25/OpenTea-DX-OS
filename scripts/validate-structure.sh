#!/bin/bash
REQUIRED_DIRS=(
  "apps/web"
  "apps/disease-api"
  "docker"
  "workflows"
  "docs"
  "ai-models"
  "apps/web/src/app"
  "apps/web/src/styles"
)

REQUIRED_FILES=(
  "docker/docker-compose.yml"
  ".env.example"
  ".gitignore"
  "apps/web/tsconfig.json"
  "apps/web/next.config.js"
  "apps/web/src/styles/globals.css"
  "apps/disease-api/app/main.py"
  "apps/disease-api/requirements.txt"
  "apps/disease-api/Dockerfile"
)

FAIL=0
for dir in "${REQUIRED_DIRS[@]}"; do
  [ -d "$dir" ] || { echo "❌ Missing dir: $dir"; FAIL=1; }
done

for file in "${REQUIRED_FILES[@]}"; do
  [ -f "$file" ] || { echo "❌ Missing file: $file"; FAIL=1; }
done

[ $FAIL -eq 0 ] && echo "✅ Structure OK" || exit 1
