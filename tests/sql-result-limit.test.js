const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_RESULT_ROW_LIMIT,
  SqlExecutor,
} = require("../server/services/sqlite/sqlExecutor");

function createExecutor(db) {
  return new SqlExecutor({
    connectionManager: {
      getActiveDatabase: () => db,
      getActiveConnection: () => ({ id: "result-limit-test" }),
    },
    appStateStore: {
      recordQueryExecution: () => 1,
    },
  });
}

test("interactive SQL results stop at the configured row limit", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT);
      INSERT INTO items (label) VALUES ('one'), ('two'), ('three'), ('four'), ('five');
    `);

    const result = createExecutor(db).execute("SELECT id, label FROM items ORDER BY id", {
      maxRows: 3,
    });

    assert.equal(DEFAULT_RESULT_ROW_LIMIT, 5000);
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.rows.map((row) => row.id), [1, 2, 3]);
    assert.equal(result.truncated, true);
    assert.equal(result.rowLimit, 3);
    assert.equal(result.statements[0].truncated, true);
    assert.equal(result.statements[0].rowCount, 3);
  } finally {
    db.close();
  }
});

test("unlimited SQL execution remains available for export services", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE items (id INTEGER PRIMARY KEY);
      INSERT INTO items VALUES (1), (2), (3), (4), (5);
    `);

    const result = createExecutor(db).execute("SELECT id FROM items ORDER BY id", {
      maxRows: null,
      persistHistory: false,
    });

    assert.equal(result.rows.length, 5);
    assert.equal(result.truncated, false);
    assert.equal(result.rowLimit, null);
  } finally {
    db.close();
  }
});
