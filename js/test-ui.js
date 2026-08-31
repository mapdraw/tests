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
 * @param {Object[]} suiteConfig.expectedFeatures - Expected features
 * @returns {HTMLElement} The test suite container element
 */
function createTestSuiteElement(suiteConfig) {
  const suite = document.createElement("div");
  suite.className = "test-suite collapsed";
  suite.dataset.suiteName = suiteConfig.name;

  const header = document.createElement("div");
  header.className = "test-suite-header";
  header.innerHTML = `
    <h2>${escapeHtml(suiteConfig.name)}</h2>
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
  const expectedDiv = document.createElement("div");
  expectedDiv.className = "expected-features";
  const featuresList = suiteConfig.expectedFeatures
    .map(
      (f) =>
        `<span class="expected-feature"><strong>${escapeHtml(f.name)}</strong> (${f.type}, ${escapeHtml(f.color)})</span>`,
    )
    .join("");
  expectedDiv.innerHTML = `
    <strong>Expected features (${suiteConfig.expectedFeatures.length}):</strong> ${featuresList}
  `;
  content.appendChild(expectedDiv);

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
      const icon = fr.passed ? "✓" : "✗";
      const iconClass = fr.passed ? "format-icon-pass" : "format-icon-fail";
      return `<span class="${iconClass}">${icon}</span><span class="format-name">${fr.format}</span>`;
    })
    .join(" ");

  statusEl.innerHTML = formatStatus;
  statusEl.className = "test-suite-status";

  const allPassed = formatResults.every((r) => r.passed);
  statusEl.classList.add(allPassed ? "passed" : "failed");
  // A failed suite opens itself so the failure is visible without clicking through
  if (!allPassed) suiteElement.classList.remove("collapsed");
}

/**
 * Creates a format test result element: the imported features next to each
 * export format's re-imported features.
 *
 * @param {Object} result - Test result object from runFormatTest()
 * @returns {HTMLElement} The format test element
 */
function createFormatTestElement(result) {
  const formatTest = document.createElement("div");
  formatTest.className = `format-test ${result.passed ? "success" : "failure"}`;

  // Header
  const header = document.createElement("div");
  header.className = "format-test-header";
  header.innerHTML = `
    <h3>${result.format} <small>${escapeHtml(result.filename)}</small></h3>
    <span class="format-test-status">${result.passed ? "PASS" : "FAIL"}</span>
  `;
  formatTest.appendChild(header);

  if (result.error) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-box";
    errorDiv.textContent = result.error;
    formatTest.appendChild(errorDiv);
    return formatTest;
  }

  // Side-by-side comparison: import, then one panel per export format
  const comparison = document.createElement("div");
  comparison.className = "comparison-container";
  comparison.appendChild(createComparisonPanel("Imported", result.importValidation));
  Object.entries(result.exports).forEach(([format, exported]) => {
    comparison.appendChild(createComparisonPanel(`Exported → ${format}`, exported.validation));
  });
  formatTest.appendChild(comparison);

  // Issues list (if any), each prefixed with the step that produced it
  const allIssues = [
    ...result.importValidation.issues.map((i) => `Import: ${i}`),
    ...Object.entries(result.exports).flatMap(([format, exported]) =>
      exported.validation.issues.map((i) => `Export → ${format}: ${i}`),
    ),
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

  formatTest.appendChild(createDetailsToggle(result));

  return formatTest;
}

/**
 * Creates a comparison panel listing a validation's features with their status.
 *
 * @param {string} title - Panel title
 * @param {Object} validation - Result of validateFeatures()
 * @returns {HTMLElement} The comparison panel element
 */
function createComparisonPanel(title, validation) {
  const panel = document.createElement("div");
  panel.className = "comparison-panel";

  const titleEl = document.createElement("h4");
  titleEl.textContent = title;
  panel.appendChild(titleEl);

  const featureList = document.createElement("ul");
  featureList.className = "feature-list";

  if (validation.features.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "feature-item missing";
    emptyItem.innerHTML = `
      <span class="feature-name">No features found</span>
      <span class="feature-status"></span>
    `;
    featureList.appendChild(emptyItem);
  }

  validation.features.forEach((feature) => {
    const item = document.createElement("li");
    item.className = `feature-item ${feature.issues.length === 0 ? "valid" : "invalid"}`;
    item.innerHTML = `
      <span class="feature-name">${escapeHtml(feature.name)}</span>
      <span class="feature-details">${feature.type}, ${escapeHtml(feature.colorName)}</span>
      <span class="feature-status"></span>
      ${feature.issues.map((issue) => `<span class="feature-issue">${escapeHtml(issue)}</span>`).join("")}
    `;
    featureList.appendChild(item);
  });

  validation.missing.forEach((feature) => {
    const item = document.createElement("li");
    item.className = "feature-item missing";
    item.innerHTML = `
      <span class="feature-name">${escapeHtml(feature.name)}</span>
      <span class="feature-details">${feature.type}, missing</span>
      <span class="feature-status"></span>
    `;
    featureList.appendChild(item);
  });

  panel.appendChild(featureList);
  return panel;
}

/**
 * Creates a toggleable details section: the imported features as JSON, and the
 * exact file content each export produced.
 *
 * @param {Object} result - Test result object from runFormatTest()
 * @returns {HTMLElement} The details toggle element
 */
function createDetailsToggle(result) {
  const container = document.createElement("div");
  container.className = "details-toggle";

  const button = document.createElement("button");
  button.className = "details-toggle-btn";
  button.textContent = "Show details";
  container.appendChild(button);

  const content = document.createElement("div");
  content.className = "details-content";

  const columns = document.createElement("div");
  columns.className = "details-columns";

  const addColumn = (title, text) => {
    const column = document.createElement("div");
    column.className = "details-column";
    column.innerHTML = `<h5>${escapeHtml(title)}</h5><pre>${escapeHtml(text)}</pre>`;
    columns.appendChild(column);
  };

  addColumn("Imported features", JSON.stringify(result.importedFeatures, null, 2));
  Object.entries(result.exports).forEach(([format, exported]) => {
    addColumn(`Exported ${format}`, exported.content);
  });

  content.appendChild(columns);
  container.appendChild(content);

  button.addEventListener("click", () => {
    content.classList.toggle("visible");
    button.textContent = content.classList.contains("visible") ? "Hide details" : "Show details";
  });

  return container;
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
 * One-line pass/fail count over every file of every suite.
 *
 * @param {Object[]} allResults - Array of all test suite results
 * @returns {string} e.g. "Tests complete: 21/24 passed"
 */
function summarizeResults(allResults) {
  const formatResults = allResults.flatMap((sr) => sr.formatResults);
  const passed = formatResults.filter((fr) => fr.passed).length;
  return `Tests complete: ${passed}/${formatResults.length} passed`;
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

  const appendIssues = (label, issues) => {
    if (issues.length === 0) return;
    text += `  ${label} issues:\n`;
    issues.forEach((issue) => {
      text += `    - ${issue}\n`;
    });
  };

  allResults.forEach((suiteResult) => {
    text += `TEST SUITE: ${suiteResult.config.name}\n`;
    text += "-".repeat(40) + "\n";

    suiteResult.formatResults.forEach((fr) => {
      text += `${fr.passed ? "✓" : "✗"} ${fr.format} (${fr.filename})\n`;

      if (fr.error) {
        text += `  Error: ${fr.error}\n`;
        return;
      }
      appendIssues("Import", fr.importValidation.issues);
      Object.entries(fr.exports).forEach(([format, exported]) => {
        appendIssues(`Export → ${format}`, exported.validation.issues);
      });
    });

    const passed = suiteResult.formatResults.filter((r) => r.passed).length;
    text += `\nSuite total: ${passed}/${suiteResult.formatResults.length} passed\n\n`;
  });

  text += "=".repeat(50) + "\n";
  text += `TOTAL: ${summarizeResults(allResults).replace("Tests complete: ", "")}\n`;

  return text;
}

// Export for module use
if (typeof window !== "undefined") {
  window.TestUI = {
    createTestSuiteElement,
    updateSuiteStatus,
    createFormatTestElement,
    showError,
    clearError,
    updateStatus,
    summarizeResults,
    formatResultsAsText,
  };
}
