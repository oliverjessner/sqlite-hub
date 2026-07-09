const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { AppStateStore } = require("../server/services/storage/appStateStore");
const { recordUserAction } = require("../server/utils/userActionLog");

function createStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-access-log-"));
  const store = new AppStateStore(path.join(directory, "state.db"));

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return store;
}

test("access logs record API and CLI activity separately from query history", (t) => {
  const store = createStore(t);
  const entry = store.recordAccessLog({
    source: "cli",
    action: "cli.tables.list",
    databaseKey: "db-one",
    targetType: "database",
    targetName: "Database One",
    status: "success",
    startedAt: "2026-06-25T10:00:00.000Z",
    durationMs: 12,
    metadata: {
      flags: ["--database", "--tables"],
      databaseLabel: "Database One",
    },
  });

  assert.equal(entry.source, "cli");
  assert.equal(entry.action, "cli.tables.list");
  assert.equal(entry.databaseKey, "db-one");
  assert.equal(entry.status, "success");
  assert.deepEqual(entry.metadata.flags, ["--database", "--tables"]);

  const logs = store.listAccessLogs({ source: "cli", databaseKey: "db-one" });
  assert.equal(logs.total, 1);
  assert.equal(logs.items[0].id, entry.id);
  assert.equal(
    Number(store.db.prepare("SELECT COUNT(*) AS count FROM query_history").get().count),
    0
  );
});

test("access logs record browser user activity", (t) => {
  const store = createStore(t);

  const entry = recordUserAction({
    appStateStore: store,
    connectionManager: {
      getActiveConnection() {
        return {
          id: "db-one",
          label: "Database One",
        };
      },
    },
    action: "data.row.update",
    targetType: "table",
    targetName: "customers",
    metadata: {
      affectedRowCount: 1,
    },
  });

  assert.equal(entry.source, "user");
  assert.equal(entry.action, "data.row.update");
  assert.equal(entry.databaseKey, "db-one");
  assert.equal(entry.targetType, "table");
  assert.equal(entry.targetName, "customers");
  assert.equal(entry.metadata.databaseLabel, "Database One");
  assert.equal(entry.metadata.affectedRowCount, 1);

  const activityLogs = store.listActivityLogs({
    actor: "user",
    databaseKey: "db-one",
  });

  assert.equal(activityLogs.total, 1);
  assert.equal(activityLogs.items[0].source, "user");
  assert.equal(activityLogs.items[0].action, "data.row.update");
});

test("user action logging is best effort", () => {
  const entry = recordUserAction({
    appStateStore: {
      recordAccessLog() {
        throw new Error("logging failed");
      },
    },
    action: "document.create",
  });

  assert.equal(entry, null);
});

test("access log schema migrates existing sources to include user", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-access-log-migration-"));
  const databasePath = path.join(directory, "state.db");
  const db = new Database(databasePath);

  db.exec(`
    CREATE TABLE access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL CHECK(source IN ('api', 'cli')),
      action TEXT NOT NULL,
      database_key TEXT,
      target_type TEXT,
      target_name TEXT,
      status TEXT NOT NULL CHECK(status IN ('success', 'error')),
      started_at TEXT NOT NULL,
      duration_ms INTEGER,
      error_message TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    INSERT INTO access_log (
      source,
      action,
      database_key,
      target_type,
      target_name,
      status,
      started_at,
      metadata_json
    )
    VALUES (
      'cli',
      'cli.tables.list',
      'db-one',
      'database',
      'Database One',
      'success',
      '2026-06-25T10:00:00.000Z',
      '{}'
    );
  `);
  db.close();

  const store = new AppStateStore(databasePath);

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const entry = store.recordAccessLog({
    source: "user",
    action: "document.create",
    databaseKey: "db-one",
    targetType: "document",
    targetName: "notes.md",
    status: "success",
  });
  const logs = store.listAccessLogs({ databaseKey: "db-one" });

  assert.equal(entry.source, "user");
  assert.equal(logs.total, 2);
});
