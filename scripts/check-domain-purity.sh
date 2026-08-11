#!/bin/bash
echo "=== Checking Domain Layer Purity ==="

VIOLATIONS=""

# 1. Domain should not import anything from application, infrastructure, or presentation
OUTER_IMPORTS=$(grep -rnE "from\s*['\"]@/application" apps/web/src/domain/ --include="*.ts" 2>/dev/null || true)
if [ -n "$OUTER_IMPORTS" ]; then
  VIOLATIONS+="$OUTER_IMPORTS"$'\n'
fi

INFRA_IMPORTS=$(grep -rnE "from\s*['\"]@/infrastructure" apps/web/src/domain/ --include="*.ts" 2>/dev/null || true)
if [ -n "$INFRA_IMPORTS" ]; then
  VIOLATIONS+="$INFRA_IMPORTS"$'\n'
fi

PRES_IMPORTS=$(grep -rnE "from\s*['\"]@/presentation" apps/web/src/domain/ --include="*.ts" 2>/dev/null || true)
if [ -n "$PRES_IMPORTS" ]; then
  VIOLATIONS+="$PRES_IMPORTS"$'\n'
fi

# 2. Domain should not import Next.js or Prisma
NEXT_IMPORTS=$(grep -rnE "from\s*['\"]next" apps/web/src/domain/ --include="*.ts" 2>/dev/null || true)
if [ -n "$NEXT_IMPORTS" ]; then
  VIOLATIONS+="$NEXT_IMPORTS"$'\n'
fi

PRISMA_IMPORTS=$(grep -rnE "from\s*['\"]@prisma" apps/web/src/domain/ --include="*.ts" 2>/dev/null || true)
if [ -n "$PRISMA_IMPORTS" ]; then
  VIOLATIONS+="$PRISMA_IMPORTS"$'\n'
fi

# 3. Domain should not import relative paths to application/infrastructure/presentation
REL_APP=$(grep -rnE "from\s*['\"]\.\./(application|infrastructure|presentation)" apps/web/src/domain/ --include="*.ts" 2>/dev/null || true)
if [ -n "$REL_APP" ]; then
  VIOLATIONS+="$REL_APP"$'\n'
fi

VIOLATIONS=$(echo "$VIOLATIONS" | sed '/^$/d')

if [ -n "$VIOLATIONS" ]; then
  echo "DOMAIN PURITY VIOLATIONS FOUND:"
  echo "$VIOLATIONS"
  exit 1
else
  echo "Domain layer is pure"
  exit 0
fi
