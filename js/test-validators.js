/**
 * Test Validators Module
 *
 * Feature extraction and comparison logic for validating
 * import/export round-trips.
 */

/**
 * Names a hex color using MapDraw's own CSS_COLOR_NAMES table, so a result reads
 * as "Crimson" rather than "#DC143C". Most colors have no CSS name and are shown
 * as their hex. Display only - comparisons use hex, because several names can
 * share one hex (aqua/cyan, gray/grey).
 *
 * @param {string} hex - Normalized uppercase hex color, as parseColor() returns
 * @returns {string} Capitalized CSS color name, or the hex if it has no name
 */
function hexToColorName(hex) {
  if (!hex) return "(none)";
  const name = Object.keys(CSS_COLOR_NAMES).find((key) => CSS_COLOR_NAMES[key] === hex);
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : hex;
}

/**
 * Extracts standardized feature data from a Leaflet layer.
 *
 * @param {L.Layer} layer - The Leaflet layer to extract data from
 * @returns {Object} Extracted feature data
 */
function extractFeatureData(layer) {
  // MapDraw keeps color in feature.properties.stroke (paths) or "marker-color"
  // (markers); getLayerColor() is the app's own accessor for that. It returns the
  // stored value verbatim, so normalize it - a file may store "#ac3939" lowercase,
  // or a CSS name, and everything below compares hex.
  const rawColor = getLayerColor(layer);
  const color = parseColor(rawColor) || rawColor;

  const data = {
    type: layer.feature?.geometry?.type || null,
    name: layer.feature?.properties?.name || "(unnamed)",
    description: layer.feature?.properties?.description || "",
    color: color,
    colorName: hexToColorName(color),
    pathType: layer.pathType || null,
    coordinates: null,
  };

  if (layer instanceof L.Marker) {
    const latlng = layer.getLatLng();
    data.coordinates = [latlng.lng, latlng.lat];
    if (typeof latlng.alt === "number") {
      data.coordinates.push(latlng.alt);
    }
  } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
    let latlngs = layer.getLatLngs();
    // Handle nested arrays
    while (Array.isArray(latlngs[0]) && latlngs[0].lat === undefined) {
      latlngs = latlngs[0];
    }
    data.coordinates = latlngs.map((latlng) => {
      const coord = [latlng.lng, latlng.lat];
      if (typeof latlng.alt === "number") coord.push(latlng.alt);
      return coord;
    });
  } else if (layer instanceof L.Polygon) {
    const outerRing = layer.getLatLngs()[0];
    data.coordinates = [
      outerRing.map((latlng) => {
        const coord = [latlng.lng, latlng.lat];
        if (typeof latlng.alt === "number") coord.push(latlng.alt);
        return coord;
      }),
    ];
  }

  return data;
}

/**
 * Validates extracted features against expected features.
 *
 * @param {Object[]} features - Array of extracted feature data
 * @param {Object} expected - Expected features object (keyed by name)
 * @param {Object} options - Validation options
 * @param {boolean} options.allowGpxPolygonAsLineString - Allow GPX polygons as LineStrings
 * @returns {Object} Validation result with passed status and issues array
 */
function validateFeatures(features, expected, options = {}) {
  const { allowGpxPolygonAsLineString = false } = options;

  const result = {
    passed: true,
    issues: [],
    featureResults: {},
  };

  const expectedNames = Object.keys(expected);
  const foundFeatures = {};

  // Check each imported feature
  features.forEach((feature) => {
    const name = feature.name;
    const expectedFeature = expected[name];

    if (!expectedFeature) {
      result.issues.push(`Unexpected feature: "${name}"`);
      result.passed = false;
      return;
    }

    foundFeatures[name] = true;
    const featureResult = {
      name: name,
      found: true,
      typeMatch: false,
      colorMatch: false,
      issues: [],
    };

    // Check geometry type
    // GPX doesn't support native polygons - they're represented as closed LineStrings
    const isGpxPolygonException =
      allowGpxPolygonAsLineString &&
      expectedFeature.type === "Polygon" &&
      feature.type === "LineString";

    if (feature.type === expectedFeature.type || isGpxPolygonException) {
      featureResult.typeMatch = true;
    } else {
      featureResult.issues.push(
        `Type mismatch: expected ${expectedFeature.type}, got ${feature.type}`,
      );
      result.issues.push(`"${name}": Expected type ${expectedFeature.type}, got ${feature.type}`);
      result.passed = false;
    }

    // Check color. The expected value goes through the app's parseColor() too, so
    // test-config may state either a hex ("#AC3939") or a CSS name ("crimson").
    const expectedColor = parseColor(expectedFeature.color);
    if (expectedColor && parseColor(feature.color) === expectedColor) {
      featureResult.colorMatch = true;
    } else {
      featureResult.issues.push(
        `Color mismatch: expected ${expectedFeature.color}, got ${feature.colorName}`,
      );
      result.issues.push(
        `"${name}": Expected color ${expectedFeature.color}, got ${feature.colorName}`,
      );
      result.passed = false;
    }

    featureResult.valid = featureResult.typeMatch && featureResult.colorMatch;
    result.featureResults[name] = featureResult;
  });

  // Check for missing features
  expectedNames.forEach((name) => {
    if (!foundFeatures[name]) {
      result.issues.push(`Missing feature: "${name}"`);
      result.passed = false;
      result.featureResults[name] = {
        name: name,
        found: false,
        valid: false,
        issues: ["Feature not found"],
      };
    }
  });

  // Check feature count
  if (features.length !== expectedNames.length) {
    result.issues.push(
      `Feature count mismatch: expected ${expectedNames.length}, got ${features.length}`,
    );
  }

  return result;
}

// Export for module use
if (typeof window !== "undefined") {
  window.TestValidators = {
    extractFeatureData,
    validateFeatures,
  };
}
