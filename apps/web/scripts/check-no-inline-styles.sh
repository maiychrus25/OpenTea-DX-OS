#!/bin/bash
# Checks for inline styles, Tailwind classes, and style={} props in component files
echo "=== Checking for inline style violations ==="

VIOLATIONS=0

# Check for style={{ in tsx files
INLINE=$(grep -rn "style={{" src/components/ --include="*.tsx" | grep -v "//.*style={{")
if [ -n "$INLINE" ]; then
  echo "❌ Inline styles found:"
  echo "$INLINE"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check for Tailwind class patterns (bg-, text-, p-, m-, flex, grid-)
TAILWIND=$(grep -rn 'className="[^"]*\(bg-\|text-\|p-\|m-\|flex\b\|grid\b\)' src/components/ --include="*.tsx")
if [ -n "$TAILWIND" ]; then
  echo "❌ Possible Tailwind classes found:"
  echo "$TAILWIND"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

if [ $VIOLATIONS -eq 0 ]; then
  echo "✅ No inline style violations found"
  exit 0
else
  exit 1
fi
