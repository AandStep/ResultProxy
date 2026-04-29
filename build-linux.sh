#!/usr/bin/env bash
# Build the Linux binary and bundle it as .deb/.rpm via nfpm, plus an .AppImage
# via linuxdeploy when available.
#
# Optional environment:
#   SUBSCRIPTION_ENCRYPT_KEY   — pinned at link time if set.
#   VERSION                    — overrides the version stamped into the packages
#                                (default: pulled from update.json).

set -euo pipefail

OUT_DIR="build/bin"
mkdir -p "$OUT_DIR"

if [ -z "${VERSION:-}" ]; then
  VERSION=$(node -e "process.stdout.write(require('./update.json').version)" 2>/dev/null || echo "0.0.0")
fi
export VERSION

LDFLAGS=""
if [ -n "${SUBSCRIPTION_ENCRYPT_KEY:-}" ]; then
  LDFLAGS="-X resultproxy-wails/internal/proxy.subscriptionEncryptKey=${SUBSCRIPTION_ENCRYPT_KEY}"
fi

echo "==> wails build (linux/amd64) version=$VERSION"
if [ -n "$LDFLAGS" ]; then
  wails build -clean -platform linux/amd64 -ldflags "$LDFLAGS"
else
  wails build -clean -platform linux/amd64
fi

BIN_PATH=$(find "$OUT_DIR" -maxdepth 2 -type f -name "ResultV" | head -n1)
if [ -z "$BIN_PATH" ]; then
  echo "ERROR: ResultV binary not produced under $OUT_DIR" >&2
  exit 1
fi

echo "==> nfpm pkg (.deb)"
if command -v nfpm >/dev/null 2>&1; then
  nfpm pkg --packager deb --target "$OUT_DIR/" --config build/linux/nfpm.yaml
  nfpm pkg --packager rpm --target "$OUT_DIR/" --config build/linux/nfpm.yaml
else
  echo "WARN: nfpm not installed — skipping .deb/.rpm. Install: go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest"
fi

echo "==> AppImage"
if command -v linuxdeploy >/dev/null 2>&1; then
  APPDIR="$OUT_DIR/ResultV.AppDir"
  rm -rf "$APPDIR"
  mkdir -p "$APPDIR/usr/bin" "$APPDIR/usr/share/applications" "$APPDIR/usr/share/icons/hicolor/512x512/apps"
  cp "$BIN_PATH" "$APPDIR/usr/bin/resultv"
  cp build/linux/resultv.desktop "$APPDIR/usr/share/applications/resultv.desktop"
  cp public/logo.png "$APPDIR/usr/share/icons/hicolor/512x512/apps/resultv.png"
  ARCH=x86_64 linuxdeploy --appdir "$APPDIR" --output appimage --desktop-file "$APPDIR/usr/share/applications/resultv.desktop"
  mv ResultV*.AppImage "$OUT_DIR/" 2>/dev/null || true
else
  echo "WARN: linuxdeploy not installed — skipping AppImage. https://github.com/linuxdeploy/linuxdeploy/releases"
fi

echo "Done. Artifacts under $OUT_DIR/"
ls -la "$OUT_DIR/"
