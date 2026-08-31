#!/bin/bash
# Validates MapDraw files against the official format specifications:
#   .gpx     -> schemas/gpx.xsd (GPX 1.1, via xmllint)
#   .kml     -> schemas/ogckml22.xsd (OGC KML 2.2, via xmllint)
#   .geojson -> rfc7946-check.py (RFC 7946 structural rules)
#   .kmz/.zip -> unpacked, every contained file of the types above is validated
#
# Usage: ./validate-exports.sh <file, directory or .zip> ...
#   e.g. ./validate-exports.sh ~/Downloads/mapdraw-test-exports.zip
#        (the zip from the test page's "Download Exports" button)
#
# Exit code 0 when every file is valid.
set -euo pipefail
cd "$(dirname "$0")"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <file, directory or .zip> ..." >&2
  exit 2
fi

fail=0
tmpdirs=()
trap 'rm -rf "${tmpdirs[@]:-}"' EXIT

xsd() {
  local schema=$1 file=$2 output
  if output=$(xmllint --noout --nonet --schema "schemas/$schema" "$file" 2>&1); then
    echo "✓ $file"
  else
    fail=1
    echo "✗ $file"
    echo "$output" | sed 's/^/    /'
  fi
}

validate_file() {
  case "$1" in
    *.gpx) xsd gpx.xsd "$1" ;;
    *.kml) xsd ogckml22.xsd "$1" ;;
    *.geojson) ./rfc7946-check.py "$1" || fail=1 ;;
    *.kmz | *.zip) unpack_and_walk "$1" ;;
  esac
}

walk() {
  local entry
  while IFS= read -r -d '' entry; do
    validate_file "$entry"
  done < <(find "$1" -type f \( -name "*.gpx" -o -name "*.kml" -o -name "*.geojson" -o -name "*.kmz" \) -print0)
}

unpack_and_walk() {
  local archive=$1 tmp
  tmp=$(mktemp -d)
  tmpdirs+=("$tmp")
  echo "• $archive contains:"
  unzip -q "$archive" -d "$tmp"
  walk "$tmp"
}

for target in "$@"; do
  if [[ -d $target ]]; then
    walk "$target"
  else
    validate_file "$target"
  fi
done

if [[ $fail -eq 0 ]]; then
  echo "All files valid."
else
  echo "Validation failures found." >&2
fi
exit $fail
