# MapDraw - Automated Tests

## Overview

This test framework validates import and export round-trips for MapDraw. For each file of each test suite, it:

1. **Imports** the file through MapDraw's own import function
2. **Validates** the imported features against the suite's expected features
3. **Exports** them to every format MapDraw can write (GeoJSON, GPX, KML)
4. **Re-imports** each exported file and validates it again

Results are displayed side by side: the imported features next to each export format's re-imported features.

## Setup

1. **Start MapDraw web server**:

   ```bash
   cd /path/to/mapdraw
   python3 -m http.server 5500
   ```

   Alternatively, use VS Code Live Server extension (port 5500 by default)

2. **Start test server**:

   ```bash
   cd /path/to/mapdraw/tests
   python3 -m http.server 8000
   ```

3. **Open in browser**:

   ```
   http://localhost:8000/
   ```

   (Note: Use your actual server address and ports if different)

4. Verify the server URL in the configuration matches your MapDraw server

5. Click "Run All Tests" (or open `http://localhost:8000/?autorun` to start immediately)

## File Structure

```
tests/
├── index.html                    # Main test page
├── README.md                     # This file
├── validate-exports.sh           # Schema validation via xmllint (see below)
├── rfc7946-check.py              # GeoJSON validation per RFC 7946
├── schemas/                      # Vendored GPX 1.1 and OGC KML 2.2 schemas
├── selftest/
│   └── validator-selftest.js     # Node self-test for the validator logic
├── css/
│   └── test-styles.css           # Styles for the test UI
├── js/
│   ├── export-capture.js         # Captures export output for testing
│   ├── test-validators.js        # Feature validation logic
│   ├── test-ui.js                # UI rendering functions
│   └── test-runner.js            # Test orchestration
└── test-files/
    ├── suites.json               # The suites to run, in order
    └── <suite>/                  # One folder per suite
        ├── test-config.json      # Expected features and the files to test
        └── ...                   # The test files
```

## Test Suites

| Suite                               | Files                  | What it covers                                                                                                                                                                   |
| ----------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-standard-shapes`                | GeoJSON, GPX, KML, KMZ | Verbatim MapDraw exports of a marker, a path with elevation and an area - MapDraw reads back exactly what it writes                                                              |
| `02-geometry-primitives`            | GeoJSON, GPX, KML      | Paths, areas and markers with and without elevation, a self-intersecting area, everything in the default color                                                                   |
| `03-multi-geometries`               | GeoJSON, KML           | MultiLineString, MultiPolygon, MultiPoint and a mixed GeometryCollection / KML MultiGeometry, exploded into single features named after the parent                               |
| `04-multi-segment-gpx`              | GPX                    | A track with three segments explodes into three paths; uncolored waypoints get the default color                                                                                 |
| `05-nested-geojson-geometries`      | GeoJSON                | A polygon with a hole (one area per ring), a GeometryCollection holding a MultiLineString, an unnamed MultiPoint                                                                 |
| `06-geojson-color-keys`             | GeoJSON                | CSS names, 3-/6-/8-digit and lowercase hex, the non-standard `color` key, conflicting `stroke`/`marker-color` keys                                                               |
| `07-gpx-colors`                     | GPX                    | Colors on a waypoint, a route and tracks, as `#RRGGBB` and `AARRGGBB`, in a file without an XML namespace                                                                        |
| `08-kml-placemark-without-geometry` | KML                    | Description-only placemarks between real ones; colors from a shared Style, a StyleMap, an inline IconStyle, an icon URL; MultiGeometry parts keep the placemark's color          |
| `09-organicmaps-bookmark-colors`    | GeoJSON, GPX, KMZ      | Real Organic Maps exports of one bookmark and one track in each of its 16 colors; the default red bookmark is a special case in the GeoJSON (`"red"`) and GPX (no color) exports |
| `10-xml-escaping`                   | GeoJSON, GPX, KML      | Names and descriptions with `& < > " '`, a line break, non-ASCII text and an emoji                                                                                               |

The `01-standard-shapes` fixtures are verbatim MapDraw exports (see the KMZ note below). Most other fixtures come from the `test-data` repository; `03`'s GeoJSON has its color keys corrected, `05` and `06` merge several small files into one, and `10` is hand-written in MapDraw's own export format. All fixtures are excluded from Prettier via `.prettierignore`.

### test-config.json Format

