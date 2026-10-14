#!/bin/sh
# Renders the app icons in ../public from icon.svg / icon-maskable.svg with headless Chrome.
# Usage: sh web/icons/render.sh  (macOS; set CHROME to another Chrome/Chromium binary elsewhere)
set -eu
cd "$(dirname "$0")"
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
tmp=$(mktemp -d)
render() { # svg size out
  printf '<html><body style="margin:0"><img src="%s" width="%s" height="%s" style="display:block"></body></html>' \
    "file://$PWD/$1" "$2" "$2" > "$tmp/page.html"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$2,$2" --screenshot="$PWD/../public/$3" "file://$tmp/page.html" >/dev/null 2>&1
}
render icon.svg 192 icon-192.png
render icon.svg 512 icon-512.png
render icon-maskable.svg 512 icon-512-maskable.png
render icon.svg 180 apple-touch-icon.png
rm -rf "$tmp"
