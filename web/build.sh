#!/usr/bin/env bash
set -euo pipefail

# Build each widget HTML as a self-contained single file
first=true
for f in *.html; do
  echo "Building $f..."
  WIDGET="$f" npx vite build
  first=false
done

echo "All widgets built to dist/"
