/**
 * Export Capture Module
 *
 * Intercepts export functions to capture output for testing
 * instead of triggering file downloads.
 */

/**
 * Captures GeoJSON export output from layers without triggering download.
 * Replicates the core logic from exportGeoJson() in file-handlers.js
 *
 * @param {L.Layer[]} layers - Array of Leaflet layers to export
 * @returns {Object} GeoJSON FeatureCollection
 */
function captureGeoJsonExport(layers) {
  const features = [];

  layers.forEach((layer) => {
    try {
      const geojson = layer.toGeoJSON();

      // Skip if toGeoJSON didn't produce valid geometry
      if (!geojson || !geojson.geometry || !geojson.geometry.type) {
        console.warn("Skipping layer with invalid geometry:", layer);
        return;
      }

      // Extract full precision coordinates directly from layer
      if (layer instanceof L.Marker) {
        const ll = layer.getLatLng();
        const coords = [ll.lng, ll.lat];
        if (typeof ll.alt === "number") coords.push(ll.alt);
        geojson.geometry.coordinates = coords;
      } else if (layer instanceof L.Polygon) {
        const latlngs = layer.getLatLngs()[0];
        const coords = latlngs.map((ll) => {
          const coord = [ll.lng, ll.lat];
          if (typeof ll.alt === "number") coord.push(ll.alt);
          return coord;
        });
        coords.push(coords[0]); // Close the polygon
        geojson.geometry.coordinates = [coords];
      } else if (layer instanceof L.Polyline) {
        let latlngs = layer.getLatLngs();
        while (Array.isArray(latlngs[0]) && !(latlngs[0] instanceof L.LatLng)) {
          latlngs = latlngs[0];
        }
        geojson.geometry.coordinates = latlngs.map((ll) => {
          const coord = [ll.lng, ll.lat];
          if (typeof ll.alt === "number") coord.push(ll.alt);
          return coord;
        });
      }

      // Get color information
      const colorName = layer.feature?.properties?.colorName || "Red";
      const colorData =
        ORGANIC_MAPS_COLORS.find((c) => c.name === colorName) || ORGANIC_MAPS_COLORS[0];

      // Copy properties, excluding internal ones
      const excludedProperties = ["totalDistance"];
      const filteredProperties = Object.keys(geojson.properties || {}).reduce((acc, key) => {
        if (!excludedProperties.includes(key)) {
          acc[key] = geojson.properties[key];
        }
        return acc;
      }, {});

      // Enhance properties with color data
      geojson.properties = {
        ...filteredProperties,
        colorName: colorName,
      };

      // Add standard GeoJSON styling
      if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
        geojson.properties.stroke = colorData.css;
        geojson.properties["stroke-width"] = 3;
        geojson.properties["stroke-opacity"] = 1;
      }
      if (layer instanceof L.Polygon) {
        geojson.properties.fill = colorData.css;
        geojson.properties["fill-opacity"] = 0.2;
      }
      if (layer instanceof L.Marker) {
        geojson.properties["marker-color"] = colorData.css;
      }

      geojson.type = "Feature";
      features.push(geojson);
    } catch (error) {
      console.error("Error converting layer to GeoJSON:", error, layer);
    }
  });

  return {
    type: "FeatureCollection",
    features: features,
  };
}

/**
 * Captures GPX export output from a single layer.
 * Uses the existing convertLayerToGpx() function which returns a string.
 *
 * @param {L.Layer} layer - The layer to export
 * @returns {string} GPX XML string
 */
function captureGpxExport(layer) {
  // convertLayerToGpx already returns the GPX string directly
  return convertLayerToGpx(layer);
}

/**
 * Captures GPX export for multiple layers combined into one GPX file.
 *
 * @param {L.Layer[]} layers - Array of layers to export
 * @returns {string} Combined GPX XML string
 */
