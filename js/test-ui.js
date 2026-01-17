/**
 * Test UI Module
 *
 * Handles rendering of test suites, results, and side-by-side comparisons.
 */

/**
 * Creates a test suite container element.
 *
 * @param {Object} suiteConfig - Test suite configuration
 * @param {string} suiteConfig.name - Suite name
 * @param {string} suiteConfig.description - Suite description
 * @returns {HTMLElement} The test suite container element
 */
function createTestSuiteElement(suiteConfig) {
  const suite = document.createElement("div");
  suite.className = "test-suite collapsed";
  suite.dataset.suiteName = suiteConfig.name;

  const header = document.createElement("div");
  header.className = "test-suite-header";
  header.innerHTML = `
    <h2>${suiteConfig.name}</h2>
    <span class="test-suite-status pending">Not run yet</span>
  `;
  header.addEventListener("click", () => toggleSuiteCollapse(suite));

  const content = document.createElement("div");
  content.className = "test-suite-content";

  // Description
  if (suiteConfig.description) {
    const description = document.createElement("p");
    description.className = "test-suite-description";
    description.textContent = suiteConfig.description;
    content.appendChild(description);
  }

  // Expected features summary
  if (suiteConfig.expectedFeatures) {
    const expectedDiv = document.createElement("div");
    expectedDiv.className = "expected-features";

    const featuresList = Object.entries(suiteConfig.expectedFeatures)
      .map(([name, props]) => {
        return `<span class="expected-feature"><strong>${escapeHtml(name)}</strong> (${props.type}, ${props.color})</span>`;
      })
      .join("");

    expectedDiv.innerHTML = `
      <strong>Expected features:</strong> ${featuresList}
    `;
    content.appendChild(expectedDiv);
  }

  const resultsContainer = document.createElement("div");
  resultsContainer.className = "format-results";
  content.appendChild(resultsContainer);

  suite.appendChild(header);
  suite.appendChild(content);

  return suite;
}

/**
 * Toggles the collapsed state of a test suite.
 *
 * @param {HTMLElement} suiteElement - The test suite element
 */
function toggleSuiteCollapse(suiteElement) {
  suiteElement.classList.toggle("collapsed");
}

/**
 * Updates the status badge of a test suite with per-format results.
 *
 * @param {HTMLElement} suiteElement - The test suite element
 * @param {Object[]} formatResults - Array of format test results
 */
function updateSuiteStatus(suiteElement, formatResults) {
  const statusEl = suiteElement.querySelector(".test-suite-status");

  // Build format status indicators
  const formatStatus = formatResults
    .map((fr) => {
      const icon = fr.passed ? "\u2713" : "\u2717";
      const iconClass = fr.passed ? "format-icon-pass" : "format-icon-fail";
      return `<span class="${iconClass}">${icon}</span><span class="format-name">${fr.format}</span>`;
    })
    .join(" ");

  statusEl.innerHTML = formatStatus;
  statusEl.className = "test-suite-status";

  const allPassed = formatResults.every((r) => r.passed);
  if (allPassed) {
    statusEl.classList.add("passed");
  } else {
    statusEl.classList.add("failed");
  }
}

/**
 * Creates a format test result element with side-by-side comparison.
 *
 * @param {Object} result - Test result object
 * @param {string} result.format - Format name (GeoJSON, GPX, etc.)
 * @param {boolean} result.passed - Whether both import and export passed
 * @param {Object} result.importResult - Import validation result
 * @param {Object} result.exportResult - Export validation result
 * @param {Object[]} result.importedFeatures - Features from import
 * @param {Object[]} result.exportedFeatures - Features from export
 * @param {Object} result.exportedGeoJson - The exported GeoJSON object
 * @returns {HTMLElement} The format test element
 */
function createFormatTestElement(result) {
  const formatTest = document.createElement("div");
  formatTest.className = `format-test ${result.passed ? "success" : "failure"}`;

  // Header
  const header = document.createElement("div");
  header.className = "format-test-header";
  header.innerHTML = `
    <h3>${result.format}</h3>
    <span class="format-test-status">${result.passed ? "PASS" : "FAIL"}</span>
  `;
  formatTest.appendChild(header);

  // Side-by-side comparison
  const comparison = document.createElement("div");
  comparison.className = "comparison-container";

  // Import panel
  const importPanel = createComparisonPanel(
    "Imported",
    result.importedFeatures,
    result.importResult,
    "import-panel",
  );
  comparison.appendChild(importPanel);

  // Export panel
  const exportPanel = createComparisonPanel(
    "Exported (→ GeoJSON)",
    result.exportedFeatures,
    result.exportResult,
    "export-panel",
  );
  comparison.appendChild(exportPanel);

  formatTest.appendChild(comparison);

  // Issues list (if any)
  const allIssues = [
    ...(result.importResult?.issues || []).map((i) => `Import: ${i}`),
    ...(result.exportResult?.issues || []).map((i) => `Export: ${i}`),
  ];

  if (allIssues.length > 0) {
    const issuesDiv = document.createElement("div");
    issuesDiv.className = "issues-list";
    issuesDiv.innerHTML = `
      <h5>Issues Found:</h5>
      <ul>
        ${allIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}
      </ul>
    `;
    formatTest.appendChild(issuesDiv);
  }

  // JSON toggle
  const jsonToggle = createJsonToggle(result.importedFeatures, result.exportedGeoJson);
  formatTest.appendChild(jsonToggle);

  return formatTest;
}

