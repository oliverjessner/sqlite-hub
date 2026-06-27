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
    assert.equal(preview.previewRowCount, 3);
    assert.equal(preview.rows.length, 3);
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

test("synthetic row generation uses existing single-column foreign key values", () => {
  const db = new Database(":memory:");

  try {
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );

      INSERT INTO users (id, name) VALUES
        (10, 'Ada'),
        (20, 'Grace');

      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL
      );
    `);

    const service = createService(db);
    const preview = service.previewSyntheticRows("posts", { rowCount: 6 });
    const userMapping = preview.mappings.find((mapping) => mapping.columnName === "user_id");

    assert.equal(preview.previewRowCount, 3);
    assert.equal(userMapping.generator, "existingForeignKey");
    assert.deepEqual(userMapping.options, {
      referencedTable: "users",
      referencedColumn: "id",
    });
    assert.ok([10, 20].includes(preview.rows[0].user_id));

    const inserted = service.insertSyntheticRows("posts", { rowCount: 6 });
    const invalidCount = db
      .prepare("SELECT COUNT(*) AS count FROM posts WHERE user_id NOT IN (10, 20)")
      .get().count;

    assert.equal(inserted.insertedRowCount, 6);
    assert.equal(invalidCount, 0);
  } finally {
    db.close();
  }
});

test("synthetic row generation respects integer check ranges", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE constrained_numbers (
        id INTEGER PRIMARY KEY,
        score INTEGER NOT NULL CHECK (score >= 5 AND score <= 7)
      );
    `);

    const service = createService(db);
    const preview = service.previewSyntheticRows("constrained_numbers", { rowCount: 20 });
    const scoreMapping = preview.mappings.find((mapping) => mapping.columnName === "score");

    assert.equal(scoreMapping.generator, "randomInteger");
    assert.deepEqual(scoreMapping.options, { min: 5, max: 7 });
    assert.ok(preview.rows.every((row) => row.score >= 5 && row.score <= 7));

    const inserted = service.insertSyntheticRows("constrained_numbers", { rowCount: 20 });
    const invalidCount = db
      .prepare("SELECT COUNT(*) AS count FROM constrained_numbers WHERE score < 5 OR score > 7")
      .get().count;

    assert.equal(inserted.insertedRowCount, 20);
    assert.equal(invalidCount, 0);
  } finally {
    db.close();
  }
});

test("synthetic row generation treats numeric 0/1 checks as booleans", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE row_editor_samples (
        id INTEGER PRIMARY KEY,
        boolean_value INTEGER NOT NULL CHECK (boolean_value IN (0, 1))
      );
    `);

    const service = createService(db);
    const preview = service.previewSyntheticRows("row_editor_samples", { rowCount: 20 });
    const booleanMapping = preview.mappings.find(
      (mapping) => mapping.columnName === "boolean_value"
    );

    assert.equal(booleanMapping.generator, "boolean");
    assert.deepEqual(booleanMapping.options, { trueProbability: 50 });
    assert.ok(preview.rows.every((row) => row.boolean_value === 0 || row.boolean_value === 1));

    const inserted = service.insertSyntheticRows("row_editor_samples", { rowCount: 20 });
    const invalidCount = db
      .prepare("SELECT COUNT(*) AS count FROM row_editor_samples WHERE boolean_value NOT IN (0, 1)")
      .get().count;

    assert.equal(inserted.insertedRowCount, 20);
    assert.equal(invalidCount, 0);
  } finally {
    db.close();
  }
});

test("synthetic row generation rejects required foreign keys without parent values", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY
      );

      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL
      );
    `);

    const service = createService(db);

    assert.throws(
      () => service.previewSyntheticRows("posts", { rowCount: 1 }),
      /user_id references users\.id, but no parent values exist/
    );
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
