const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { TableDesignerService } = require("../server/services/sqlite/tableDesignerService");

const IMPORT_FIXTURE_DIR = path.resolve(__dirname, "fixtures/table-designer-import");

let tableDesignerUtilsModulePromise = null;

function loadTableDesignerUtilsModule() {
  if (!tableDesignerUtilsModulePromise) {
    tableDesignerUtilsModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/utils/tableDesigner.js")).href
    );
  }

  return tableDesignerUtilsModulePromise;
}

function readImportFixture(fileName) {
  return readFileSync(path.join(IMPORT_FIXTURE_DIR, fileName), "utf8");
}

test("table designer import dataset parses csv with shared type inference", async () => {
  const { createImportDatasetFromText } = await loadTableDesignerUtilsModule();
  const dataset = createImportDatasetFromText({
    fileName: "simple.csv",
    format: "csv",
    text: readImportFixture("simple.csv"),
  });

  assert.equal(dataset.format, "csv");
  assert.equal(dataset.delimiter, ",");
  assert.deepEqual(
    dataset.columns.map((column) => [column.targetName, column.inferredType]),
    [
      ["id", "INTEGER"],
      ["name", "TEXT"],
      ["email", "TEXT"],
      ["score", "REAL"],
    ]
  );
  assert.deepEqual(dataset.rows[1], ["2", "Anna, A.", "anna@example.com", "8.2"]);
});

test("table designer import dataset parses tsv through delimited importer", async () => {
  const { createImportDatasetFromText } = await loadTableDesignerUtilsModule();
  const dataset = createImportDatasetFromText({
    fileName: "simple.tsv",
    format: "tsv",
    text: readImportFixture("simple.tsv"),
  });

  assert.equal(dataset.format, "tsv");
  assert.equal(dataset.delimiter, "\t");
  assert.deepEqual(dataset.rows[1], ["2", "Anna\tA.", "8.2"]);
  assert.deepEqual(
    dataset.columns.map((column) => column.inferredType),
    ["INTEGER", "TEXT", "REAL"]
  );
});

test("table designer import dataset parses json root arrays and objects", async () => {
  const { createImportDatasetFromText } = await loadTableDesignerUtilsModule();
  const arrayDataset = createImportDatasetFromText({
    fileName: "users.json",
    format: "json",
    text: readImportFixture("users.json"),
  });
  const objectDataset = createImportDatasetFromText({
    fileName: "user.json",
    format: "json",
    text: readImportFixture("user.json"),
  });

  assert.equal(arrayDataset.format, "json");
  assert.deepEqual(
    arrayDataset.columns.map((column) => [column.targetName, column.inferredType]),
    [
      ["id", "INTEGER"],
      ["name", "TEXT"],
      ["active", "INTEGER"],
    ]
  );
  assert.deepEqual(arrayDataset.rows, [
    [1, "Oliver", 1],
    [2, "Anna", 0],
  ]);
  assert.equal(objectDataset.rowCount, 1);
  assert.deepEqual(objectDataset.rows[0], [1, "Oliver"]);
});

test("table designer import dataset unions json keys and serializes nested values", async () => {
  const { createImportDatasetFromText } = await loadTableDesignerUtilsModule();
  const dataset = createImportDatasetFromText({
    fileName: "mixed-keys.json",
    format: "json",
    text: readImportFixture("mixed-keys.json"),
  });

  assert.deepEqual(
    dataset.columns.map((column) => [column.sourceName, column.inferredType, column.nullable]),
    [
      ["id", "INTEGER", false],
      ["name", "TEXT", true],
      ["metadata", "TEXT", true],
      ["email", "TEXT", true],
      ["tags", "TEXT", true],
    ]
  );
  assert.deepEqual(dataset.rows[0], [1, "Oliver", '{"city":"Salzburg"}', null, null]);
  assert.deepEqual(dataset.rows[1], [2, null, null, "anna@example.com", '["sqlite","json"]']);
});

test("table designer import dataset rejects unsupported json roots", async () => {
  const { createImportDatasetFromText } = await loadTableDesignerUtilsModule();

  assert.throws(
    () =>
      createImportDatasetFromText({
        fileName: "mixed.json",
        format: "json",
        text: '[{"id":1},"hello"]',
      }),
    /MIXED_ARRAY_VALUES_ARE_NOT_SUPPORTED/
  );
  assert.throws(
    () =>
      createImportDatasetFromText({
        fileName: "empty.json",
        format: "json",
        text: "[]",
      }),
    /EMPTY_JSON_ARRAY_IS_NOT_SUPPORTED/
  );
  assert.throws(
    () =>
      createImportDatasetFromText({
        fileName: "primitive.json",
        format: "json",
        text: '"hello"',
      }),
    /JSON_ROOT_VALUE_IS_NOT_SUPPORTED/
  );
});

test("table designer shared sqlite type inference is deterministic", async () => {
  const { inferSQLiteType } = await loadTableDesignerUtilsModule();

  assert.equal(inferSQLiteType(["1", "2", "3"], { columnName: "amount" }), "INTEGER");
  assert.equal(inferSQLiteType(["1", "2.5", "3"], { columnName: "amount" }), "REAL");
  assert.equal(inferSQLiteType(["1", "hello"], { columnName: "amount" }), "TEXT");
  assert.equal(inferSQLiteType([null, "", "2"], { columnName: "amount" }), "INTEGER");
  assert.equal(inferSQLiteType([true, false], { columnName: "active" }), "INTEGER");
});

test("table designer save creates and imports json rows with renamed target columns", async () => {
  const { createTableDesignerDraftFromImport } = await loadTableDesignerUtilsModule();
  const db = new Database(":memory:");
  const service = new TableDesignerService({
    connectionManager: {
      assertWritable() {},
      getActiveDatabase: () => db,
    },
  });

  try {
    const imported = createTableDesignerDraftFromImport({
      fileName: "customers.json",
      format: "json",
      text: readImportFixture("customers.json"),
    });
    const draft = {
      ...imported.draft,
      columns: imported.draft.columns.map((column) =>
        column.name === "name" ? { ...column, name: "customer_name" } : column
      ),
    };

    const result = service.saveDraft({ draft });
    const rows = db
      .prepare('SELECT id, customer_name, active, metadata FROM "customers" ORDER BY id')
      .all();

    assert.equal(result.savedTableName, "customers");
    assert.deepEqual(rows, [
      { id: 1, customer_name: "Oliver", active: 1, metadata: '{"city":"Salzburg"}' },
      { id: 2, customer_name: "Anna", active: 0, metadata: '{"city":"Vienna"}' },
    ]);
  } finally {
    db.close();
  }
});

test("table designer save rolls back table creation when imported rows fail", async () => {
  const { createTableDesignerDraftFromImport } = await loadTableDesignerUtilsModule();
  const db = new Database(":memory:");
  const service = new TableDesignerService({
    connectionManager: {
      assertWritable() {},
      getActiveDatabase: () => db,
    },
  });

  try {
    const imported = createTableDesignerDraftFromImport({
      fileName: "duplicate-users.json",
      format: "json",
      text: readImportFixture("duplicate-users.json"),
    });

    assert.throws(() => service.saveDraft({ draft: imported.draft }), /UNIQUE|constraint/i);
    assert.equal(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'duplicate_users'")
        .get(),
      undefined
    );
  } finally {
    db.close();
  }
});
