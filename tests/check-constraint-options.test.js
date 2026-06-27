const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const test = require("node:test");
const { getTableDetail } = require("../server/services/sqlite/introspection");
const { SqlExecutor } = require("../server/services/sqlite/sqlExecutor");
const { buildTableDesignerDraft } = require("../server/services/sqlite/tableDesigner/schemaMapping");

test("table detail exposes string options from simple CHECK IN constraints", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE stream_company_mentions (
        id INTEGER PRIMARY KEY,
        mention_type TEXT,
        CHECK (
          mention_type IS NULL
          OR mention_type IN (
            'company',
            'stock_company',
            'brand',
            'product',
            'person',
            'organization',
            'terrorists',
            'events',
            'collective_terms',
            'countries',
            'none',
            'unknown'
          )
        )
      );
      INSERT INTO stream_company_mentions (mention_type) VALUES ('company');
    `);

    const tableDetail = getTableDetail(db, "stream_company_mentions");
    const designerDraft = buildTableDesignerDraft(tableDetail);
    const mentionTypeColumn = tableDetail.columns.find(
      (column) => column.name === "mention_type"
    );

    assert.deepEqual(mentionTypeColumn.allowedValues, [
      "company",
      "stock_company",
      "brand",
      "product",
      "person",
      "organization",
      "terrorists",
      "events",
      "collective_terms",
      "countries",
      "none",
      "unknown",
    ]);

    const executor = new SqlExecutor({
      connectionManager: {
        getActiveDatabase: () => db,
        getActiveConnection: () => ({ id: "test" }),
      },
      appStateStore: {
        recordQueryExecution: () => 1,
      },
    });
    const result = executor.execute(
      "SELECT id, mention_type FROM stream_company_mentions"
    );
    const editableColumn = result.editing.columns.find(
      (column) => column.sourceColumn === "mention_type"
    );

    assert.deepEqual(editableColumn.allowedValues, mentionTypeColumn.allowedValues);

    assert.equal(designerDraft.designerVersion, 2);
    assert.equal(designerDraft.checkConstraints.length, 1);
    assert.match(designerDraft.checkConstraints[0].expression, /CHECK/i);
    assert.equal(designerDraft.checkConstraints[0].originalExpression, designerDraft.checkConstraints[0].expression);
    assert.equal(designerDraft.checkConstraints[0].editable, true);
    assert.deepEqual(designerDraft.checkConstraints[0].columns, [
      {
        name: "mention_type",
        allowedValues: mentionTypeColumn.allowedValues,
      },
    ]);
  } finally {
    db.close();
  }
});

test("table detail exposes integer ranges from simple CHECK constraints", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE constrained_numbers (
        id INTEGER PRIMARY KEY,
        priority INTEGER CHECK (priority BETWEEN 2 AND 7),
        score INTEGER CHECK (score >= -5 AND score < 5),
        flag INTEGER CHECK (flag IN (0, 1)),
        severity INTEGER CHECK (severity IN (1, 2, 3)),
        quota INTEGER,
        CHECK (10 <= quota AND quota <= 20)
      );
    `);

    const tableDetail = getTableDetail(db, "constrained_numbers");
    const columns = new Map(tableDetail.columns.map((column) => [column.name, column]));

    assert.deepEqual(columns.get("priority").integerRange, { min: 2, max: 7 });
    assert.deepEqual(columns.get("score").integerRange, { min: -5, max: 4 });
    assert.deepEqual(columns.get("flag").allowedValues, [0, 1]);
    assert.deepEqual(columns.get("severity").allowedValues, [1, 2, 3]);
    assert.deepEqual(columns.get("quota").integerRange, { min: 10, max: 20 });
  } finally {
    db.close();
  }
});
