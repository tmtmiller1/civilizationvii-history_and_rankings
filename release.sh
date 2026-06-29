#!/usr/bin/env bash
# release.sh: produce a clean, debug-disabled zip ready for distribution.
#
# Usage:  ./release.sh
# Output: dist/history-and-rankings-vX.Y.Z.zip  (version read from modinfo <Version>)
#
#   1. Mirrors the mod source into dist/history-and-rankings/ (excluding dev cruft).
#   2. Flips `const DBG = true` -> `const DBG = false` in dist JS only.
#   3. Ships readable JS (no minification).
#   4. Verifies modinfo has Version + Authors set.
#   5. Zips with history-and-rankings/ as zip root.
#   6. Audits the zip against an allow-list so stray files can't ship.

set -euo pipefail
cd "$(dirname "$0")"

if [ "${SKIP_VERIFY:-0}" != "1" ]; then
  echo "release: running 'npm run verify' (set SKIP_VERIFY=1 to skip)..."
  npm run verify || { echo "release: verify FAILED — aborting."; exit 1; }
fi

DIST_DIR="dist"
MODINFO="history-and-rankings.modinfo"
[ -f "$MODINFO" ] || { echo "error: no $MODINFO in $(pwd)"; exit 1; }

VERSION="$(grep -oE '<Version>[^<]+</Version>' "$MODINFO" | head -1 | sed -E 's|</?Version>||g')"
[ -n "$VERSION" ] || { echo "error: could not parse <Version> from modinfo"; exit 1; }

AUTHORS="$(grep -oE '<Authors>[^<]+</Authors>' "$MODINFO" | head -1 | sed -E 's|</?Authors>||g')"
case "$AUTHORS" in
    ""|"Your Name"|"TODO") echo "error: set <Authors> in modinfo first."; exit 1 ;;
esac

ZIP_NAME="history-and-rankings-v${VERSION}.zip"
TARGET_DIR="$DIST_DIR/history-and-rankings"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

echo "==> Cleaning $DIST_DIR/"
rm -rf "$DIST_DIR"
mkdir -p "$TARGET_DIR"

echo "==> Mirroring source → $TARGET_DIR/ (excluding dev cruft)"
rsync -a --exclude='.git' --exclude='.gitignore' --exclude='.DS_Store' --exclude='dist' \
    --exclude='release.sh' --exclude='*.bak' --exclude='node_modules' \
    --exclude='tsconfig.json' --exclude='eslint.config.js' --exclude='package.json' \
    --exclude='package-lock.json' --exclude='*.d.ts' --exclude='tests' --exclude='docs' --exclude='steam_workshop_id.txt' \
    --exclude='CONTRIBUTING.md' --exclude='README.pdf' --exclude='images' --exclude='scripts' \
    --exclude='types' --exclude='coverage' --exclude='reports' --exclude='stryker.config.json' \
    --exclude='*_DESIGN.md' --exclude='PHASE_*.md' --exclude='00_IMPLEMENTATION_REFERENCE.md' \
    ./ "$TARGET_DIR"/

echo "==> Disabling debug logging in dist JS"
find "$TARGET_DIR" -name '*.js' -type f -print0 | xargs -0 sed -i '' -E \
    -e 's/^const DBG = true;/const DBG = false;/'

echo "==> Syntax-checking dist JS"
find "$TARGET_DIR" -name '*.js' -type f -print0 | xargs -0 -n1 node -c

echo "==> Verifying modinfo at zip root"
[ -f "$TARGET_DIR/$MODINFO" ] || { echo "error: $TARGET_DIR/$MODINFO missing"; exit 1; }

echo "==> Zipping $ZIP_PATH"
( cd "$DIST_DIR" && zip -qr "$ZIP_NAME" history-and-rankings )

echo "==> Verifying zip contents against allow-list"
ALLOW='^history-and-rankings/(history-and-rankings\.modinfo|README\.md|LICENSE|CHANGELOG\.md)$'
ALLOW="$ALLOW"'|^history-and-rankings/ui/.+\.(js|html|css)$'
ALLOW="$ALLOW"'|^history-and-rankings/text/[a-z_]+/ModText\.xml$'
UNEXPECTED="$(unzip -Z1 "$ZIP_PATH" | grep -vE '/$' | grep -vE "$ALLOW" || true)"
if [ -n "$UNEXPECTED" ]; then
    echo "error: zip contains entries not on the allow-list:"
    echo "$UNEXPECTED" | sed 's/^/    /'
    exit 1
fi
echo "    OK: every shipped entry matches the allow-list."

SIZE="$(du -h "$ZIP_PATH" | cut -f1)"

# ── Steam Workshop upload assets ──────────────────────────────────────────
# Mirror the Demographics/Emigration release flow: render a 1024×1024 PNG
# preview from the branded card and emit workshop_item.vdf (+ a no-preview
# fallback) ready for steamcmd. Paths are absolute because steamcmd needs them.
SRC_DIR="$(pwd)"
WORKSHOP_ID_FILE="steam_workshop_id.txt"
PUBLISHED_FILE_ID=""
[ -f "$WORKSHOP_ID_FILE" ] && PUBLISHED_FILE_ID="$(tr -d '[:space:]' < "$WORKSHOP_ID_FILE")"

