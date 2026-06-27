const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ConnectionManager } = require("../server/services/sqlite/connectionManager");
const { AppStateStore } = require("../server/services/storage/appStateStore");

function createStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-connection-remove-"));
  const store = new AppStateStore(path.join(directory, "state.db"));

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return { directory, store };
}

function tableExists(store, tableName) {
  return Boolean(
    store.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName)
  );
}

test("app state no longer creates legacy sql_history for connection removal", (t) => {
  const { directory, store } = createStore(t);
  const firstConnection = {
    id: "db-one",
    label: "One",
    path: path.join(directory, "one.db"),
    lastOpenedAt: "2026-06-21T10:00:00.000Z",
    lastModifiedAt: null,
    sizeBytes: 0,
    readOnly: false,
    logoPath: null,
  };
  const secondConnection = {
    ...firstConnection,
    id: "db-two",
    label: "Two",
    path: path.join(directory, "two.db"),
  };
  const manager = new ConnectionManager({ appStateStore: store });

  store.upsertRecentConnection(firstConnection);
  store.upsertRecentConnection(secondConnection, { makeActive: false });

  assert.equal(tableExists(store, "sql_history"), false);

  const remaining = manager.removeRecentConnection(firstConnection.id);

  assert.deepEqual(
    remaining.map((connection) => connection.id),
    ["db-two"]
  );
});
