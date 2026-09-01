const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const { AppStateStore } = require("../server/services/storage/appStateStore");

function createStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-clear-history-"));
  const store = new AppStateStore(path.join(directory, "state.db"));

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return store;
}

test("Clear Recent is available from the query-history overflow menu", async () => {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, "../frontend/js/components/queryHistoryPanel.js")
  ).href;
  const { renderQueryHistoryPanel } = await import(`${moduleUrl}?clear-recent=${Date.now()}`);
  const recentMarkup = renderQueryHistoryPanel({
    activeTab: "recent",
    total: 2,
    items: [{ id: 1, isSaved: false }],
  });
  const savedMarkup = renderQueryHistoryPanel({
    activeTab: "saved",
    total: 1,
    items: [{ id: 2, isSaved: true }],
  });
  const savedOnlyRecentMarkup = renderQueryHistoryPanel({
    activeTab: "recent",
    total: 1,
    items: [{ id: 2, isSaved: true }],
  });

  assert.match(recentMarkup, /data-action="open-clear-query-history-modal"/);
  assert.match(recentMarkup, /data-dropdown-button/);
  assert.match(recentMarkup, />more_horiz<\/span>/);
  assert.match(recentMarkup, /Clear Recent/);
  assert.doesNotMatch(recentMarkup, /aria-disabled="true"/);
  assert.match(savedMarkup, /open-clear-query-history-modal/);
  assert.match(savedOnlyRecentMarkup, /open-clear-query-history-modal/);
});

test("Clear Recent confirmation explains the permanent database deletion", async () => {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, "../frontend/js/components/modal.js")
  ).href;
  const { renderModal } = await import(`${moduleUrl}?clear-recent-modal=${Date.now()}`);
  const html = renderModal({
    modal: {
      kind: "clear-query-history",
      databaseLabel: "Games",
      error: null,
      submitting: false,
    },
    connections: { recent: [] },
    charts: { result: null, detail: null },
    documents: { selectedId: null },
    editor: { result: null },
    mediaTagging: { config: null },
    tableDesigner: { draft: null },
  });

  assert.match(html, /data-form="clear-query-history-confirm"/);
  assert.match(html, /permanently deletes all non-saved query-history entries/);
  assert.match(html, /Saved queries and their linked data are kept/);
});

test("clearing recent history deletes only non-saved rows for the selected database", (t) => {
  const store = createStore(t);
  const saved = store.createStoredQuery({
    databaseKey: "db-one",
    rawSql: "SELECT category, total FROM metrics",
    title: "Metric totals",
  }).query;
  const recentId = store.recordQueryExecution({
    databaseKey: "db-one",
    rawSql: "SELECT category, total FROM recent_metrics",
    status: "success",
  });
  const otherDatabase = store.createStoredQuery({
    databaseKey: "db-two",
    rawSql: "SELECT * FROM customers",
    title: "Customers",
  }).query;

  const savedChart = store.createQueryHistoryChart({
    databaseKey: "db-one",
    queryHistoryId: saved.id,
    name: "Saved totals",
    chartType: "bar",
    config: { x_column: "category", y_column: "total" },
  });
  const recentChart = store.createQueryHistoryChart({
    databaseKey: "db-one",
    queryHistoryId: recentId,
    name: "Recent totals",
    chartType: "bar",
    config: { x_column: "category", y_column: "total" },
  });

  assert.deepEqual(
    store.getQueryHistoryChartsForDatabase("db-one", { onlyUnsaved: true }).map(chart => chart.id),
    [recentChart.id]
  );
  assert.equal(store.clearRecentQueryHistoryForDatabase("db-one"), 1);
  assert.throws(() => store.getQueryHistoryItemById(recentId, "db-one"), /not found/i);
  assert.equal(store.getQueryHistoryItemById(saved.id, "db-one").title, "Metric totals");
  assert.deepEqual(store.getQueryHistoryChartsForDatabase("db-one").map(chart => chart.id), [savedChart.id]);
  assert.equal(store.getQueryHistoryItemById(otherDatabase.id, "db-two").title, "Customers");
});

test("Clear Recent action and confirmation are wired through the app", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../frontend/js/app.js"), "utf8");

  assert.match(source, /case 'open-clear-query-history-modal':[\s\S]{0,100}?openClearQueryHistoryModal\(\);/);
  assert.match(source, /case 'clear-query-history-confirm':[\s\S]{0,100}?submitClearQueryHistoryConfirmation\(\);/);
});