/**
 * Creates a comparison panel showing feature list.
 *
 * @param {string} title - Panel title
 * @param {Object[]} features - Array of feature data
 * @param {Object} validationResult - Validation result with featureResults
 * @param {string} panelClass - Additional CSS class for the panel
 * @returns {HTMLElement} The comparison panel element
 */
function createComparisonPanel(title, features, validationResult, panelClass) {
  const panel = document.createElement("div");
  panel.className = `comparison-panel ${panelClass}`;

  const titleEl = document.createElement("h4");
  titleEl.textContent = title;
  panel.appendChild(titleEl);

  const featureList = document.createElement("ul");
  featureList.className = "feature-list";

  if (!features || features.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "feature-item missing";
    emptyItem.innerHTML = `
      <span class="feature-name">No features found</span>
      <span class="feature-status"></span>
    `;
    featureList.appendChild(emptyItem);
  } else {
    features.forEach((feature) => {
      const featureResult = validationResult?.featureResults?.[feature.name];
      const isValid = featureResult?.valid !== false;

      const item = document.createElement("li");
      item.className = `feature-item ${isValid ? "valid" : "invalid"}`;

      item.innerHTML = `
        <span class="feature-name">${escapeHtml(feature.name)}</span>
        <span class="feature-details">${feature.type}, ${feature.colorName}</span>
        <span class="feature-status"></span>
      `;

      featureList.appendChild(item);
    });
  }

  // Add missing features from validation
  if (validationResult?.featureResults) {
    Object.keys(validationResult.featureResults).forEach((name) => {
      const fr = validationResult.featureResults[name];
      if (!fr.found) {
        const item = document.createElement("li");
        item.className = "feature-item missing";
        item.innerHTML = `
          <span class="feature-name">${escapeHtml(name)}</span>
          <span class="feature-details">Missing</span>
          <span class="feature-status"></span>
        `;
        featureList.appendChild(item);
      }
    });
  }

  panel.appendChild(featureList);
  return panel;
}

/**
 * Creates a toggleable JSON output section.
 *
 * @param {Object[]} importedFeatures - Imported feature data
 * @param {Object} exportedGeoJson - Exported GeoJSON object
 * @returns {HTMLElement} The JSON toggle element
 */
function createJsonToggle(importedFeatures, exportedGeoJson) {
  const container = document.createElement("div");
  container.className = "json-toggle";

  const button = document.createElement("button");
  button.className = "json-toggle-btn";
  button.textContent = "Show JSON";
  container.appendChild(button);

  const content = document.createElement("div");
  content.className = "json-content";

  const columns = document.createElement("div");
  columns.className = "json-columns";

  // Import JSON column
  const importCol = document.createElement("div");
  importCol.className = "json-column";
  importCol.innerHTML = `
    <h5>Imported Features</h5>
    <pre>${escapeHtml(JSON.stringify(importedFeatures, null, 2))}</pre>
  `;
  columns.appendChild(importCol);

  // Export JSON column
  const exportCol = document.createElement("div");
  exportCol.className = "json-column";
  exportCol.innerHTML = `
    <h5>Exported GeoJSON</h5>
    <pre>${escapeHtml(JSON.stringify(exportedGeoJson, null, 2))}</pre>
  `;
  columns.appendChild(exportCol);

  content.appendChild(columns);
  container.appendChild(content);

  button.addEventListener("click", () => {
    content.classList.toggle("visible");
    button.textContent = content.classList.contains("visible") ? "Hide JSON" : "Show JSON";
  });

  return container;
}

/**
 * Creates a summary element for a single test suite.
 *
 * @param {Object} suiteResult - Single test suite result
 * @returns {HTMLElement} The summary element
 */
function createSuiteSummaryElement(suiteResult) {
  const formatResults = suiteResult.formatResults;
  const totalPassed = formatResults.filter((r) => r.passed).length;
  const totalTests = formatResults.length;

  // Build format breakdown
  const formatBreakdown = formatResults
    .map((fr) => {
      const icon = fr.passed ? "&#10003;" : "&#10007;";
      const color = fr.passed ? "#4caf50" : "#f44336";
      return `<span style="color: ${color}">${icon}</span> ${fr.format}`;
    })
    .join(" &nbsp;&nbsp; ");

  const summary = document.createElement("div");
  summary.className = `suite-summary ${totalPassed === totalTests ? "all-pass" : "has-failures"}`;
  summary.innerHTML = `
    <div style="margin-bottom: 8px;">
      <strong>Test Summary:</strong> ${totalPassed}/${totalTests} tests passed
    </div>
    <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
      Import each format, then export to GeoJSON. Validate that features (name, type, color) are preserved.
    </div>
    <div style="font-size: 14px;">
      <strong>Formats:</strong> ${formatBreakdown}
    </div>
  `;

  return summary;
}

