/**
 * Test Validators Module
 *
 * Feature extraction and comparison logic for validating
 * import/export round-trips.
 */

/**
 * Extracts standardized feature data from a Leaflet layer.
 *
 * @param {L.Layer} layer - The Leaflet layer to extract data from
 * @returns {Object} Extracted feature data
 */
function extractFeatureData(layer) {
  const data = {
    type: layer.feature?.geometry?.type || null,
    name: layer.feature?.properties?.name || "(unnamed)",
    description: layer.feature?.properties?.description || "",
    colorName: layer.feature?.properties?.colorName || "Red",
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
 * Extracts features from all layers in a feature group.
 *
 * @param {L.FeatureGroup} featureGroup - The feature group containing layers
 * @returns {Object[]} Array of extracted feature data
 */
function extractFeaturesFromLayers(featureGroup) {
  const features = [];
  featureGroup.eachLayer((layer) => {
    features.push(extractFeatureData(layer));
  });
  return features;
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

    // Check color
    if (feature.colorName === expectedFeature.color) {
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

/**
 * Compares imported features with exported features.
 *
 * @param {Object[]} importedFeatures - Features extracted from import
 * @param {Object[]} exportedFeatures - Features extracted from export
 * @returns {Object} Comparison result with differences
 */
function compareImportExport(importedFeatures, exportedFeatures) {
  const result = {
    match: true,
    differences: [],
  };

  // Create lookup by name
  const importedByName = {};
  importedFeatures.forEach((f) => {
    importedByName[f.name] = f;
  });

  const exportedByName = {};
  exportedFeatures.forEach((f) => {
    exportedByName[f.name] = f;
  });

  // Check each imported feature has matching export
  Object.keys(importedByName).forEach((name) => {
    const imported = importedByName[name];
    const exported = exportedByName[name];

    if (!exported) {
      result.match = false;
      result.differences.push({
        feature: name,
        issue: "Missing from export",
      });
      return;
    }

    // Compare type
    if (imported.type !== exported.type) {
      result.match = false;
      result.differences.push({
        feature: name,
        issue: `Type changed: ${imported.type} -> ${exported.type}`,
      });
    }

    // Compare color
    if (imported.colorName !== exported.colorName) {
      result.match = false;
      result.differences.push({
        feature: name,
        issue: `Color changed: ${imported.colorName} -> ${exported.colorName}`,
      });
    }
  });

  // Check for extra features in export
  Object.keys(exportedByName).forEach((name) => {
    if (!importedByName[name]) {
      result.match = false;
      result.differences.push({
        feature: name,
        issue: "Extra feature in export",
      });
    }
  });

  return result;
}

/**
 * Creates a feature summary for display.
 *
 * @param {Object} feature - Extracted feature data
 * @returns {string} Human-readable summary
 */
function formatFeatureSummary(feature) {
  const typeShort = {
    Point: "Point",
    LineString: "Line",
    Polygon: "Poly",
  };
  return `${feature.name} (${typeShort[feature.type] || feature.type}, ${feature.colorName})`;
}

/**
 * Validates that exported GeoJSON matches expected structure.
 *
 * @param {Object} geojson - The exported GeoJSON
 * @param {Object} expected - Expected features
 * @returns {Object} Validation result
 */
function validateExportedGeoJson(geojson, expected) {
  if (!geojson || geojson.type !== "FeatureCollection") {
    return {
      passed: false,
      issues: ["Invalid GeoJSON: not a FeatureCollection"],
      featureResults: {},
    };
  }

  const features = geojson.features.map((f) => ({
    type: f.geometry.type,
    name: f.properties.name || "(unnamed)",
    colorName: f.properties.colorName || "Red",
  }));

  return validateFeatures(features, expected);
}

// Export for module use
if (typeof window !== "undefined") {
  window.TestValidators = {
    extractFeatureData,
    extractFeaturesFromLayers,
    validateFeatures,
    compareImportExport,
    formatFeatureSummary,
    validateExportedGeoJson,
  };
}
