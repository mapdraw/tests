/**
 * Test Runner Module
 *
 * Orchestrates test suite discovery, execution, and result collection.
 */

// Global state
let dependenciesLoaded = false;
let allTestResults = [];

/**
 * Loads the test suites listed in test-files/suites.json, each a folder with a
 * test-config.json. A missing or broken suite fails the run rather than being
 * skipped silently.
 *
 * @returns {Promise<Object[]>} Array of test suite configurations
 */
async function discoverTestSuites() {
  // no-store: manifest, configs and fixtures are edited between runs, and a cached
  // copy silently tests the previous version.
  const fetchJson = async (path) => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
    return response.json();
  };

  const suiteNames = await fetchJson("./test-files/suites.json");
  return Promise.all(
    suiteNames.map(async (suiteName) => {
      const config = await fetchJson(`./test-files/${suiteName}/test-config.json`);
      config.path = suiteName;
      // A file entry is a bare filename, or { file, overrides } when that file's
      // features deviate from the suite's shared expectations.
      config.files = config.files.map((entry) =>
        typeof entry === "string" ? { file: entry } : entry,
      );
      return config;
    }),
  );
}

/**
 * The suite's expected features with a file entry's overrides applied. An override
 * names a feature by name and type and replaces the fields it lists - e.g. the
 * color of a feature whose source format can't carry it.
 *
 * @param {Object} suiteConfig - Test suite configuration
 * @param {Object} entry - File entry from the suite's files list
 * @returns {Object[]} Expected features for this file
 */
function expectedForFile(suiteConfig, entry) {
  const expected = suiteConfig.expectedFeatures.map((feature) => ({ ...feature }));
  (entry.overrides || []).forEach((override) => {
    const target = expected.find((f) => f.name === override.name && f.type === override.type);
    if (!target) {
      throw new Error(
        `${entry.file}: override matches no expected feature: "${override.name}" (${override.type})`,
      );
    }
    Object.assign(target, override);
  });
  return expected;
}

/**
 * Loads a script from a URL.
 *
 * @param {string} url - Script URL
 * @returns {Promise} Resolves when script is loaded
 */
async function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load: ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * Loads a stylesheet from a URL.
 *
 * @param {string} url - Stylesheet URL
 */
function loadStylesheet(url) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  document.head.appendChild(link);
}

/**
 * Loads all dependencies from the MapDraw server.
 *
 * @returns {Promise<boolean>} True if dependencies loaded successfully
 */
async function loadDependencies() {
  const baseUrl = document.getElementById("base-url").value.replace(/\/$/, "");
  const loadingOverlay = document.getElementById("loading-overlay");
  const loadingStatus = document.getElementById("loading-status");

  loadingOverlay.classList.add("active");
  TestUI.clearError();

  try {
    // Load stylesheets
    loadingStatus.textContent = "Loading stylesheets...";
    loadStylesheet(`${baseUrl}/leaflet-1.9.4/leaflet.css`);
    loadStylesheet(`${baseUrl}/leaflet-draw-1.0.4/leaflet.draw.css`);
    loadStylesheet(`${baseUrl}/sweetalert2-11.26.25/sweetalert2.min.css`);

    // Load scripts in order
    const scripts = [
      { url: `${baseUrl}/d3-7.9.0/d3.v7.min.js`, name: "D3.js" },
      { url: `${baseUrl}/jszip-3.10.1/jszip.min.js`, name: "JSZip" },
      { url: `${baseUrl}/leaflet-1.9.4/leaflet.js`, name: "Leaflet" },
      {
        url: `${baseUrl}/leaflet-draw-1.0.4/leaflet.draw.js`,
        name: "Leaflet Draw",
      },
      {
        url: `${baseUrl}/sweetalert2-11.26.25/sweetalert2.all.min.js`,
        name: "SweetAlert2",
      },
      { url: `${baseUrl}/togeojson-0.16.2/togeojson.js`, name: "toGeoJSON" },
      { url: `${baseUrl}/js/config.js`, name: "Config" },
      {
        url: `${baseUrl}/js/sweetalert2-config.js`,
        name: "SweetAlert2 Config",
      },
      { url: `${baseUrl}/js/utils.js`, name: "Utils" },
      { url: `${baseUrl}/js/color-utils.js`, name: "Color Utils" },
      { url: `${baseUrl}/js/map-interactions.js`, name: "Map Interactions" },
      { url: `${baseUrl}/js/ui-handlers.js`, name: "UI Handlers" },
      { url: `${baseUrl}/js/file-handlers.js`, name: "File Handlers" },
    ];

    for (const script of scripts) {
      loadingStatus.textContent = `Loading ${script.name}...`;
      await loadScript(script.url);
    }

    // Initialize globals
    loadingStatus.textContent = "Initializing...";
    window.importedItems = L.featureGroup();
    window.editableLayers = L.featureGroup();
    window.drawnItems = L.featureGroup();
    window.stravaActivitiesLayer = L.featureGroup();
    window.currentRoutePath = null;
    window.globallySelectedItem = null;

    // Stub functions needed by file-handlers.js
    window.updateElevationToggleIconColor = function () {};
    window.updateDrawControlStates = function () {};
    window.updateOverviewList = function () {};
    window.selectItem = function () {};

    // Initialize map
    window.map = L.map("map").setView([51.505, -0.09], 6);
    window.importedItems.addTo(window.map);

    dependenciesLoaded = true;
    loadingOverlay.classList.remove("active");

    return true;
  } catch (error) {
    loadingOverlay.classList.remove("active");
    TestUI.showError(
      `Failed to load dependencies: ${error.message}<br><br>Make sure the MapDraw server URL is correct and the server is running.`,
    );
    throw error;
  }
}

