const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { AppStateStore } = require("../server/services/storage/appStateStore");

function createStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-chart-list-"));
  const store = new AppStateStore(path.join(directory, "state.db"));

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return store;
}

test("chart list is scoped to a database and includes its query title", (t) => {
  const store = createStore(t);
  const firstQuery = store.createStoredQuery({
    databaseKey: "db-one",
    rawSql: "SELECT category, total FROM metrics",
    title: "Metric totals",
  }).query;
  const secondQuery = store.createStoredQuery({
    databaseKey: "db-two",
    rawSql: "SELECT category, total FROM other_metrics",
    title: "Other totals",
  }).query;

  const firstChart = store.createQueryHistoryChart({
    databaseKey: "db-one",
    queryHistoryId: firstQuery.id,
    name: "Totals",
    chartType: "bar",
    config: { x_column: "category", y_column: "total" },
  });
  store.createQueryHistoryChart({
    databaseKey: "db-two",
    queryHistoryId: secondQuery.id,
    name: "Other",
    chartType: "bar",
    config: { x_column: "category", y_column: "total" },
  });

  const charts = store.getQueryHistoryChartsForDatabase("db-one");

  assert.equal(charts.length, 1);
  assert.equal(charts[0].id, firstChart.id);
  assert.equal(charts[0].queryTitle, "Metric totals");
  assert.deepEqual(store.getQueryHistoryChartsForDatabase("missing"), []);
});