PREVIEW_SRC="$SRC_DIR/docs/workshop-preview.svg"
PREVIEW_OUT="$DIST_DIR/preview.png"
if [ -f "$PREVIEW_SRC" ]; then
    if command -v rsvg-convert >/dev/null 2>&1; then
        rsvg-convert -w 1024 -h 1024 "$PREVIEW_SRC" -o "$PREVIEW_OUT"
        echo "==> Workshop preview rendered:  $PREVIEW_OUT  (from $(basename "$PREVIEW_SRC"))"
    else
        echo "==> rsvg-convert not found; preview.png NOT generated."
        echo "    Install with:  brew install librsvg"
    fi
fi

VDF_PATH="$DIST_DIR/workshop_item.vdf"
VDF_NOPREVIEW_PATH="$DIST_DIR/workshop_item_no_preview.vdf"
ABS_CONTENT="$(cd "$TARGET_DIR" && pwd)"
ABS_PREVIEW=""
[ -f "$PREVIEW_OUT" ] && ABS_PREVIEW="$(cd "$DIST_DIR" && pwd)/preview.png"

# Description: the Workshop page body (BBCode). Read from the full description
# card docs/steam-workshop-description.md (same two-file convention as the
# Demographics/Emigration mods: a full and a -short companion). Newlines are
# collapsed to spaces and the string is escaped for the VDF. Omitted if absent
# (steamcmd then leaves the existing page description untouched).
DESCRIPTION=""
DESCRIPTION_FILE="$SRC_DIR/docs/steam-workshop-description.md"
if [ -f "$DESCRIPTION_FILE" ]; then
    DESCRIPTION="$(tr '\n' ' ' < "$DESCRIPTION_FILE" \
        | sed -E 's/  +/ /g; s/^ //; s/ $//; s/\\/\\\\/g; s/"/\\"/g')"
fi

# Change note: pull the current version's bullets out of CHANGELOG.md as BBCode.
CHANGELOG_FILE="$SRC_DIR/CHANGELOG.md"
CHANGENOTE="v${VERSION} release."
VERSION_RE="$(printf '%s' "$VERSION" | sed -E 's/[][(){}.^$*+?|\\]/\\&/g')"
if [ -f "$CHANGELOG_FILE" ]; then
    BULLETS="$(awk -v verre="$VERSION_RE" '
        function flush() { if (cur != "") { print cur; cur = "" } }
        $0 ~ ("^## \\[" verre "\\]") { grab = 1; next }
        grab && /^## / { flush(); exit }
        !grab { next }
        /^###/ { next }
        /^[[:space:]]*[-*][[:space:]]+/ {
            flush(); line = $0
            sub(/^[[:space:]]*[-*][[:space:]]+/, "", line); cur = line; next
        }
        /^[[:space:]]*$/ { next }
        cur != "" { line = $0; sub(/^[[:space:]]+/, "", line); cur = cur " " line }
        END { flush() }
    ' "$CHANGELOG_FILE" | sed -E 's/^/[*]/; s/\*\*//g; s/`//g' | tr '\n' ' ')"
    if [ -n "$BULLETS" ]; then
        CHANGENOTE="$(printf '[b]v%s[/b] [list]%s[/list]' "$VERSION" "$BULLETS" \
            | sed -E 's/\\/\\\\/g; s/"/\\"/g')"
    fi
fi

write_workshop_vdf() {
    local out_path="$1"
    local include_preview="$2"
    cat > "$out_path" <<EOF
"workshopitem"
{
    "appid"          "1295660"
EOF
    [ -n "$PUBLISHED_FILE_ID" ] && echo "    \"publishedfileid\" \"$PUBLISHED_FILE_ID\"" >> "$out_path"
    echo "    \"contentfolder\"  \"$ABS_CONTENT\"" >> "$out_path"
    if [ "$include_preview" = "yes" ] && [ -n "$ABS_PREVIEW" ]; then
        echo "    \"previewfile\"    \"$ABS_PREVIEW\"" >> "$out_path"
    fi
    cat >> "$out_path" <<EOF
    "visibility"     "0"
    "title"          "History & Rankings"
EOF
    [ -n "$DESCRIPTION" ] && echo "    \"description\"    \"$DESCRIPTION\"" >> "$out_path"
    echo "    \"changenote\"     \"${CHANGENOTE}\"" >> "$out_path"
    if [ -z "$PUBLISHED_FILE_ID" ]; then
        cat >> "$out_path" <<EOF
    // First upload: steamcmd prints a publishedfileid on success. Save it so
    // re-runs UPDATE the existing item:  echo <id> > steam_workshop_id.txt
EOF
    fi
    echo "}" >> "$out_path"
}

write_workshop_vdf "$VDF_PATH" yes
write_workshop_vdf "$VDF_NOPREVIEW_PATH" no
echo "==> Workshop manifest written: $VDF_PATH"
echo "==> Workshop no-preview manifest written: $VDF_NOPREVIEW_PATH"
if [ -n "$PUBLISHED_FILE_ID" ]; then
    echo "    UPDATE mode: publishedfileid $PUBLISHED_FILE_ID (existing item)"
else
    echo "    NEW-ITEM mode: no publishedfileid yet (first upload creates one)"
fi

echo ""
echo "✓ Release built:  $ZIP_PATH  ($SIZE)"
echo "  Version:        $VERSION"
echo "  Authors:        $AUTHORS"
echo ""
echo "── Upload to Steam Workshop ──"
echo "  ~/steamcmd/steamcmd.sh +login <yourSteamLogin> \\"
echo "      +workshop_build_item $(cd "$DIST_DIR" && pwd)/workshop_item.vdf +quit"
echo "  (If Steam rejects the preview with Access Denied, use workshop_item_no_preview.vdf"
echo "   and set the image manually on the Workshop page.)"