/**
 * Loads a test file and imports it using the appropriate import function.
 *
 * @param {string} suitePath - Path to the test suite folder
 * @param {string} filename - Name of the file to import
 * @param {Function} importFunction - The import function to use
 * @returns {Promise<Object>} Import result with features
 */
async function loadAndImportFile(suitePath, filename, importFunction) {
  // Load test file
  const response = await fetch(`./test-files/${suitePath}/${filename}`, { cache: "no-store" });
  const blob = await response.blob();
  return importFile(new File([blob], filename), importFunction);
}

/**
 * Imports a File through one of the app's import functions and waits for the
 * resulting layers to land in importedItems.
 *
 * @param {File} file - The File to import
 * @param {Function} importFunction - The import function to use
 * @returns {Promise<Object>} Import result with features and layers
 */
function importFile(file, importFunction) {
  return new Promise((resolve) => {
    // Clear previous imports
    window.importedItems.clearLayers();

    // Set up polling to detect when features are added
    let checkCount = 0;
    const maxChecks = 40; // 2 seconds

    const checkInterval = setInterval(() => {
      checkCount++;
      const layers = window.importedItems.getLayers();

      if (layers.length > 0 || checkCount >= maxChecks) {
        clearInterval(checkInterval);

        // Extract feature data
        const features = layers.map((layer) => TestValidators.extractFeatureData(layer));

        resolve({
          success: layers.length > 0,
          features: features,
          layers: layers,
          layerCount: layers.length,
        });
      }
    }, 50);

    // Trigger import
    importFunction(file);
  });
}

/**
 * Gets the import function for a file format.
 *
 * @param {string} filename - Filename to determine format
 * @returns {Function|null} The import function or null if unknown format
 */
function getImportFunction(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  switch (ext) {
    case "geojson":
    case "json":
      return importGeoJsonFile;
    case "gpx":
      return importGpxFile;
    case "kml":
      return importKmlFile;
    case "kmz":
      return importKmzFile;
    default:
      return null;
  }
}

/**
 * Gets the format name from a filename.
 *
 * @param {string} filename - Filename
 * @returns {string} Format name
 */
function getFormatName(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  switch (ext) {
    case "geojson":
    case "json":
      return "GeoJSON";
    case "gpx":
      return "GPX";
    case "kml":
      return "KML";
    case "kmz":
      return "KMZ";
    default:
      return ext.toUpperCase();
  }
}

/**
 * Runs a single format test within a test suite: imports the file, validates
 * it, exports it to every format and validates each re-import.
 *
 * @param {Object} suiteConfig - Test suite configuration
 * @param {Object} entry - File entry from the suite's files list
 * @returns {Promise<Object>} Test result
 */
async function runFormatTest(suiteConfig, entry) {
  const filename = entry.file;
  const formatName = getFormatName(filename);
  const isGpx = formatName === "GPX";

  TestUI.updateStatus(`${suiteConfig.name}: testing ${formatName}...`);

  try {
    const expected = expectedForFile(suiteConfig, entry);
    const importFunction = getImportFunction(filename);
    if (!importFunction) throw new Error(`No import function for ${filename}`);

    // Step 1: Import the file and validate its features
    const importResult = await loadAndImportFile(suiteConfig.path, filename, importFunction);
    const importValidation = TestValidators.validateFeatures(importResult.features, expected, {
      allowGpxPolygonAsLineString: isGpx,
    });

    // Step 2: Export to every format the app can write. All exports run before
    // any re-import below, because re-importing replaces the imported layers.
    const exports = {};
    for (const exportFormat of ExportCapture.FORMATS) {
      exports[exportFormat] = { content: ExportCapture.captureExport(exportFormat) };
    }

    // Step 3: Round-trip each export back through the app's own importer, so
    // exported geometry and colors are read by the same code a user's re-import
    // would use, rather than by a parser maintained only inside these tests.
    for (const exportFormat of ExportCapture.FORMATS) {
      const exportFilename = `export.${ExportCapture.EXPORT_EXTENSIONS[exportFormat]}`;
      const reimported = await importFile(
        new File([exports[exportFormat].content], exportFilename),
        getImportFunction(exportFilename),
      );

      // GPX has no polygon type, so a polygon comes back as a closed LineString
      // whether it lost the type on the way in or on the way out.
      exports[exportFormat].features = reimported.features;
      exports[exportFormat].validation = TestValidators.validateFeatures(
        reimported.features,
        expected,
        { allowGpxPolygonAsLineString: isGpx || exportFormat === "GPX" },
      );
    }

    // Overall pass: import and every export format must pass
    const passed =
      importValidation.passed && Object.values(exports).every((e) => e.validation.passed);

    return {
      format: formatName,
      filename: filename,
      passed: passed,
      importValidation: importValidation,
      importedFeatures: importResult.features,
      exports: exports,
    };
  } catch (error) {
    console.error(`Error testing ${filename}:`, error);
    return {
      format: formatName,
      filename: filename,
      passed: false,
      error: error.message,
    };
  }
}

