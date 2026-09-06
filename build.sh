#!/bin/bash
# ScriptVault - Chrome Web Store Build Script
# Packages the extension into a .zip ready for CWS upload

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${SCRIPTVAULT_BUILD_ROOT:-$SCRIPT_DIR/build}"
ARTIFACT_ROOT="${SCRIPTVAULT_ARTIFACT_ROOT:-$SCRIPT_DIR}"
ZIP_NAME="ScriptVault-v$(grep -o '"version": "[^"]*"' "$SCRIPT_DIR/manifest.json" | cut -d'"' -f4).zip"
ZIP_PATH="$ARTIFACT_ROOT/$ZIP_NAME"

echo "Building ScriptVault..."

# Build background.js, generate GM API types, and ensure lib/monaco-esm is
# populated before packaging.
# Without this, edits to source modules wouldn't propagate to the shipped
# background.js, and a fresh checkout would ship with an empty lib/monaco-esm
# or stale userscript ambient declarations.
if [ -f "$SCRIPT_DIR/esbuild.config.mjs" ]; then
  node "$SCRIPT_DIR/esbuild.config.mjs"
fi

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$ARTIFACT_ROOT"

# Files/folders to include in the CWS package
INCLUDE=(
  manifest.json
  background.js
  content.js
  offscreen.html
  offscreen.js
  shared
  modules/find-script-sources.js
  modules/i18n.js
  modules/local-libraries.js
  modules/local-workspace-project.js
  modules/script-config.js
  modules/user-scripts-setup.js
  modules/userstyles.js
  pages
  images/icon16.png
  images/icon32.png
  images/icon48.png
  images/icon128.png
  lib/codemirror
  lib/monaco-esm
  lib/acorn.min.js
  lib/diff.min.js
  lib/fflate.js
  lib/scriptvault.d.ts
  managed-storage-schema.json
  _locales
)

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

# Build the zip
cd "$BUILD_DIR"
rm -f "$ZIP_PATH"

if command -v zip &> /dev/null; then
  zip -r "$ZIP_PATH" . -x "*.DS_Store" "*Thumbs.db"
elif [ -x "/c/Windows/System32/tar.exe" ]; then
  # Windows 10/11 ships bsdtar as tar.exe — produces POSIX-style entries
  # (forward slashes). PowerShell Compress-Archive writes Windows-style
  # backslash entries which Chrome cannot match against manifest paths.
  /c/Windows/System32/tar.exe -a -c -f "$ZIP_PATH" *
else
  echo "ERROR: no zip or bsdtar available"
  exit 1
fi

echo ""
echo "Build complete: $ZIP_NAME"
echo "Artifact: $ZIP_PATH"
echo "Size: $(du -h "$ZIP_PATH" | cut -f1)"
echo ""
echo "Ready for Chrome Web Store upload."

# Cleanup
rm -rf "$BUILD_DIR"
