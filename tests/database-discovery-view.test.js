const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

function fixtureResult(overrides = {}) {
  return {
    id: "db-1",
    name: "History",
    path: "/Users/test/Library/Application Support/Arc/History",
    normalizedPath: "/users/test/library/application support/arc/history",
    sizeBytes: 1024 * 1024,
    modifiedAt: "2026-07-13T12:00:00.000Z",
    extension: null,
    isReadable: true,
    isWritable: true,
    hasWal: true,
    hasShm: true,
    likelyInUse: true,
    applicationName: "Arc",
    bundleIdentifier: "company.thebrowser.Browser",
    sourceDirectory: "Application Support",
    tableCount: 2,
    tableNames: ["urls", "visits"],
    sqliteVersion: "3.50.0",
    previewStatus: "loaded",
    previewError: null,
    isAlreadyConnected: false,
    existingConnectionId: null,
    ...overrides,
  };
}

function fixtureModal(results) {
  return {
    kind: "database-discovery",
    error: null,
    submitting: false,
    locationsLoading: false,
    locations: [
      { key: "applicationSupport", label: "Application Support", path: "/Users/test/Library/Application Support", optional: false },
    ],
    selectedLocationKeys: ["applicationSupport"],
    customDirectories: [],
    showAlreadyConnected: true,
    sessionId: "scan-1",
    scanStatus: "completed",
    progress: {
      scannedDirectories: 5,
      scannedFiles: 20,
      discoveredCount: results.length,
      alreadyConnectedCount: 1,
      inaccessibleCount: 0,
      currentPath: "",
    },
    results,
    selectedIds: ["db-1"],
    selectedResultId: "db-1",
    previewLoading: false,
    search: "",
    sourceDirectory: "all",
    writableOnly: false,
    walOnly: false,
    recentOnly: false,
    minSizeMb: "",
    maxSizeMb: "",
    sortBy: "modifiedAt",
    sortDirection: "desc",
    confirmingImport: false,
  };
}

test("Connections exposes Find Installed Databases with and without saved connections", async () => {
  const { renderConnectionsView } = await import(
    pathToFileURL(path.resolve(__dirname, "../frontend/js/views/connections.js")).href
  );
  const baseConnections = {
    recent: [], active: null, loading: false, error: null, searchQuery: "", selectedTagIds: [], tags: [], highlightedConnectionIds: [],
  };
  const empty = renderConnectionsView({ connections: baseConnections });
  const populated = renderConnectionsView({
    connections: {
      ...baseConnections,
      recent: [{ id: "one", label: "One", path: "/tmp/one.db", sizeBytes: 1, tags: [] }],
    },
  });

  assert.match(empty.main, /Find Installed Databases/);
  assert.match(empty.main, /data-action="open-database-discovery"/);
  assert.match(populated.main, /Find Installed Databases/);
});

test("database discovery modal renders scan, filters, selection, preview, and disabled connected rows", async () => {
  const [{ renderModal }, store] = await Promise.all([
    import(pathToFileURL(path.resolve(__dirname, "../frontend/js/components/modal.js")).href),
    import(`${pathToFileURL(path.resolve(__dirname, "../frontend/js/store.js")).href}?database-discovery-modal`),
  ]);
  const results = [
    fixtureResult(),
    fixtureResult({ id: "db-2", name: "Cookies", path: "/tmp/Cookies", isAlreadyConnected: true, existingConnectionId: "conn-2" }),
  ];
  store.openModal("database-discovery", fixtureModal(results));
  const markup = renderModal(store.getState());

  assert.match(markup, /Find Installed Databases/);
  assert.match(markup, /Scanning happens locally on this computer/);
  assert.match(markup, /data-bind="database-discovery-field"/);
  assert.match(markup, /class="control-input[^\"]*bg-surface-container-lowest[^\"]*" data-bind="database-discovery-field" data-field="search"/);
  assert.match(markup, /class="control-select[^\"]*bg-surface-container-lowest[^\"]*" data-bind="database-discovery-field" data-field="sourceDirectory"/);
  assert.match(markup, /Reveal in Finder/);
  assert.match(markup, /Copy path/);
  assert.match(markup, /Already connected/);
  assert.match(markup, /data-result-id="db-2" type="checkbox"[^>]*disabled/);
  assert.match(markup, /Tables \(2\)/);
  assert.match(markup, /Import 1 database/);
});

test("database discovery selection selects multiple importable rows but never connected rows", async () => {
  const store = await import(
    `${pathToFileURL(path.resolve(__dirname, "../frontend/js/store.js")).href}?database-discovery-selection`
  );
  const results = [
    fixtureResult(),
    fixtureResult({ id: "db-2", name: "Cookies", path: "/tmp/Cookies" }),
    fixtureResult({ id: "db-3", name: "Known", path: "/tmp/Known", isAlreadyConnected: true }),
  ];
  store.openModal("database-discovery", fixtureModal(results));
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });
  store.clearDiscoveredDatabaseSelection({ notify: false });
  store.toggleDiscoveredDatabaseSelection("db-1", true, { notify: false });
  store.toggleDiscoveredDatabaseSelection("db-2", true, { notify: false });
  store.toggleDiscoveredDatabaseSelection("db-3", true, { notify: false });

  assert.deepEqual(store.getState().modal.selectedIds.sort(), ["db-1", "db-2"]);

  store.clearDiscoveredDatabaseSelection({ notify: false });
  store.selectAllDiscoveredDatabases({ notify: false });
  assert.deepEqual(store.getState().modal.selectedIds.sort(), ["db-1", "db-2"]);
  assert.equal(notifications, 0);
  unsubscribe();
});
