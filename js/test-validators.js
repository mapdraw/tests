/**
 * Test Validators Module
 *
 * Feature extraction and comparison logic for validating
 * import/export round-trips.
 */

/** Largest longitude/latitude/altitude difference still treated as equal. */
const COORD_TOLERANCE = 1e-7;

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
 * Coordinates use GeoJSON shapes: [lng, lat(, alt)] for a marker, a list of
 * those for a path, and [ring] for an area. Leaflet drops a ring's closing
 * point, so the ring is open.
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
  const toCoord = (ll) =>
    typeof ll.alt === "number" ? [ll.lng, ll.lat, ll.alt] : [ll.lng, ll.lat];

  let coordinates = null;
  if (layer instanceof L.Marker) {
    coordinates = toCoord(layer.getLatLng());
  } else if (layer instanceof L.Polygon) {
    coordinates = [layer.getLatLngs()[0].map(toCoord)];
  } else if (layer instanceof L.Polyline) {
    coordinates = flattenRingPoints(layer.getLatLngs()).map(toCoord);
  }

  return {
    type: layer.feature?.geometry?.type || null,
    name: layer.feature?.properties?.name || "(unnamed)",
    description: layer.feature?.properties?.description || "",
    color: color,
    colorName: hexToColorName(color),
    coordinates: coordinates,
  };
}

/**
 * Whether two [lng, lat(, alt)] positions are equal.
 *
 * KML has no way to leave the altitude out: every coordinate carries one, 0 when
 * unknown - Organic Maps and Google Earth write it, and so does MapDraw's own KML
 * export. An expected position without altitude therefore accepts an actual one
 * whose altitude is absent or 0.
 *
 * @param {number[]} expected - Expected position
 * @param {number[]} actual - Actual position
 * @param {boolean} ignoreAltitude - Compare longitude and latitude only
 * @returns {boolean}
 */
function positionsMatch(expected, actual, ignoreAltitude) {
  const close = (a, b) => Math.abs(a - b) <= COORD_TOLERANCE;
  if (!close(expected[0], actual[0]) || !close(expected[1], actual[1])) return false;
  if (ignoreAltitude) return true;
  return expected.length > 2
    ? actual.length > 2 && close(expected[2], actual[2])
    : actual.length < 3 || actual[2] === 0;
}

function sequencesMatch(expected, actual, ignoreAltitude) {
  return (
    expected.length === actual.length &&
    expected.every((position, i) => positionsMatch(position, actual[i], ignoreAltitude))
  );
}

/**
 * Drops a ring's closing point, if it has one. GeoJSON rings repeat their first
 * position; Leaflet rings don't.
 *
 * @param {number[][]} ring
 * @returns {number[][]}
 */
function openRing(ring) {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

/**
 * Whether a feature's geometry matches the expected one.
 *
 * Rings compare open and in either direction: the GeoJSON export rewinds a
 * clockwise ring counterclockwise (RFC 7946), and an area that went through
 * GPX comes back as a closed LineString.
 *
 * @param {Object} expected - Expected feature with type and coordinates
 * @param {Object} feature - Extracted feature data
 * @param {boolean} [ignoreAltitude=false] - Compare longitude and latitude only
 * @returns {boolean}
 */
function geometryMatches(expected, feature, ignoreAltitude = false) {
  const actual = feature.coordinates;
  if (!actual) return false;
  if (expected.type === "Point")
    return positionsMatch(expected.coordinates, actual, ignoreAltitude);
  if (expected.type === "LineString") {
    return sequencesMatch(expected.coordinates, actual, ignoreAltitude);
  }
  const ring = openRing(expected.coordinates[0]);
  const actualRing = openRing(feature.type === "Polygon" ? actual[0] : actual);
  return (
    sequencesMatch(ring, actualRing, ignoreAltitude) ||
    sequencesMatch(ring, [...actualRing].reverse(), ignoreAltitude)
  );
}

/**
 * Validates extracted features against the expected features.
 *
 * Every actual feature must pair with exactly one expected feature of the same
 * name and type, and every expected feature must be found. Color and description
 * are always compared; coordinates when the expected feature lists them.
 *
 * @param {Object[]} features - Array of extracted feature data
 * @param {Object[]} expected - Expected features
 * @param {Object} options - Validation options
 * @param {boolean} options.allowGpxPolygonAsLineString - Allow GPX polygons as LineStrings
 * @returns {Object} passed, issues, one result per actual feature, and the missing expected ones
 */
function validateFeatures(features, expected, options = {}) {
  const { allowGpxPolygonAsLineString = false } = options;
  const unmatched = [...expected];

  // GPX doesn't support native polygons - they're represented as closed LineStrings
  const typeMatches = (exp, feature) =>
    exp.type === feature.type ||
    (allowGpxPolygonAsLineString && exp.type === "Polygon" && feature.type === "LineString");

  const results = features.map((feature) => {
    const candidates = unmatched.filter((exp) => exp.name === feature.name);
    // Identically named features (e.g. the members of an unnamed MultiPoint, which
    // all default to "Marker") pair up by geometry, so their order never matters.
    const match =
      candidates.find(
        (exp) => typeMatches(exp, feature) && (!exp.coordinates || geometryMatches(exp, feature)),
      ) ||
      candidates.find((exp) => typeMatches(exp, feature)) ||
      candidates[0];

    const result = {
      name: feature.name,
      type: feature.type,
      colorName: feature.colorName,
      issues: [],
    };
    if (!match) {
      result.issues.push("unexpected feature");
      return result;
    }
    unmatched.splice(unmatched.indexOf(match), 1);

    if (!typeMatches(match, feature)) {
      result.issues.push(`type: expected ${match.type}, got ${feature.type}`);
    } else if (match.coordinates && !geometryMatches(match, feature)) {
      result.issues.push(
        geometryMatches(match, feature, true)
          ? "elevation differs from expected"
          : "coordinates differ from expected",
      );
    }

    // The expected color goes through the app's parseColor() too, so test-config may
    // state either a hex ("#AC3939") or a CSS name ("crimson").
    if (parseColor(feature.color) !== parseColor(match.color)) {
      result.issues.push(`color: expected ${match.color}, got ${feature.colorName}`);
    }

    const expectedDescription = match.description || "";
    if (feature.description !== expectedDescription) {
      result.issues.push(
        `description: expected ${JSON.stringify(expectedDescription)}, got ${JSON.stringify(feature.description)}`,
      );
    }

    return result;
  });

  const missing = unmatched.map((exp) => ({ name: exp.name, type: exp.type }));
  const issues = [
    ...results.flatMap((r) => r.issues.map((issue) => `"${r.name}": ${issue}`)),
    ...missing.map((m) => `missing feature: "${m.name}" (${m.type})`),
  ];

  return { passed: issues.length === 0, issues, features: results, missing };
}

// Export for module use
if (typeof window !== "undefined") {
  window.TestValidators = {
    extractFeatureData,
    validateFeatures,
  };
}
