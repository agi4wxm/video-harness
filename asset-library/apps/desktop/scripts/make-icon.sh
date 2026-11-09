#!/usr/bin/env bash
# 在 macOS 上把 build/icon.svg 生成 build/icon.icns（需要 rsvg-convert：brew install librsvg）
set -euo pipefail
cd "$(dirname "$0")/.."
SET=build/icon.iconset
rm -rf "$SET" && mkdir -p "$SET"
for s in 16 32 128 256 512; do
  rsvg-convert -w $s -h $s build/icon.svg -o "$SET/icon_${s}x${s}.png"
  rsvg-convert -w $((s*2)) -h $((s*2)) build/icon.svg -o "$SET/icon_${s}x${s}@2x.png"
done
iconutil -c icns "$SET" -o build/icon.icns
rm -rf "$SET"
echo "✓ build/icon.icns"
