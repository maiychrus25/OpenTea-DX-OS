#!/bin/bash
# Copyright (c) 2026 OpenTea Developers
# Licensed under the MIT License. See LICENSE file in the project root for full license information.

REQUIRED_DIRS=(
  "apps/web"
  "apps/disease-api"
  "docker"
  "workflows"
  "docs"
  "docs/timelines"
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
  "docs/README.md"
  "docs/business-analysis.md"
  "docs/product-roadmap.md"
  "docs/project-context.md"
  "docs/rules-and-limits.md"
)

FAIL=0
for dir in "${REQUIRED_DIRS[@]}"; do
  [ -d "$dir" ] || { echo "[ERROR] Missing dir: $dir"; FAIL=1; }
done

for file in "${REQUIRED_FILES[@]}"; do
  [ -f "$file" ] || { echo "[ERROR] Missing file: $file"; FAIL=1; }
done

# Validate documentation file and template directory naming (English-only kebab-case)
RE_DOC='^[a-z0-9]+(-[a-z0-9]+)*\.md$'
RE_ADR='^[0-9]{4}-[a-z0-9]+(-[a-z0-9]+)*\.md$'
RE_DATED='^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(-[a-z0-9]+)*\.md$'
RE_TIMELINE='^[0-9]{4}-[0-9]{2}-[0-9]{2}\.md$'
RE_KEBAB='^[a-z0-9]+(-[a-z0-9]+)*$'

for f in docs/*.md; do
  [ -e "$f" ] || continue
  base=$(basename "$f")
  if [ "$base" != "README.md" ] && [[ ! "$base" =~ $RE_DOC ]]; then
    echo "[ERROR] Invalid doc filename (expected README.md or kebab-case.md): $f"
    FAIL=1
  fi
done

for f in docs/adr/*.md; do
  [ -e "$f" ] || continue
  base=$(basename "$f")
  if [[ ! "$base" =~ $RE_ADR ]]; then
    echo "[ERROR] Invalid ADR filename (expected NNNN-kebab-case.md): $f"
    FAIL=1
  fi
done

for dir in docs/specs docs/plans; do
  for f in "$dir"/*.md; do
    [ -e "$f" ] || continue
    base=$(basename "$f")
    if [[ ! "$base" =~ $RE_DATED ]]; then
      echo "[ERROR] Invalid dated doc filename (expected YYYY-MM-DD-kebab-case.md): $f"
      FAIL=1
    fi
  done
done

for f in docs/timelines/*.md; do
  [ -e "$f" ] || continue
  base=$(basename "$f")
  if [[ ! "$base" =~ $RE_TIMELINE ]]; then
    echo "[ERROR] Invalid timeline filename (expected YYYY-MM-DD.md): $f"
    FAIL=1
  fi
done

if [ -d "docs/templates" ]; then
  while IFS= read -r d; do
    base=$(basename "$d")
    if [[ ! "$base" =~ $RE_KEBAB ]]; then
      echo "[ERROR] Invalid template directory name (expected English kebab-case): $d"
      FAIL=1
    fi
  done < <(find docs/templates -mindepth 1 -type d)
fi

[ $FAIL -eq 0 ] && echo "[OK] Structure OK" || exit 1
