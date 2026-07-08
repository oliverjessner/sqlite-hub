const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { TableDesignerService } = require("../server/services/sqlite/tableDesignerService");

let tableDesignerUtilsModulePromise = null;
let storeModulePromise = null;

function loadTableDesignerUtilsModule() {
  if (!tableDesignerUtilsModulePromise) {
    tableDesignerUtilsModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/utils/tableDesigner.js")).href
    );
  }

  return tableDesignerUtilsModulePromise;
}

function loadStoreModule() {
  if (!storeModulePromise) {
    storeModulePromise = import(pathToFileURL(path.resolve(__dirname, "../frontend/js/store.js")).href);
  }

  return storeModulePromise;
}

function createProductsDraft(overrides = {}) {
  return {
    mode: "create",
    tableName: "products",
    columns: [
      {
        id: "column:id",
        name: "id",
        type: "INTEGER",
        primaryKey: true,
        notNull: false,
        unique: false,
        defaultValue: "",
        referencesTable: "",
        referencesColumn: "",
      },
      {
        id: "column:price",
        name: "price",
        type: "REAL",
        primaryKey: false,
        notNull: true,
        unique: false,
        defaultValue: "0",
        referencesTable: "",
        referencesColumn: "",
      },
    ],
    uniqueConstraints: [],
    checkConstraints: [],
    ...overrides,
  };
}

test("table designer check presets build escaped SQL expressions", async () => {
  const { buildTableDesignerCheckPresetExpression } = await loadStoreModule();
  const textColumn = { id: "column:display-name", name: 'display "name', type: "TEXT" };
  const priceColumn = { id: "column:price", name: "price", type: "REAL" };
  const booleanColumn = { id: "column:in-stock", name: "in_stock", type: "INTEGER" };

  assert.equal(
    buildTableDesignerCheckPresetExpression("text-non-empty", textColumn),
    'length(trim("display ""name")) > 0'
  );
  assert.equal(
    buildTableDesignerCheckPresetExpression("text-min-length", textColumn, { minLength: "3" }),
    'length("display ""name") >= 3'
  );
  assert.equal(
    buildTableDesignerCheckPresetExpression("text-max-length", textColumn, { maxLength: "255" }),
    'length("display ""name") <= 255'
  );
  assert.equal(
    buildTableDesignerCheckPresetExpression("text-length-range", textColumn, {
      minLength: "3",
      maxLength: "255",
    }),
    'length("display ""name") BETWEEN 3 AND 255'
  );
  assert.equal(
    buildTableDesignerCheckPresetExpression("text-allowed-values", { name: "status" }, {
      allowedValues: "draft\npublished\narchived",
    }),
    "\"status\" IN ('draft', 'published', 'archived')"
  );
  assert.equal(buildTableDesignerCheckPresetExpression("numeric-positive", priceColumn), '"price" > 0');
  assert.equal(buildTableDesignerCheckPresetExpression("numeric-non-negative", priceColumn), '"price" >= 0');
  assert.equal(
    buildTableDesignerCheckPresetExpression("numeric-range", priceColumn, {
      minValue: "10",
      maxValue: "100",
    }),
    '"price" BETWEEN 10 AND 100'
  );
  assert.equal(buildTableDesignerCheckPresetExpression("boolean-integer", booleanColumn), '"in_stock" IN (0, 1)');
});

test("table designer SQL preview includes table-level check constraints", async () => {
  const { addTableDesignerCheckConstraint, recalculateTableDesignerDraft } =
    await loadTableDesignerUtilsModule();
  const draft = addTableDesignerCheckConstraint(
    createProductsDraft(),
    {
      expression: '"price" >= 0',
      columnId: "column:price",
      columns: [{ name: "price", allowedValues: [] }],
      source: "user",
    },
    {}
  );
  const withSecondCheck = addTableDesignerCheckConstraint(
    draft,
    {
      expression: '"price" <= 1000',
      columnId: "column:price",
      columns: [{ name: "price", allowedValues: [] }],
      source: "user",
    },
    {}
  );
  const recalculated = recalculateTableDesignerDraft(withSecondCheck);
  const db = new Database(":memory:");

  try {
    assert.match(recalculated.sqlPreview, /CHECK \("price" >= 0\)/);
    assert.match(recalculated.sqlPreview, /CHECK \("price" <= 1000\)/);
    assert.doesNotMatch(recalculated.sqlPreview, /,\s*,/);
    db.exec(recalculated.sqlPreview);
  } finally {
    db.close();
  }
});

test("table designer service validates and saves check constraints with SQLite", () => {
  const db = new Database(":memory:");
  const service = new TableDesignerService({
    connectionManager: {
      assertWritable() {},
      getActiveDatabase: () => db,
    },
  });
  const draft = createProductsDraft({
    checkConstraints: [
      {
        id: "check:price",
        expression: '"price" >= 0',
        columnId: "column:price",
        columns: [{ name: "price", allowedValues: [] }],
        source: "user",
      },
    ],
  });

  try {
    const validation = service.validateCheckExpression({ draft, expression: '"price" >= 0' });
    assert.deepEqual(validation, {
      valid: true,
      generatedSql: 'CHECK ("price" >= 0)',
    });

    const result = service.saveDraft({ draft });
    const schema = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'products'")
      .get().sql;

    assert.equal(result.savedTableName, "products");
    assert.match(schema, /CHECK \("price" >= 0\)/);
    db.prepare('INSERT INTO "products" ("id", "price") VALUES (?, ?)').run(1, 10);
    assert.throws(
      () => db.prepare('INSERT INTO "products" ("id", "price") VALUES (?, ?)').run(2, -1),
      /CHECK constraint failed/i
    );
  } finally {
    db.close();
  }
});

test("table designer check validation rejects empty, unsafe, and unknown-column expressions", () => {
  const db = new Database(":memory:");
  const service = new TableDesignerService({
    connectionManager: {
      assertWritable() {},
      getActiveDatabase: () => db,
    },
  });
  const draft = createProductsDraft();

  try {
    assert.throws(
      () => service.validateCheckExpression({ draft, expression: "" }),
      /CHECK expression is required/
    );
    assert.throws(
      () => service.validateCheckExpression({ draft, expression: '"price" >= 0; DROP TABLE products' }),
      /single SQL fragment/
    );
    assert.throws(
      () => service.validateCheckExpression({ draft, expression: '"missing" >= 0' }),
      /no such column|SQLITE_ERROR/i
    );
  } finally {
    db.close();
  }
});
