const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const test = require("node:test");
const { getTableDetail } = require("../server/services/sqlite/introspection");
const { SqlExecutor } = require("../server/services/sqlite/sqlExecutor");

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
  } finally {
    db.close();
  }
});
