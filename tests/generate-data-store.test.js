const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

async function importStore() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, "../frontend/js/store.js")).href;
  const store = await import(`${moduleUrl}?generate-data-store=${Date.now()}`);

  return store;
}

test("generate data field change does not rerender when input already updated state", async () => {
  const store = await importStore();

  store.openModal("generate-data", {
    tableName: "checks",
    columns: [
      {
        name: "score",
        visible: true,
        generated: false,
        primaryKeyPosition: 0,
        declaredType: "INTEGER",
        affinity: "INTEGER",
      },
    ],
    rowCount: 100,
    mappings: [{ columnName: "score", generator: "randomInteger", options: { min: 1, max: 1000 } }],
    previewColumns: ["score"],
    previewRows: [],
    previewLoading: false,
    previewRequestId: 0,
  });

  let renderCount = 0;
  const unsubscribe = store.subscribe(() => {
    renderCount += 1;
  });

  try {
    store.updateGenerateDataModal("rowCount", "12", { notify: false });
    store.updateGenerateDataModal("rowCount", "12");
    store.updateGenerateDataMapping("score", "min", "5", { notify: false });
    store.updateGenerateDataMapping("score", "min", "5");

    assert.equal(renderCount, 0);
    assert.equal(store.getState().modal.rowCount, "12");
    assert.equal(
      store.getState().modal.mappings.find((mapping) => mapping.columnName === "score").options.min,
      "5"
    );
  } finally {
    unsubscribe();
  }
});
