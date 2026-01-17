# OpenMapEditor - Automated Tests

## Overview

This test framework validates import and export round-trips for OpenMapEditor. For each file format, it:

1. **Imports** the test file
2. **Validates** that imported features match expected data
3. **Exports** the imported data to GeoJSON
4. **Validates** that exported features match expected data

Results are displayed side-by-side showing both import and export validation.

## Setup

1. **Start OpenMapEditor web server**:

   ```bash
   cd /path/to/openmapeditor
   python3 -m http.server 5500
   ```

   Alternatively, use VS Code Live Server extension (port 5500 by default)

2. **Start test server**:

   ```bash
   cd /path/to/openmapeditor-test-data
   python3 -m http.server 8000
   ```

3. **Open in browser**:

   ```
   http://localhost:8000/automated-tests/
   ```

   (Note: Use your actual server address and ports if different)

4. Verify the server URL in the configuration matches your OpenMapEditor server

5. Click "Run All Tests"

## File Structure

```
automated-tests/
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
- **Test files** - One file per format to test

### test-config.json Format

```json
{
  "name": "Standard Shapes",
  "description": "Tests basic marker, path, and polygon with standard colors",
  "expectedFeatures": {
    "Test Marker": { "type": "Point", "color": "Red" },
    "Test Path": { "type": "LineString", "color": "Blue" },
    "Test Polygon": { "type": "Polygon", "color": "Green" }
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

- All imported features are present in export
- Geometry types are correct in GeoJSON output
- Colors are preserved through round-trip

## Adding New Test Suites

1. Create a new folder in `test-files/` (e.g., `02-elevation-data/`)
2. Add a `test-config.json` with expected features
3. Add test files for each format you want to test
4. Update `discoverTestSuites()` in `test-runner.js` to include the new suite

## Known Limitations

- **GPX Polygons**: GPX format doesn't support native polygons. They are represented as closed LineStrings, so the import validation allows this type mismatch.
- **Export Format**: Currently all exports are validated as GeoJSON (the canonical format). Cross-format export testing (e.g., import GPX → export GPX) is not yet implemented.
