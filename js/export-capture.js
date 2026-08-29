/**
 * Export Capture Module
 *
 * Captures export output by temporarily replacing downloadFile(), so tests run
 * MapDraw's real exportGeoJson()/exportGpx()/exportKml() rather than a copy of
 * their logic. A copy would pass while the real exporter is broken.
 *
 * Exports use their default path (no layers argument), which is what the app
 * does when the user exports the whole map: each exporter falls back to
 * getAllExportableLayers(), backed by the globals test-runner.js sets up.
 */

const EXPORTERS = {
  GeoJSON: () => exportGeoJson({ mode: "all" }),
  GPX: () => exportGpx(),
  KML: () => exportKml(),
};

/** File extension written by each export format, used when re-importing. */
const EXPORT_EXTENSIONS = {
  GeoJSON: "geojson",
  GPX: "gpx",
  KML: "kml",
};

/**
 * Runs a real export and returns the file content it would have downloaded.
 *
 * @param {string} format - One of "GeoJSON", "GPX", "KML"
 * @returns {string} The exported file content
 * @throws {Error} If the format is unknown or the export produced no file
 */
function captureExport(format) {
  const exporter = EXPORTERS[format];
  if (!exporter) {
    throw new Error(`Unknown export format: ${format}`);
  }

  // downloadFile() and notifyExportSuccess() are top-level declarations in the
  // app's classic scripts, so they live on window and can be swapped out here.
  // The success toast is silenced so a full run doesn't stack up dialogs.
  const originalDownload = window.downloadFile;
  const originalNotify = window.notifyExportSuccess;
  let captured = null;

  window.downloadFile = (filename, text) => {
    captured = text;
  };
  window.notifyExportSuccess = () => {};

  try {
    exporter();
  } finally {
    window.downloadFile = originalDownload;
    window.notifyExportSuccess = originalNotify;
  }

  if (captured === null) {
    // The exporters bail out via Swal (and never call downloadFile) when there
    // is nothing on the map to export.
    throw new Error(`${format} export produced no file - nothing was exportable`);
  }

  return captured;
}

// Export for module use
if (typeof window !== "undefined") {
  window.ExportCapture = {
    captureExport,
    EXPORT_EXTENSIONS,
    FORMATS: Object.keys(EXPORTERS),
  };
}
