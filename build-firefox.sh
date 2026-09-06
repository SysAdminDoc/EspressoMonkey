#!/bin/bash
# ScriptVault - Firefox Add-on Build Script
# Produces a lintable Firefox build directory, an AMO-uploadable ZIP, and an
# AMO source-review ZIP from the same source tree.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build-firefox"
ARTIFACT_DIR="$SCRIPT_DIR/firefox-artifacts"

echo "Checking generated Firefox manifest parity..."
node "$SCRIPT_DIR/scripts/generate-manifest-firefox.mjs" --profile firefox --check --root "$SCRIPT_DIR"

echo "Checking Firefox vendored library provenance..."
node "$SCRIPT_DIR/scripts/check-vendored-library-provenance.mjs" --check

VERSION=$(node -e "console.log(require('./manifest-firefox.json').version)" 2>/dev/null || grep -o '"version": "[^"]*"' "$SCRIPT_DIR/manifest-firefox.json" | cut -d'"' -f4)
ZIP_NAME="scriptvault-firefox-v${VERSION}.zip"
SOURCE_ZIP_NAME="scriptvault-firefox-source-v${VERSION}.zip"
RUN_LINT=0
KEEP_BUILD=0
PACKAGE=1
SOURCE_ZIP=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --lint)
      RUN_LINT=1
      ;;
    --keep-build)
      KEEP_BUILD=1
      ;;
    --prepare-only)
      PACKAGE=0
      KEEP_BUILD=1
      ;;
    --no-source-zip)
      SOURCE_ZIP=0
      ;;
    --source-zip)
      SOURCE_ZIP=1
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

echo "Building ScriptVault for Firefox v$VERSION..."

# Build background.js using the same esbuild pipeline as Chrome.
# The legacy `build-background.sh` bash builder was removed once
# esbuild.config.mjs reached parity (see build history notes).
if [ -f "$SCRIPT_DIR/esbuild.config.mjs" ]; then
  echo "Building background.js via esbuild..."
  node "$SCRIPT_DIR/esbuild.config.mjs" --bg-only
else
  echo "Error: esbuild.config.mjs missing — cannot build background.js." >&2
  exit 1
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$ARTIFACT_DIR"

# Files/folders to include
INCLUDE=(
  background.js
  content.js
  shared
  modules/find-script-sources.js
  modules/i18n.js
  modules/local-libraries.js
  modules/local-workspace-project.js
  modules/script-config.js
  modules/user-scripts-setup.js
  modules/userstyles.js
  lib/acorn.min.js
  lib/diff.min.js
  pages
  images/icon16.png
  images/icon32.png
  images/icon48.png
  images/icon128.png
  _locales
)

# Copy Firefox manifest as manifest.json
cp "$SCRIPT_DIR/manifest-firefox.json" "$BUILD_DIR/manifest.json"

# Copy included files
for item in "${INCLUDE[@]}"; do
  src="$SCRIPT_DIR/$item"
  dest="$BUILD_DIR/$item"
  if [ -d "$src" ]; then
    mkdir -p "$dest"
    cp -r "$src"/* "$dest"/
  elif [ -f "$src" ]; then
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
  else
    echo "Warning: $item not found, skipping"
  fi
done

if [ "$RUN_LINT" -eq 1 ]; then
  echo "Linting Firefox build with web-ext..."
  LINT_REPORT="$ARTIFACT_DIR/web-ext-lint.json"
  npx web-ext lint \
    --source-dir "$BUILD_DIR" \
    --artifacts-dir "$ARTIFACT_DIR" \
    --no-input \
    --no-config-discovery \
    --output json > "$LINT_REPORT"
  node - "$LINT_REPORT" <<'NODE'
const { readFileSync } = require('node:fs');
const reportPath = process.argv[2];
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const summary = report.summary || {};
console.log(`web-ext lint: ${summary.errors || 0} errors, ${summary.notices || 0} notices, ${summary.warnings || 0} warnings`);
if ((summary.errors || 0) > 0) {
  for (const item of report.errors || []) {
    console.error(`- ${item.code || 'ERROR'} ${item.file || ''}:${item.line || ''} ${item.message || item.description || ''}`.trim());
  }
  process.exit(1);
}
NODE
  node scripts/check-firefox-lint-warnings.mjs
fi

if [ "$PACKAGE" -eq 1 ]; then
  echo "Packaging Firefox artifact with web-ext..."
  npx web-ext build \
    --source-dir "$BUILD_DIR" \
    --artifacts-dir "$ARTIFACT_DIR" \
    --filename "$ZIP_NAME" \
    --overwrite-dest \
    --no-input \
    --no-config-discovery
fi

if [ "$SOURCE_ZIP" -eq 1 ]; then
  echo "Writing AMO source-review archive..."
  git -C "$SCRIPT_DIR" archive --format=zip --output "$ARTIFACT_DIR/$SOURCE_ZIP_NAME" HEAD
fi

echo ""
if [ "$KEEP_BUILD" -eq 1 ]; then
  echo "Firefox build directory: build-firefox/"
else
  echo "Firefox build directory: cleaned (rerun with --keep-build to inspect)"
fi
if [ "$PACKAGE" -eq 1 ]; then
  echo "Firefox package: firefox-artifacts/$ZIP_NAME"
fi
if [ "$SOURCE_ZIP" -eq 1 ]; then
  echo "Source package: firefox-artifacts/$SOURCE_ZIP_NAME"
fi
echo ""
echo "Ready for web-ext lint, AMO upload, or temporary sideloading."

if [ "$KEEP_BUILD" -ne 1 ]; then
  rm -rf "$BUILD_DIR"
fi