```json
{
  "name": "Organic Maps Bookmark Colors",
  "description": "What the suite covers",
  "expectedFeatures": [
    {
      "name": "Red",
      "type": "Point",
      "color": "#E51B23",
      "description": "optional, defaults to empty",
      "coordinates": [8.085938, 47.439235]
    }
  ],
  "files": [
    "organicmaps-bookmark-colors.kmz",
    {
      "file": "organicmaps-bookmark-colors.gpx",
      "overrides": [{ "name": "Red", "type": "Point", "color": "#DC143C" }]
    }
  ]
}
```

- `expectedFeatures` is what every file in the suite must import to. `type` is `Point`, `LineString` or `Polygon`. `color` may be a hex or a CSS name. `coordinates` use GeoJSON shapes: `[lng, lat(, alt)]` for a point, a list of those for a line, `[ring]` for a polygon (closed or not).
- A file entry is a bare filename, or `{ "file", "overrides" }` when that file's features deviate from the shared expectations. An override names a feature by `name` and `type` and replaces the fields it lists; one that matches no expected feature fails the file.

## What's Tested

Import and every export round-trip are validated the same way:

- Every imported feature pairs with exactly one expected feature of the same name and type, and every expected feature is found - so a dropped, duplicated or unexpected feature fails
- Color
- Description (empty unless the config gives one)
- Coordinates, including elevation, when the config gives them. Rings compare open and in either direction (see below)

Exports run through the real `exportGeoJson()`, `exportGpx()` and `exportKml()`, captured by temporarily replacing `downloadFile()` - the tests never reimplement export logic. Each exported file is re-imported through MapDraw's own importer, and the "Show details" toggle shows the exact file each export produced.

## Schema Validation

Round-trips prove MapDraw can read what it writes; schema validation proves other
software will accept it. After a run, **Download Exports (.zip)** saves every file the
exports produced (one `<suite>/<source file>/export.<ext>` entry per export). Validate it with:

```bash
./validate-exports.sh ~/Downloads/mapdraw-test-exports.zip
```

The script checks `.gpx` against GPX 1.1 (`schemas/gpx.xsd`), `.kml` against OGC
KML 2.2 (`schemas/ogckml22.xsd`) via `xmllint --nonet`, and `.geojson` against the
structural rules of [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946)
(`rfc7946-check.py`: position arity and ranges, ring closure, right-hand rule).
It also takes plain files, directories and `.kmz` archives - see `schemas/README.md`
for the vendored schema sources.

## Harness Self-Test

The validator itself is guarded by a Node self-test (no browser or server needed):

```bash
node selftest/validator-selftest.js
```

It loads the app's real `color-utils.js` plus `js/test-validators.js` and checks that
`validateFeatures()` accepts what it must and rejects what it must - a validator that
never fails would make every suite pass.

## Adding New Test Suites

1. Create a new folder in `test-files/`
2. Add a `test-config.json` with the expected features and the files to test
3. Add the test files
4. List the folder in `test-files/suites.json`

## Known Limitations

- **GPX Feature Order**: toGeoJSON's `gpx()` always emits tracks, then routes, then waypoints, regardless of their order in the file, and MapDraw's GPX export writes waypoints first. Cosmetic either way: validation pairs features by name and type, never by position.
- **GPX Polygons**: GPX has no polygon type, so an area is written as a closed track and comes back as a LineString. Validation allows this type change whenever GPX is the source or the export format, and compares the closed track against the expected ring.
- **Ring Direction**: MapDraw's GeoJSON export rewinds clockwise rings counterclockwise (RFC 7946), so rings compare in either direction.
- **Altitude 0**: KML has no way to leave the altitude out - every coordinate carries one, 0 when unknown. Organic Maps and Google Earth write it, and so does MapDraw's KML export, so after a KML round-trip a feature without elevation has elevation 0 everywhere. An expected position without altitude therefore accepts an actual altitude of 0 (or none).
- **Exploded Feature Names**: a Multi\* member nested in a GeometryCollection is named with the raw geometry type, e.g. `Trail network (MultiLineString) (Path)`; suite `05` locks that in as current behavior.
- **KMZ Fixture**: MapDraw dropped KMZ export in favour of KML (commit `f5e3134`), so there is no KMZ export to use as a fixture. `01`'s `test-standard.kmz` is `test-standard.kml` zipped as `doc.kml` - which is exactly what a KMZ is - so its payload is still a verbatim MapDraw export. KMZ is covered on import only (`01` and `09`).
- **Dependency List**: `loadDependencies()` in `test-runner.js` hard-codes the app scripts and vendored library versions it loads. Renaming or version-bumping a dependency in MapDraw requires updating that list, or the suite fails to start.
