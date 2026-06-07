const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DataBrowserService } = require("../server/services/sqlite/dataBrowserService");

let timestampPreviewModulePromise = null;

function loadTimestampPreviewModule() {
  if (!timestampPreviewModulePromise) {
    const source = readFileSync(
      path.resolve(__dirname, "../frontend/js/utils/timestampPreview.js"),
      "utf8"
    );
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

    timestampPreviewModulePromise = import(url);
  }

  return timestampPreviewModulePromise;
}

function createTableMeta() {
  return {
    columns: [
      { name: "id", primaryKeyPosition: 1 },
      { name: "parent_id", primaryKeyPosition: 0 },
      { name: "created_at", primaryKeyPosition: 0 },
      { name: "updated_at", primaryKeyPosition: 0 },
      { name: "published_at", primaryKeyPosition: 0 },
      { name: "price", primaryKeyPosition: 0 },
    ],
    foreignKeys: [
      {
        mappings: [{ from: "parent_id", to: "id" }],
      },
    ],
  };
}

test("row editor timestamp preview protects primary and foreign keys", async () => {
  const {
    getTimestampPreviewForField,
    isProtectedKeyColumn,
  } = await loadTimestampPreviewModule();
  const tableMeta = createTableMeta();

  assert.equal(isProtectedKeyColumn("id", tableMeta), true);
  assert.equal(isProtectedKeyColumn("parent_id", tableMeta), true);

  assert.equal(
    getTimestampPreviewForField({
      columnName: "id",
      value: "1717682400",
      tableMeta,
    }).kind,
    "protected-key"
  );
  assert.equal(
    getTimestampPreviewForField({
      columnName: "parent_id",
      value: "1717682400",
      tableMeta,
    }).kind,
    "protected-key"
  );
});

test("row editor timestamp preview formats plausible non-key timestamp values", async () => {
  const { getTimestampPreviewForField } = await loadTimestampPreviewModule();
  const tableMeta = createTableMeta();

  const createdAtPreview = getTimestampPreviewForField({
    columnName: "created_at",
    value: "1717682400",
    tableMeta,
  });
  const updatedAtPreview = getTimestampPreviewForField({
    columnName: "updated_at",
    value: "1717682400000",
    tableMeta,
  });
  const pricePreview = getTimestampPreviewForField({
    columnName: "price",
    value: "1717682400",
    tableMeta,
  });
  const publishedAtPreview = getTimestampPreviewForField({
    columnName: "published_at",
    value: "1717682400000000",
    tableMeta,
  });

  assert.equal(createdAtPreview.kind, "timestamp");
  assert.equal(createdAtPreview.sourceFormat, "unix-seconds");
  assert.equal(updatedAtPreview.kind, "timestamp");
  assert.equal(updatedAtPreview.sourceFormat, "unix-milliseconds");
  assert.equal(publishedAtPreview.kind, "timestamp");
  assert.equal(publishedAtPreview.sourceFormat, "unix-microseconds");
  assert.equal(pricePreview.kind, "timestamp");
  assert.match(createdAtPreview.formatted, /^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/);
});

test("row editor timestamp preview ignores ids and invalid timestamps", async () => {
  const { getTimestampPreviewForField } = await loadTimestampPreviewModule();
  const tableMeta = createTableMeta();

  assert.equal(
    getTimestampPreviewForField({
      columnName: "external_id",
      value: "1717682400",
      tableMeta,
    }).kind,
    "none"
  );
  assert.equal(
    getTimestampPreviewForField({
      columnName: "created_at",
      value: "42",
      tableMeta,
    }).kind,
    "none"
  );
  assert.equal(
    getTimestampPreviewForField({
      columnName: "created_at",
      value: "not a timestamp",
      tableMeta,
    }).kind,
    "none"
  );
});

test("row editor timestamp preview accepts ISO and SQLite datetime strings", async () => {
  const { getTimestampPreviewForField } = await loadTimestampPreviewModule();
  const tableMeta = createTableMeta();

  assert.equal(
    getTimestampPreviewForField({
      columnName: "created_at",
      value: "2026-06-06T18:49:00Z",
      tableMeta,
    }).kind,
    "timestamp"
  );
  assert.equal(
    getTimestampPreviewForField({
      columnName: "updated_at",
      value: "2026-06-06 18:49:00",
      tableMeta,
    }).kind,
    "timestamp"
  );
});

test("row update stores the submitted raw value without date conversion", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        created_at TEXT
      );
      INSERT INTO events (id, created_at) VALUES (1, 'before');
    `);

    const service = new DataBrowserService({
      connectionManager: {
        assertWritable() {},
        getActiveDatabase: () => db,
      },
    });
    const tableData = service.getTableData("events", { limit: 10, offset: 0 });
    const identity = tableData.rows[0].__identity;

    service.updateTableRow("events", {
      identity,
      values: {
        created_at: "1717682400",
      },
    });

    assert.equal(
      db.prepare("SELECT created_at FROM events WHERE id = 1").get().created_at,
      "1717682400"
    );
  } finally {
    db.close();
  }
});
