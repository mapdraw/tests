/**
 * Self-test for js/test-validators.js, runnable without a browser:
 *
 *   node selftest/validator-selftest.js
 *
 * Loads the app's real color-utils.js (for parseColor/CSS_COLOR_NAMES) and the
 * validator into a bare VM context, then checks that validateFeatures() accepts
 * what it must accept and - just as important - rejects what it must reject.
 * A validator that never fails would make every suite pass; this guards it.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const testsRoot = path.join(__dirname, "..");
const colorUtilsPath = path.join(testsRoot, "..", "mapdraw", "js", "color-utils.js");
if (!fs.existsSync(colorUtilsPath)) {
  console.error(
    `App script not found: ${colorUtilsPath} (expected the mapdraw app next to tests/)`,
  );
  process.exit(2);
}

// The validator only touches L/getLayerColor/flattenRingPoints inside
// extractFeatureData(), which needs a live Leaflet layer and is exercised by
// the browser suites instead - so the context stays bare.
const context = { window: {}, console };
vm.createContext(context);
for (const file of [colorUtilsPath, path.join(testsRoot, "js", "test-validators.js")]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
const { validateFeatures } = context.window.TestValidators;

/** Actual feature as extractFeatureData() returns it. */
const actual = (name, type, color, coordinates, description = "") => {
  return { name, type, color, colorName: color, description, coordinates };
};

/** Expected feature as test-config.json states it. */
const expected = (name, type, color, coordinates, description) => {
  return { name, type, color, coordinates, ...(description && { description }) };
};

let failures = 0;
const check = (label, result, wantPassed, wantIssue) => {
  const ok =
    result.passed === wantPassed &&
    (!wantIssue || result.issues.some((i) => i.includes(wantIssue)));
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` -> ${JSON.stringify(result.issues)}`}`,
  );
  if (!ok) failures++;
};

const closedRing = [
  [8.5, 47.3],
  [8.6, 47.3],
  [8.6, 47.32],
  [8.5, 47.3],
];
const openReversedRing = [
  [8.6, 47.32],
  [8.6, 47.3],
  [8.5, 47.3],
];

check(
  "exact match, color as CSS name",
  validateFeatures(
    [actual("A", "Point", "#DC143C", [8, 47])],
    [expected("A", "Point", "crimson", [8, 47])],
  ),
  true,
);
check(
  "open reversed ring matches closed expected ring",
  validateFeatures(
    [actual("P", "Polygon", "#111111", [openReversedRing])],
    [expected("P", "Polygon", "#111111", [closedRing])],
  ),
  true,
);
check(
  "GPX polygon as closed LineString accepted with the exception",
  validateFeatures(
    [actual("P", "LineString", "#111111", closedRing)],
    [expected("P", "Polygon", "#111111", [closedRing])],
    {
      allowGpxPolygonAsLineString: true,
    },
  ),
  true,
);
check(
  "polygon as LineString rejected without the exception",
  validateFeatures(
    [actual("P", "LineString", "#111111", closedRing)],
    [expected("P", "Polygon", "#111111", [closedRing])],
  ),
  false,
  "type: expected Polygon",
);
check(
  "altitude 0 tolerated when none expected (KML always writes one)",
  validateFeatures(
    [actual("A", "Point", "#111111", [8, 47, 0])],
    [expected("A", "Point", "#111111", [8, 47])],
  ),
  true,
);
check(
  "altitude 5 rejected when none expected",
  validateFeatures(
    [actual("A", "Point", "#111111", [8, 47, 5])],
    [expected("A", "Point", "#111111", [8, 47])],
  ),
  false,
  "elevation differs",
);
check(
  "missing altitude rejected when one is expected",
  validateFeatures(
    [actual("A", "Point", "#111111", [8, 47])],
    [expected("A", "Point", "#111111", [8, 47, 5])],
  ),
  false,
  "elevation differs",
);
check(
  "wrong longitude rejected",
  validateFeatures(
    [actual("A", "Point", "#111111", [8.1, 47])],
    [expected("A", "Point", "#111111", [8, 47])],
  ),
  false,
  "coordinates differ",
);
check(
  "different point count rejected",
  validateFeatures(
    [
      actual("L", "LineString", "#111111", [
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
    ],
    [
      expected("L", "LineString", "#111111", [
        [1, 1],
        [2, 2],
      ]),
    ],
  ),
  false,
  "coordinates differ",
);
check(
  "color mismatch rejected",
  validateFeatures(
    [actual("A", "Point", "#FF0000", [8, 47])],
    [expected("A", "Point", "#DC143C", [8, 47])],
  ),
  false,
  "color: expected #DC143C",
);
check(
  "AARRGGBB expected color compares by its RGB part",
  validateFeatures(
    [actual("A", "Point", "#FF00FF", [8, 47])],
    [expected("A", "Point", "#80FF00FF", [8, 47])],
  ),
  true,
);
check(
  "unexpected description rejected",
  validateFeatures(
    [actual("A", "Point", "#111111", [8, 47], "x")],
    [expected("A", "Point", "#111111", [8, 47])],
  ),
  false,
  'description: expected ""',
);
check(
  "multi-line description compared verbatim",
  validateFeatures(
    [actual("A", "Point", "#111111", [8, 47], "Line 1\nLine 2")],
    [expected("A", "Point", "#111111", [8, 47], "Line 1\nLine 2")],
  ),
  true,
);
check(
  "same name on different types pairs by type (Organic Maps)",
  validateFeatures(
    [
      actual("Red", "LineString", "#E51B23", [
        [1, 1],
        [2, 2],
      ]),
      actual("Red", "Point", "#E51B23", [8, 47]),
    ],
    [
      expected("Red", "Point", "#E51B23", [8, 47]),
      expected("Red", "LineString", "#E51B23", [
        [1, 1],
        [2, 2],
      ]),
    ],
  ),
  true,
);
check(
  "identical name and type pair by geometry regardless of order",
  validateFeatures(
    [actual("Marker", "Point", "#111111", [2, 2]), actual("Marker", "Point", "#111111", [1, 1])],
    [
      expected("Marker", "Point", "#111111", [1, 1]),
      expected("Marker", "Point", "#111111", [2, 2]),
    ],
  ),
  true,
);
check(
  "duplicated feature rejected as unexpected",
  validateFeatures(
    [actual("A", "Point", "#111111", [8, 47]), actual("A", "Point", "#111111", [8, 47])],
    [expected("A", "Point", "#111111", [8, 47])],
  ),
  false,
  "unexpected feature",
);
check(
  "missing feature rejected",
  validateFeatures([], [expected("A", "Point", "#111111", [8, 47])]),
  false,
  'missing feature: "A" (Point)',
);
check(
  "expected feature without coordinates skips the geometry comparison",
  validateFeatures(
    [actual("A", "Point", "#111111", [1, 2])],
    [{ name: "A", type: "Point", color: "#111111" }],
  ),
  true,
);

console.log(failures === 0 ? "\nSelf-test passed." : `\nSelf-test FAILED: ${failures} check(s).`);
process.exit(failures === 0 ? 0 : 1);
