#!/usr/bin/env bash
set -euo pipefail

# Recompilation script for PS2 games using ps2-web-recomp
RECOMP_DIR="/mnt/storage/roms/ps2/tools/ps2-web-recomp"
ROMS_DIR="/mnt/storage/roms/ps2/roms"
BUILDS_DIR="/mnt/storage/roms/ps2/web_builds"
LOGS_DIR="$BUILDS_DIR/.logs"

usage() {
  echo "Usage: npm run recompile-ps2 -- \"<Game Title or File>\""
  echo "Example: npm run recompile-ps2 -- \"Final Fantasy X-2 (USA, Canada).iso\""
  exit 1
}

[ $# -ge 1 ] || usage

RAW_INPUT="$1"
TARGET_INPUT=$(echo "$RAW_INPUT" | sed -E 's/^ps2__//')

# Locate the ROM file in /mnt/storage/roms/ps2/roms/
FOUND_FILE=""
if [ -f "$TARGET_INPUT" ]; then
  FOUND_FILE="$TARGET_INPUT"
elif [ -f "$ROMS_DIR/$TARGET_INPUT" ]; then
  FOUND_FILE="$ROMS_DIR/$TARGET_INPUT"
else
  # Try fuzzy match across extensions (.iso, .chd, .bin, .cue, .zip)
  MATCH=$(find "$ROMS_DIR" -maxdepth 1 -iname "*$TARGET_INPUT*" | head -n 1)
  if [ -n "$MATCH" ] && [ -f "$MATCH" ]; then
    FOUND_FILE="$MATCH"
  fi
fi

if [ -z "$FOUND_FILE" ]; then
  echo "❌ Error: Could not find ROM file matching: '$TARGET_INPUT' in $ROMS_DIR"
  exit 1
fi

FILE_NAME=$(basename "$FOUND_FILE")
BASE_NAME="${FILE_NAME%.*}"
FILE_EXT="${FILE_NAME##*.}"
FILE_EXT_LOWER=$(echo "$FILE_EXT" | tr '[:upper:]' '[:lower:]')

# Generate safe alphanumeric slug for recomp tool
SLUG=$(echo "$BASE_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g' | sed -E 's/^_+|_+$//g')
[ -n "$SLUG" ] || SLUG="game"

mkdir -p "$LOGS_DIR"
PID_FILE="$LOGS_DIR/$SLUG.pid"
echo "$$" > "$PID_FILE"
cleanup() {
  rm -f "$PID_FILE"
}
trap cleanup EXIT

echo "=================================================="
echo "🎮 PS2 Web Recompilation"
echo "Target ROM:   $FILE_NAME"
echo "Base Name:    $BASE_NAME"
echo "Build Slug:   $SLUG"
echo "PID:          $$"
echo "=================================================="

DEST_BY_SLUG="$BUILDS_DIR/$SLUG"
DEST_BY_NAME="$BUILDS_DIR/$BASE_NAME"
mkdir -p "$DEST_BY_SLUG"

WORKING_ISO=""
ORIGINAL_WAS_CHD=false

# Handle CHD conversion if needed
if [ "$FILE_EXT_LOWER" = "chd" ]; then
  ORIGINAL_WAS_CHD=true
  echo "📦 Input is CHD. Inspecting media format..."
  TARGET_EXTRACTED_ISO="$DEST_BY_SLUG/disc.iso"

  CHD_INFO=$(chdman info -i "$FOUND_FILE" 2>&1 || true)
  if echo "$CHD_INFO" | grep -qiE "CD LZMA|cdlz|cdzl|cdfl|CHGD|Unit Size:[[:space:]]*2,448"; then
    echo "💿 Detected CD-ROM format in CHD. Converting via extractcd and bchunk..."
    TEMP_PREFIX="/tmp/ps2_chd_conv_${SLUG}_$$"
    chdman extractcd -i "$FOUND_FILE" -o "${TEMP_PREFIX}.cue" -ob "${TEMP_PREFIX}.bin"
    bchunk -d "${TEMP_PREFIX}.bin" "${TEMP_PREFIX}.cue" "${TEMP_PREFIX}_iso"
    PRODUCED_ISO=$(ls "${TEMP_PREFIX}_iso"*.iso 2>/dev/null | head -n 1 || true)
    if [ -n "$PRODUCED_ISO" ] && [ -f "$PRODUCED_ISO" ]; then
      mv -f "$PRODUCED_ISO" "$TARGET_EXTRACTED_ISO"
      WORKING_ISO="$TARGET_EXTRACTED_ISO"
    else
      echo "❌ Error: bchunk failed to produce an ISO track."
      rm -f "${TEMP_PREFIX}"*
      exit 1
    fi
    rm -f "${TEMP_PREFIX}"*
  else
    echo "📀 Detected DVD-ROM format in CHD. Extracting directly via extractdvd..."
    chdman extractdvd -i "$FOUND_FILE" -o "$TARGET_EXTRACTED_ISO"
    WORKING_ISO="$TARGET_EXTRACTED_ISO"
  fi
elif [ "$FILE_EXT_LOWER" = "iso" ]; then
  WORKING_ISO="$FOUND_FILE"
else
  echo "⚠️ Note: File extension is .$FILE_EXT. Attempting to use directly as disc image..."
  WORKING_ISO="$FOUND_FILE"
fi

# Ensure tools are built and environment is set
cd "$RECOMP_DIR"
export EMSDK="$RECOMP_DIR/tools/emsdk"
if [ -f "$EMSDK/emsdk_env.sh" ]; then
  source "$EMSDK/emsdk_env.sh" > /dev/null 2>&1
fi

echo "🚀 Starting recompilation pass (exploring up to 25 rounds, 25000 frames)..."
"$RECOMP_DIR/scripts/port.sh" "$SLUG" "$WORKING_ISO" --rounds 25 --frames 25000

echo "📦 Deploying web build to $DEST_BY_SLUG..."
cp -r "$RECOMP_DIR/build/web-$SLUG"/* "$DEST_BY_SLUG/"

# Inject cache busting into ps2web.html so browsers never serve stale WebAssembly or scripts
python3 -c "
import time, os
html_file = '$DEST_BY_SLUG/ps2web.html'
if os.path.exists(html_file):
    with open(html_file, 'r') as f:
        html = f.read()
    v = str(int(time.time()))
    html = html.replace('<script async src=ps2web.js></script>', f'<script async src=\"ps2web.js?v={v}\"></script>')
    if 'locateFile' not in html:
        target = 'var Module={canvas:canvas,'
        replacement = f'var Module={{locateFile:function(p,s){{return p.endsWith(\".iso\")?p:((s||\"\")+p+(p.includes(\"?\")?\"&\":\"?\")+\"v={v}\");}},canvas:canvas,'
        html = html.replace(target, replacement)
    with open(html_file, 'w') as f:
        f.write(html)
"

# Ensure disc.iso is in the web build folder without duplicating files on disk
FINAL_DISC="$DEST_BY_SLUG/disc.iso"
if [ "$ORIGINAL_WAS_CHD" = false ]; then
  # If disc.iso is not already the exact same file as FOUND_FILE
  if [ ! -f "$FINAL_DISC" ] || ! [ "$FOUND_FILE" -ef "$FINAL_DISC" ]; then
    echo "🔗 Hardlinking ISO to prevent duplicate disk usage..."
    ln -f "$FOUND_FILE" "$FINAL_DISC" || {
      mv -f "$FOUND_FILE" "$FINAL_DISC"
      ln -f "$FINAL_DISC" "$FOUND_FILE"
    }
  fi
fi

# Create a symlink from user-friendly Base Name to Slug so there is only 1 physical copy
if [ "$DEST_BY_NAME" != "$DEST_BY_SLUG" ]; then
  rm -rf "$DEST_BY_NAME"
  ln -sfn "$SLUG" "$DEST_BY_NAME"
fi

chmod -R 777 "$DEST_BY_SLUG" 2>/dev/null || true

echo "=================================================="
echo "✅ SUCCESS: Recompilation complete!"
echo "Game is now ready for full 60 FPS WebGPU play in the browser."
echo "Build location: $DEST_BY_SLUG"
echo "Disc location:  $FINAL_DISC"
echo "=================================================="
