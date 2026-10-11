#!/usr/bin/env bash
# Fetch the globe's Earth textures from NASA GIBS and write self-hosted WebP (#47).
#
# Both layers are static composites (Blue Marble shaded relief, VIIRS Black Marble),
# so they are self-hosted rather than fetched at runtime (Codex finding 5): no NASA
# dependency for first paint, and they cache on Pages. One-shot EPSG:4326 WMS
# requests return a seamless 2:1 equirectangular image. Re-run only to refresh.
#
# Every download is checked to be a real JPEG of the requested size: a GIBS error
# comes back as an XML ServiceException or a smaller image with HTTP 200, and a
# font once shipped for months as a saved 404 page (see CLAUDE.md).
set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/public/textures"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

WMS='https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180'

fetch() { # layer width name quality
  local layer="$1" width="$2" name="$3" quality="$4"
  local height=$((width / 2))
  local jpg="$TMP/$name.jpg"
  curl -fsS -o "$jpg" "$WMS&LAYERS=$layer&WIDTH=$width&HEIGHT=$height"
  if [ "$(head -c 3 "$jpg" | xxd -p)" != "ffd8ff" ]; then
    echo "FAIL $name: not a JPEG (GIBS error?)" >&2
    head -c 300 "$jpg" >&2
    exit 1
  fi
  local dims
  dims="$(sips -g pixelWidth -g pixelHeight "$jpg" | awk '/pixel/ {print $2}' | paste -sd x -)"
  if [ "$dims" != "${width}x${height}" ]; then
    echo "FAIL $name: got $dims, expected ${width}x${height}" >&2
    exit 1
  fi
  cwebp -quiet -q "$quality" -m 6 "$jpg" -o "$OUT/$name.webp"
  echo "ok $name.webp $(wc -c < "$OUT/$name.webp" | tr -d ' ') bytes ($dims)"
}

fetch BlueMarble_ShadedRelief_Bathymetry 4096 day-4096 80
fetch BlueMarble_ShadedRelief_Bathymetry 2048 day-2048 80
fetch VIIRS_Black_Marble 4096 night-4096 75
fetch VIIRS_Black_Marble 2048 night-2048 75