/**
 * Runs all tests in a test suite.
 *
 * @param {Object} suiteConfig - Test suite configuration
 * @param {HTMLElement} suiteElement - The suite's DOM element
 * @returns {Promise<Object>} Suite results
 */
async function runTestSuite(suiteConfig, suiteElement) {
  const resultsContainer = suiteElement.querySelector(".format-results");
  resultsContainer.innerHTML = "";

  const formatResults = [];

  for (const entry of suiteConfig.files) {
    const result = await runFormatTest(suiteConfig, entry);
    formatResults.push(result);

    // Display result immediately
    const resultElement = TestUI.createFormatTestElement(result);
    resultsContainer.appendChild(resultElement);
  }

  // Update suite status in header with per-format results
  TestUI.updateSuiteStatus(suiteElement, formatResults);

  return {
    config: suiteConfig,
    formatResults: formatResults,
  };
}

/**
 * Runs all test suites.
 */
async function runAllTests() {
  const runBtn = document.getElementById("run-all-btn");
  const copyBtn = document.getElementById("copy-btn");
  const downloadBtn = document.getElementById("download-btn");
  const suitesContainer = document.getElementById("test-suites");

  runBtn.disabled = true;
  copyBtn.style.display = "none";
  downloadBtn.style.display = "none";
  allTestResults = [];
  TestUI.clearError();

  try {
    // Load dependencies if needed
    if (!dependenciesLoaded) {
      await loadDependencies();
    }

    // Discover test suites
    TestUI.updateStatus("Discovering test suites...");
    const suites = await discoverTestSuites();

    if (suites.length === 0) {
      TestUI.showError("No test suites listed in test-files/suites.json.");
      return;
    }

    // Clear and rebuild suites container
    suitesContainer.innerHTML = "";

    // Create UI elements for each suite
    const suiteElements = [];
    for (const suiteConfig of suites) {
      const suiteElement = TestUI.createTestSuiteElement(suiteConfig);
      suitesContainer.appendChild(suiteElement);
      suiteElements.push({ config: suiteConfig, element: suiteElement });
    }

    // Run each suite
    for (const { config, element } of suiteElements) {
      const result = await runTestSuite(config, element);
      allTestResults.push(result);
    }

    TestUI.updateStatus(TestUI.summarizeResults(allTestResults));
    copyBtn.style.display = "inline-block";
    downloadBtn.style.display = "inline-block";

    // Log results to console
    console.log(TestUI.formatResultsAsText(allTestResults));
  } catch (error) {
    TestUI.updateStatus("Test failed");
    TestUI.showError(`Test execution failed: ${error.message}`);
    console.error(error);
  } finally {
    runBtn.disabled = false;
  }
}

/**
 * Copies test results to clipboard.
 */
function copyResults() {
  const text = TestUI.formatResultsAsText(allTestResults);
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copy-btn");
    const originalText = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
}

/**
 * Bundles every file the exports produced into one zip and downloads it, for
 * schema validation outside the browser: ./validate-exports.sh <the zip>.
 * One entry per export: <suite>/<source file>/export.<format extension>.
 */
async function downloadExports() {
  const zip = new JSZip();
  allTestResults.forEach((suiteResult) => {
    suiteResult.formatResults.forEach((fr) => {
      if (!fr.exports) return;
      Object.entries(fr.exports).forEach(([format, exported]) => {
        const extension = ExportCapture.EXPORT_EXTENSIONS[format];
        zip.file(`${suiteResult.config.path}/${fr.filename}/export.${extension}`, exported.content);
      });
    });
  });
  const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "mapdraw-test-exports.zip";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Initializes the test runner. With ?autorun in the URL, the tests start
 * immediately - handy when re-running after every code change.
 */
function initTestRunner() {
  document.getElementById("run-all-btn").addEventListener("click", runAllTests);
  document.getElementById("copy-btn").addEventListener("click", copyResults);
  document.getElementById("download-btn").addEventListener("click", downloadExports);

  if (new URLSearchParams(location.search).has("autorun")) {
    runAllTests();
  } else {
    console.log('Test runner ready! Click "Run All Tests" to begin.');
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTestRunner);
} else {
  initTestRunner();
}

// Export for module use
if (typeof window !== "undefined") {
  window.TestRunner = {
    discoverTestSuites,
    loadDependencies,
    runFormatTest,
    runTestSuite,
    runAllTests,
    copyResults,
    downloadExports,
  };
}
