# MapDraw - Automated Tests

## Overview

This test framework validates import and export round-trips for MapDraw. For each file format, it:

1. **Imports** the test file
2. **Validates** that imported features match expected data
3. **Exports** the imported data to every format MapDraw can write (GeoJSON, GPX, KML)
4. **Re-imports** each exported file and validates it again

Results are displayed side-by-side showing both import and export validation.

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

5. Click "Run All Tests"

## File Structure

```
tests/
├── index.html                    # Main test page
├── README.md                     # This file
├── css/
│   └── test-styles.css          # Styles for the test UI
├── js/
│   ├── export-capture.js        # Captures export output for testing
│   ├── test-validators.js       # Feature validation logic
│   ├── test-ui.js               # UI rendering functions
│   └── test-runner.js           # Test orchestration
└── test-files/
    └── 01-standard-shapes/      # First test suite
        ├── test-config.json     # Test configuration
        ├── test-standard.geojson
        ├── test-standard.gpx
        ├── test-standard.kml
        └── test-standard.kmz
```

## Test Suites

Each test suite is a folder in `test-files/` containing:

- **test-config.json** - Defines expected features and which files to test
- **Test files** - One file per format to test. The `01-standard-shapes` fixtures are verbatim MapDraw exports (see the KMZ note below), so the suite checks that MapDraw can read back exactly what it writes. They are excluded from Prettier via `.prettierignore` to keep them byte-identical.

### test-config.json Format

```json
{
  "name": "Standard Shapes",
  "description": "MapDraw exports of a marker, a path (with elevation) and an area, each in a distinct non-default color",
  "expectedFeatures": {
    "Marker": { "type": "Point", "color": "#36DB14" },
    "Path": { "type": "LineString", "color": "#AC3939" },
    "Area": { "type": "Polygon", "color": "#8FA2FF" }
  },
  "files": ["test-standard.geojson", "test-standard.gpx", "test-standard.kml", "test-standard.kmz"]
}
```

## What's Tested

### Import Validation

- Feature count matches expected
- Feature names are correct
- Geometry types are correct (with GPX polygon-as-LineString exception)
- Colors are preserved

### Export Validation

Each imported file is exported to **every format MapDraw can write** (GeoJSON, GPX,
KML), and each exported file is then re-imported through MapDraw's own import
function and validated again. Exports run through the real `exportGeoJson()`,
`exportGpx()` and `exportKml()`, captured by temporarily replacing
`downloadFile()` — the tests never reimplement export logic.

- All imported features are present in every exported format
- Geometry types survive the round-trip (with the GPX polygon exception below)
- Colors are preserved through the round-trip
- Failures are prefixed with the format that broke (e.g. `KML: "Area": ...`)

## Adding New Test Suites

1. Create a new folder in `test-files/` (e.g., `02-elevation-data/`)
2. Add a `test-config.json` with expected features
3. Add test files for each format you want to test
4. Update `discoverTestSuites()` in `test-runner.js` to include the new suite

## Known Limitations

- **GPX Feature Order**: toGeoJSON's `gpx()` always emits tracks, then routes, then waypoints, regardless of their order in the file. So GPX results list markers last. Whether that matches the other formats depends on the order the fixture happens to store its features in - it is cosmetic either way, since validation matches features by name, never by position.
- **GPX Polygons**: GPX format doesn't support native polygons. They are represented as closed LineStrings, so validation allows this type mismatch whenever GPX is either the source format or the export format.
- **KMZ Fixture**: MapDraw dropped KMZ export in favour of KML (commit `f5e3134`), so there is no KMZ export to use as a fixture. `test-standard.kmz` is `test-standard.kml` zipped as `doc.kml` - which is exactly what a KMZ is - so its payload is still a verbatim MapDraw export. KMZ is therefore covered on import only.
- **Dependency List**: `loadDependencies()` in `test-runner.js` hard-codes the app scripts and vendored library versions it loads. Renaming or version-bumping a dependency in MapDraw requires updating that list, or the suite fails to start.
