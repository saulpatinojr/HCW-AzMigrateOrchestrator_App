#!/usr/bin/env bash
# Clone (or reuse) the sibling _Addon checkout at the pinned ref and build it so this repository's file: links resolve (ADR-0027).
# Usage: ADDON_REF=v0.1.1 bash scripts/bootstrap-addon.sh
set -euo pipefail
ADDON_REF="${ADDON_REF:-v0.1.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/../HCW-AzMigrateOrchestrator_Addon"
if [ ! -d "$DIR" ]; then
  git clone --depth 1 --branch "$ADDON_REF" "https://github.com/saulpatinojr/HCW-AzMigrateOrchestrator_Addon.git" "$DIR"
else
  echo "using existing $DIR ($(git -C "$DIR" describe --tags --always 2>/dev/null || echo untagged)); expected ref $ADDON_REF"
fi
(cd "$DIR" && npm ci && npm run build)
echo "sibling core ready at $DIR"
