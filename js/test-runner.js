/**
 * Test Runner Module
 *
 * Orchestrates test suite discovery, execution, and result collection.
 */

// Global state
let dependenciesLoaded = false;
let allTestResults = [];

/**
 * Discovers test suites by scanning the test-files directory.
 * Each subdirectory with a test-config.json is a test suite.
 *
 * @returns {Promise<Object[]>} Array of test suite configurations
 */
async function discoverTestSuites() {
  // For now, we'll use a known list of test suites
  // In a more dynamic setup, this could scan the directory
  const knownSuites = ["01-standard-shapes"];

  const suites = [];

  for (const suiteName of knownSuites) {
    try {
      // no-store: config and fixtures are edited between runs, and a cached copy
      // silently tests the previous version.
      const response = await fetch(`./test-files/${suiteName}/test-config.json`, {
        cache: "no-store",
      });
      if (response.ok) {
        const config = await response.json();
        config.path = suiteName;
        suites.push(config);
      }
    } catch (error) {
      console.warn(`Could not load test suite ${suiteName}:`, error);
    }
  }

  return suites;
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
 * @param {File} file - The file to import
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
 * Runs a single format test within a test suite.
 *
 * @param {Object} suiteConfig - Test suite configuration
 * @param {string} filename - File to test
 * @returns {Promise<Object>} Test result
 */
async function runFormatTest(suiteConfig, filename) {
  const formatName = getFormatName(filename);
  const importFunction = getImportFunction(filename);
  const isGpx = formatName === "GPX";

  TestUI.updateStatus(`Testing ${formatName}...`);

  try {
    // Step 1: Import the file
    const importResult = await loadAndImportFile(suiteConfig.path, filename, importFunction);

    // Step 2: Validate imported features against expected
    const importValidation = TestValidators.validateFeatures(
      importResult.features,
      suiteConfig.expectedFeatures,
      { allowGpxPolygonAsLineString: isGpx },
    );

    // Step 3: Export to every format the app can write. All exports run before
    // any re-import below, because re-importing replaces the imported layers.
    const exportedContent = {};
    for (const exportFormat of ExportCapture.FORMATS) {
      exportedContent[exportFormat] = ExportCapture.captureExport(exportFormat);
    }

    // Step 4: Round-trip each export back through the app's own importer, so
    // exported geometry and colors are read by the same code a user's re-import
    // would use, rather than by a parser maintained only inside these tests.
    const exportValidations = {};
    let exportedFeatures = [];

    for (const exportFormat of ExportCapture.FORMATS) {
      const exportFilename = `export.${ExportCapture.EXPORT_EXTENSIONS[exportFormat]}`;
      const reimported = await importFile(
        new File([exportedContent[exportFormat]], exportFilename),
        getImportFunction(exportFilename),
      );

      // GPX has no polygon type, so a polygon comes back as a closed LineString
      // whether it lost the type on the way in or on the way out.
      exportValidations[exportFormat] = TestValidators.validateFeatures(
        reimported.features,
        suiteConfig.expectedFeatures,
        { allowGpxPolygonAsLineString: isGpx || exportFormat === "GPX" },
      );

      if (exportFormat === "GeoJSON") {
        exportedFeatures = reimported.features;
      }
    }

    // Step 5: Merge the per-format results into the single exportResult the UI
    // renders. Issues are prefixed so a failure names the format that broke.
    const exportValidation = {
      passed: Object.values(exportValidations).every((v) => v.passed),
      issues: Object.entries(exportValidations).flatMap(([fmt, v]) =>
        v.issues.map((issue) => `${fmt}: ${issue}`),
      ),
      featureResults: exportValidations.GeoJSON.featureResults,
    };

    // Overall pass: import and every export format must pass
    const passed = importValidation.passed && exportValidation.passed;

    return {
      format: formatName,
      filename: filename,
      passed: passed,
      importResult: importValidation,
      exportResult: exportValidation,
      importedFeatures: importResult.features,
      exportedFeatures: exportedFeatures,
      exportedGeoJson: exportedContent.GeoJSON,
      exportValidations: exportValidations,
    };
  } catch (error) {
    console.error(`Error testing ${formatName}:`, error);
    return {
      format: formatName,
      filename: filename,
      passed: false,
      error: error.message,
      importResult: { passed: false, issues: [error.message] },
      exportResult: { passed: false, issues: [] },
      importedFeatures: [],
      exportedFeatures: [],
      exportedGeoJson: null,
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

  for (const filename of suiteConfig.files) {
    const result = await runFormatTest(suiteConfig, filename);
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
  const suitesContainer = document.getElementById("test-suites");

  runBtn.disabled = true;
  copyBtn.style.display = "none";
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
      TestUI.showError("No test suites found in test-files directory.");
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

    TestUI.updateStatus("Tests complete!");
    copyBtn.style.display = "inline-block";

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
 * Initializes the test runner.
 */
function initTestRunner() {
  document.getElementById("run-all-btn").addEventListener("click", runAllTests);
  document.getElementById("copy-btn").addEventListener("click", copyResults);

  console.log('Test runner ready! Click "Run All Tests" to begin.');
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
  };
}
