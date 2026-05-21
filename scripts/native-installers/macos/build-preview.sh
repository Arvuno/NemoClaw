#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_DIR="$ROOT/apps/native-installers/macos/NemoClawMacInstaller"
BUILD_DIR="${NEMOCLAW_MAC_INSTALLER_BUILD_DIR:-$ROOT/build/native-mac-installer-preview}"
PAYLOAD_DIR="$BUILD_DIR/payload"
APP_BUNDLE="$BUILD_DIR/NemoClaw Mac Installer Preview.app"
DMG_PATH="$BUILD_DIR/NemoClaw-Mac-Installer-Preview.dmg"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: scripts/native-installers/macos/build-preview.sh [--dry-run]

Builds the experimental macOS Mac Installer Preview app bundle and DMG.

Signing/notarization env vars:
  DEVELOPER_ID_APPLICATION      Developer ID Application identity
  APPLE_ID                      Apple ID for notarytool
  APPLE_TEAM_ID                 Apple Developer Team ID
  APPLE_APP_SPECIFIC_PASSWORD   App-specific password for notarytool
  NEMOCLAW_OPENSHELL_BIN        Pinned openshell binary to bundle
  NEMOCLAW_MAC_INSTALLER_NODE_TARBALL Private Node runtime tarball to bundle
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$(uname -s)" != "Darwin" ] && [ "$DRY_RUN" != "1" ]; then
  echo "Mac Installer Preview app builds require macOS. Use --dry-run to validate inputs elsewhere." >&2
  exit 1
fi

mkdir -p "$PAYLOAD_DIR"

echo "[native-installer] Building NemoClaw CLI"
if [ "$DRY_RUN" != "1" ]; then
  if [ ! -d "$ROOT/node_modules" ]; then
    npm ci --ignore-scripts --prefix "$ROOT"
  fi
  npm run --prefix "$ROOT" build:cli
  LEGACY_PREVIEW_SLUG="fast""lane"
  rm -rf "$ROOT/dist/commands/$LEGACY_PREVIEW_SLUG" "$ROOT/dist/lib/$LEGACY_PREVIEW_SLUG"
fi

echo "[native-installer] Staging payload"
rm -rf "$PAYLOAD_DIR"
mkdir -p "$PAYLOAD_DIR"/{bin,dist,scripts,agents,release,licenses,tools}
cp -R "$ROOT/bin/." "$PAYLOAD_DIR/bin/"
if [ -d "$ROOT/dist" ]; then cp -R "$ROOT/dist/." "$PAYLOAD_DIR/dist/"; fi
if [ -d "$ROOT/node_modules" ]; then cp -R "$ROOT/node_modules" "$PAYLOAD_DIR/node_modules"; fi
cp -R "$ROOT/scripts/." "$PAYLOAD_DIR/scripts/"
cp -R "$ROOT/agents/." "$PAYLOAD_DIR/agents/"
cp -R "$ROOT/release/native-installers" "$PAYLOAD_DIR/release/"
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$PAYLOAD_DIR/"
cp "$ROOT/LICENSE" "$PAYLOAD_DIR/licenses/"
if [ -f "$ROOT/NOTICE" ]; then
  cp "$ROOT/NOTICE" "$PAYLOAD_DIR/licenses/"
fi
cp "$ROOT/uninstall.sh" "$PAYLOAD_DIR/uninstall.sh"

if [ -n "${NEMOCLAW_OPENSHELL_BIN:-}" ]; then
  cp "$NEMOCLAW_OPENSHELL_BIN" "$PAYLOAD_DIR/tools/openshell"
else
  echo "[native-installer] Warning: NEMOCLAW_OPENSHELL_BIN not set; payload has no pinned OpenShell binary." >&2
fi

if [ -n "${NEMOCLAW_MAC_INSTALLER_NODE_TARBALL:-}" ]; then
  cp "$NEMOCLAW_MAC_INSTALLER_NODE_TARBALL" "$PAYLOAD_DIR/tools/node-runtime.tar.gz"
else
  echo "[native-installer] Warning: NEMOCLAW_MAC_INSTALLER_NODE_TARBALL not set; payload has no private Node runtime." >&2
fi

if command -v syft >/dev/null 2>&1; then
  syft dir:"$PAYLOAD_DIR" -o spdx-json > "$PAYLOAD_DIR/sbom.spdx.json"
else
  printf '{"warning":"syft not found; SBOM not generated"}\n' > "$PAYLOAD_DIR/sbom.spdx.json"
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "[native-installer] Dry run complete: payload staged at $PAYLOAD_DIR"
  exit 0
fi

echo "[native-installer] Building SwiftUI app"
swift build -c release --package-path "$APP_DIR" --scratch-path "$BUILD_DIR/swift-build"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
cp "$BUILD_DIR/swift-build/release/NemoClawMacInstaller" "$APP_BUNDLE/Contents/MacOS/NemoClawMacInstaller"
cp -R "$PAYLOAD_DIR" "$APP_BUNDLE/Contents/Resources/payload"
cat > "$APP_BUNDLE/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>NemoClawMacInstaller</string>
  <key>CFBundleIdentifier</key>
  <string>com.nvidia.nemoclaw.mac-installer-preview</string>
  <key>CFBundleName</key>
  <string>NemoClaw Mac Installer Preview</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0-preview</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
</dict>
</plist>
EOF

if [ -n "${DEVELOPER_ID_APPLICATION:-}" ]; then
  echo "[native-installer] Signing app bundle"
  codesign --force --deep --options runtime \
    --entitlements "$ROOT/release/native-installers/macos/entitlements.plist" \
    --sign "$DEVELOPER_ID_APPLICATION" "$APP_BUNDLE"
else
  echo "[native-installer] Warning: DEVELOPER_ID_APPLICATION not set; leaving app unsigned." >&2
fi

echo "[native-installer] Creating DMG"
rm -f "$DMG_PATH"
hdiutil create -volname "NemoClaw Mac Installer Preview" -srcfolder "$APP_BUNDLE" -ov -format UDZO "$DMG_PATH"

if [ -n "${DEVELOPER_ID_APPLICATION:-}" ]; then
  codesign --force --sign "$DEVELOPER_ID_APPLICATION" "$DMG_PATH"
fi

if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
  echo "[native-installer] Submitting DMG for notarization"
  xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --wait
  xcrun stapler staple "$DMG_PATH"
else
  echo "[native-installer] Notarization env vars not set; skipping notarization." >&2
fi

echo "[native-installer] Built $APP_BUNDLE"
echo "[native-installer] Built $DMG_PATH"