function captureGpxExportMultiple(layers) {
  if (layers.length === 0) {
    return null;
  }

  // Build GPX header
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"
    xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3"
    xmlns:gpx_style="http://www.topografix.com/GPX/gpx_style/0/2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.topografix.com/GPX/1/1 https://www.topografix.com/GPX/1/1/gpx.xsd http://www.topografix.com/GPX/gpx_style/0/2 https://www.topografix.com/GPX/gpx_style/0/2/gpx_style.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 https://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd">`;

  let content = "";

  layers.forEach((layer) => {
    const name = layer.feature?.properties?.name || "Exported Feature";
    const description = layer.feature?.properties?.description || "";
    const colorName = layer.feature?.properties?.colorName || "Red";
    const colorData = ORGANIC_MAPS_COLORS.find((c) => c.name === colorName);
    const gpxColorHex = colorData ? colorData.css.substring(1).toUpperCase() : "E51B23";

    const safeName = escapeXml(name);
    const safeDescription = escapeXml(description);

    if (layer instanceof L.Marker) {
      const latlng = layer.getLatLng();
      content += `
  <wpt lat="${latlng.lat}" lon="${latlng.lng}">
    <name>${safeName}</name>`;
      if (description) {
        content += `
    <desc>${safeDescription}</desc>`;
      }
      content += `
    <extensions>
      <gpx_style:color>${gpxColorHex}</gpx_style:color>
    </extensions>
  </wpt>`;
    } else if (layer instanceof L.Polygon) {
      const latlngs = layer.getLatLngs()[0];
      content += `
  <trk>
    <name>${safeName}</name>
    <extensions>
      <gpx_style:line>
        <gpx_style:color>${gpxColorHex}</gpx_style:color>
      </gpx_style:line>
    </extensions>
    <trkseg>`;
      latlngs.forEach((ll) => {
        content += `
      <trkpt lat="${ll.lat}" lon="${ll.lng}">`;
        if (typeof ll.alt === "number") {
          content += `
        <ele>${ll.alt}</ele>`;
        }
        content += `
      </trkpt>`;
      });
      // Close polygon by repeating first point
      const first = latlngs[0];
      content += `
      <trkpt lat="${first.lat}" lon="${first.lng}">`;
      if (typeof first.alt === "number") {
        content += `
        <ele>${first.alt}</ele>`;
      }
      content += `
      </trkpt>
    </trkseg>
  </trk>`;
    } else if (layer instanceof L.Polyline) {
      let latlngs = layer.getLatLngs();
      while (Array.isArray(latlngs[0]) && !(latlngs[0] instanceof L.LatLng)) {
        latlngs = latlngs[0];
      }
      content += `
  <trk>
    <name>${safeName}</name>
    <extensions>
      <gpx_style:line>
        <gpx_style:color>${gpxColorHex}</gpx_style:color>
      </gpx_style:line>
    </extensions>
    <trkseg>`;
      latlngs.forEach((ll) => {
        content += `
      <trkpt lat="${ll.lat}" lon="${ll.lng}">`;
        if (typeof ll.alt === "number") {
          content += `
        <ele>${ll.alt}</ele>`;
        }
        content += `
      </trkpt>`;
      });
      content += `
    </trkseg>
  </trk>`;
    }
  });

  return header + content + "\n</gpx>";
}

/**
 * Captures KML export output from layers.
 * Uses the existing buildKmlDocument-style logic.
 *
 * @param {L.Layer[]} layers - Array of layers to export
 * @returns {string} KML XML string
 */
function captureKmlExport(layers) {
  const placemarks = [];

  layers.forEach((layer) => {
    const placemark = convertLayerToKmlPlacemark(layer);
    if (placemark) {
      placemarks.push(placemark);
    }
  });

  // Build simple KML document (without complex styles/network links)
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Exported Features</name>
${placemarks.join("\n")}
  </Document>
</kml>`;

  return kml;
}

/**
 * Parses exported GeoJSON and extracts feature data for comparison.
 *
 * @param {Object|string} geojson - GeoJSON object or string
 * @returns {Object[]} Array of extracted feature data
 */
function extractFeaturesFromGeoJson(geojson) {
  if (typeof geojson === "string") {
    geojson = JSON.parse(geojson);
  }

  if (!geojson || !geojson.features) {
    return [];
  }

  return geojson.features.map((feature) => {
    return {
      type: feature.geometry.type,
      name: feature.properties.name || "(unnamed)",
      description: feature.properties.description || "",
      colorName: feature.properties.colorName || "Red",
      coordinates: feature.geometry.coordinates,
    };
  });
}

/**
 * Parses exported GPX and extracts feature data for comparison.
 * Uses the toGeoJSON library to convert GPX to GeoJSON first.
 *
 * @param {string} gpxString - GPX XML string
 * @returns {Object[]} Array of extracted feature data
 */
function extractFeaturesFromGpx(gpxString) {
  const parser = new DOMParser();
  const gpxDoc = parser.parseFromString(gpxString, "text/xml");
  const geojson = toGeoJSON.gpx(gpxDoc);

  return geojson.features.map((feature) => {
    // Parse color from GPX extensions
    let colorName = "Red";
    // This is simplified - in production we'd parse the extensions

    return {
      type: feature.geometry.type,
      name: feature.properties.name || "(unnamed)",
      description: feature.properties.desc || "",
      colorName: colorName,
      coordinates: feature.geometry.coordinates,
    };
  });
}

/**
 * Parses exported KML and extracts feature data for comparison.
 * Uses the toGeoJSON library to convert KML to GeoJSON first.
 *
 * @param {string} kmlString - KML XML string
 * @returns {Object[]} Array of extracted feature data
 */
function extractFeaturesFromKml(kmlString) {
  const parser = new DOMParser();
  const kmlDoc = parser.parseFromString(kmlString, "text/xml");
  const geojson = toGeoJSON.kml(kmlDoc);

  return geojson.features.map((feature) => {
    return {
      type: feature.geometry.type,
      name: feature.properties.name || "(unnamed)",
      description: feature.properties.description || "",
      colorName: "Red", // Would need to parse from styles
      coordinates: feature.geometry.coordinates,
    };
  });
}

// Export for module use
if (typeof window !== "undefined") {
  window.ExportCapture = {
    captureGeoJsonExport,
    captureGpxExport,
    captureGpxExportMultiple,
    captureKmlExport,
    extractFeaturesFromGeoJson,
    extractFeaturesFromGpx,
    extractFeaturesFromKml,
  };
}