/**
 * Displays a global summary of all test results (legacy, kept for text export).
 *
 * @param {Object[]} allResults - Array of all test suite results
 * @returns {HTMLElement} The summary element
 */
function createSummaryElement(allResults) {
  let totalPassed = 0;
  let totalTests = 0;
  const formatStats = {};

  allResults.forEach((suiteResult) => {
    suiteResult.formatResults.forEach((fr) => {
      totalTests++;
      if (fr.passed) totalPassed++;

      // Track per-format stats
      if (!formatStats[fr.format]) {
        formatStats[fr.format] = { passed: 0, total: 0 };
      }
      formatStats[fr.format].total++;
      if (fr.passed) formatStats[fr.format].passed++;
    });
  });

  // Build format breakdown
  const formatBreakdown = Object.entries(formatStats)
    .map(([format, stats]) => {
      const icon = stats.passed === stats.total ? "&#10003;" : "&#10007;";
      const color = stats.passed === stats.total ? "#4caf50" : "#f44336";
      return `<span style="color: ${color}">${icon}</span> ${format}`;
    })
    .join(" &nbsp;&nbsp; ");

  const summary = document.createElement("div");
  summary.className = `summary ${totalPassed === totalTests ? "all-pass" : "has-failures"}`;
  summary.innerHTML = `
    <div style="margin-bottom: 10px;">
      <strong>Test Summary:</strong> ${totalPassed}/${totalTests} tests passed
    </div>
    <div style="font-size: 14px; color: #666; margin-bottom: 10px;">
      <strong>What we test:</strong> Import each file format, then export to GeoJSON.
      Validate that features (name, type, color) are preserved through the round-trip.
    </div>
    <div style="font-size: 14px;">
      <strong>Formats:</strong> ${formatBreakdown}
    </div>
  `;

  return summary;
}

/**
 * Shows an error message in the UI.
 *
 * @param {string} message - Error message to display
 */
function showError(message) {
  const errorContainer = document.getElementById("error-container");
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-box";
  errorDiv.innerHTML = `<strong>Error:</strong> ${message}`;
  errorContainer.innerHTML = "";
  errorContainer.appendChild(errorDiv);
}

/**
 * Clears any displayed error messages.
 */
function clearError() {
  const errorContainer = document.getElementById("error-container");
  if (errorContainer) {
    errorContainer.innerHTML = "";
  }
}

/**
 * Updates the status text display.
 *
 * @param {string} text - Status text to display
 */
function updateStatus(text) {
  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = text;
  }
}

/**
 * Escapes HTML special characters.
 *
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (typeof text !== "string") {
    text = String(text);
  }
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Formats all results as plain text for copying.
 *
 * @param {Object[]} allResults - Array of all test suite results
 * @returns {string} Formatted text
 */
function formatResultsAsText(allResults) {
  let text = "AUTOMATED TEST RESULTS\n";
  text += "=".repeat(50) + "\n\n";

  allResults.forEach((suiteResult) => {
    text += `TEST SUITE: ${suiteResult.config.name}\n`;
    text += "-".repeat(40) + "\n";

    suiteResult.formatResults.forEach((fr) => {
      text += `${fr.passed ? "✓" : "✗"} ${fr.format}\n`;

      if (fr.importResult?.issues?.length > 0) {
        text += "  Import issues:\n";
        fr.importResult.issues.forEach((issue) => {
          text += `    - ${issue}\n`;
        });
      }

      if (fr.exportResult?.issues?.length > 0) {
        text += "  Export issues:\n";
        fr.exportResult.issues.forEach((issue) => {
          text += `    - ${issue}\n`;
        });
      }
    });

    const passed = suiteResult.formatResults.filter((r) => r.passed).length;
    text += `\nSuite total: ${passed}/${suiteResult.formatResults.length} passed\n\n`;
  });

  // Overall summary
  let totalPassed = 0;
  let totalTests = 0;
  allResults.forEach((sr) => {
    sr.formatResults.forEach((fr) => {
      totalTests++;
      if (fr.passed) totalPassed++;
    });
  });

  text += "=".repeat(50) + "\n";
  text += `TOTAL: ${totalPassed}/${totalTests} tests passed\n`;

  return text;
}

// Export for module use
if (typeof window !== "undefined") {
  window.TestUI = {
    createTestSuiteElement,
    toggleSuiteCollapse,
    updateSuiteStatus,
    createFormatTestElement,
    createComparisonPanel,
    createJsonToggle,
    createSuiteSummaryElement,
    createSummaryElement,
    showError,
    clearError,
    updateStatus,
    formatResultsAsText,
  };
}
