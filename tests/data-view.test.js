const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let dataViewModulePromise = null;

function loadDataViewModule() {
  if (!dataViewModulePromise) {
    dataViewModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/views/data.js")).href
    );
  }

  return dataViewModulePromise;
}

function createDataState(overrides = {}) {
  return {
    route: { name: "data" },
    dataBrowser: {
      loading: false,
      selectedTable: "users",
      tableSearchQuery: "",
      tablesVisible: true,
      tables: [
        { name: "users", columnCount: 3 },
        { name: "orders", columnCount: 5, isVirtual: true, tableKind: "virtual" },
      ],
      ...overrides,
    },
  };
}

test("data sidebar signature ignores active table selection", async () => {
  const { buildDataSidebarSignature } = await loadDataViewModule();
  const usersActive = buildDataSidebarSignature(createDataState({ selectedTable: "users" }));
  const ordersActive = buildDataSidebarSignature(createDataState({ selectedTable: "orders" }));

  assert.equal(ordersActive, usersActive);
});

test("data sidebar signature changes when sidebar content changes", async () => {
  const { buildDataSidebarSignature } = await loadDataViewModule();
  const baseSignature = buildDataSidebarSignature(createDataState());

  assert.notEqual(
    buildDataSidebarSignature(createDataState({ tableSearchQuery: "ord" })),
    baseSignature
  );
  assert.notEqual(
    buildDataSidebarSignature(
      createDataState({
        tables: [
          { name: "users", columnCount: 4 },
          { name: "orders", columnCount: 5, isVirtual: true, tableKind: "virtual" },
        ],
      })
    ),
    baseSignature
  );
  assert.notEqual(buildDataSidebarSignature(createDataState({ tablesVisible: false })), baseSignature);
  assert.equal(buildDataSidebarSignature({ route: { name: "overview" }, dataBrowser: {} }), "");
});
