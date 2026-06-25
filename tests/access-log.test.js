const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { AppStateStore } = require("../server/services/storage/appStateStore");

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

