const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const test = require("node:test");
const { DataBrowserService } = require("../server/services/sqlite/dataBrowserService");

function createService(db) {
  return new DataBrowserService({
    connectionManager: {
      assertWritable() {},
      getActiveDatabase: () => db,
    },
  });
}

test("data browser previews and inserts synthetic rows from real table columns", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE contacts (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('trial', 'active')),
        is_active INTEGER NOT NULL DEFAULT 1,
        score REAL,
        created_at DATETIME
      );
    `);

    const service = createService(db);
    const payload = {
      rowCount: 12,
      mappings: [
        { columnName: "email", generator: "email" },
        { columnName: "status", generator: "oneOf", options: { values: "trial, active" } },
        { columnName: "is_active", generator: "boolean", options: { trueProbability: 100 } },
        { columnName: "score", generator: "randomDecimal", options: { min: 1, max: 2, decimals: 2 } },
        { columnName: "created_at", generator: "timestamp", options: { range: "last30" } },
      ],
    };

    const preview = service.previewSyntheticRows("contacts", payload);

    assert.equal(preview.tableName, "contacts");
    assert.equal(preview.rowCount, 12);
    assert.equal(preview.previewRowCount, 10);
    assert.equal(preview.rows.length, 10);
    assert.deepEqual(preview.columns, ["id", "email", "status", "is_active", "score", "created_at"]);
    assert.equal(preview.rows[0].id, null);
    assert.match(preview.rows[0].email, /@example\.test$/);
    assert.match(preview.rows[0].status, /^(trial|active)$/);
    assert.equal(preview.rows[0].is_active, 1);

    const inserted = service.insertSyntheticRows("contacts", payload);
    const count = db.prepare("SELECT COUNT(*) AS count FROM contacts").get().count;
    const row = db.prepare("SELECT id, email, status, is_active, score FROM contacts ORDER BY id LIMIT 1").get();

    assert.equal(inserted.insertedRowCount, 12);
    assert.equal(count, 12);
    assert.equal(row.id, 1);
    assert.match(row.email, /@example\.test$/);
    assert.match(row.status, /^(trial|active)$/);
    assert.equal(row.is_active, 1);
    assert.equal(typeof row.score, "number");
  } finally {
    db.close();
  }
});

test("synthetic row generation rejects skipped required columns without defaults", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE required_values (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL
      );
    `);

    const service = createService(db);

    assert.throws(
      () =>
        service.previewSyntheticRows("required_values", {
          rowCount: 1,
          mappings: [{ columnName: "email", generator: "skip" }],
        }),
      /email is required and cannot be skipped/
    );
  } finally {
    db.close();
  }
});
