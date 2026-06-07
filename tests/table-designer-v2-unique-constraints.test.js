const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const test = require("node:test");
const { getTableDetail } = require("../server/services/sqlite/introspection");
const { analyzeTableDesignerChanges } = require("../server/services/sqlite/tableDesigner/changeAnalysis");
const { buildTableDesignerDraft } = require("../server/services/sqlite/tableDesigner/schemaMapping");

test("table designer draft exposes v2 complex unique constraints", () => {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE TABLE companies (
        company_id INTEGER NOT NULL,
        ticker TEXT NOT NULL,
        deleted_at TEXT,
        name TEXT,
        UNIQUE (company_id, ticker)
      );
      CREATE UNIQUE INDEX uniq_active_company_ticker
        ON companies (ticker)
        WHERE deleted_at IS NULL;
    `);

    const tableDetail = getTableDetail(db, "companies", { includeRowCount: false });
    const draft = buildTableDesignerDraft(tableDetail);

    assert.equal(draft.designerVersion, 2);
    assert.equal(draft.uniqueConstraints.length, 2);

    const multiColumnConstraint = draft.uniqueConstraints.find(
      (constraint) => constraint.columns.length === 2
    );
    assert.ok(multiColumnConstraint);
    assert.equal(multiColumnConstraint.partial, false);
    assert.deepEqual(
      multiColumnConstraint.columns.map((column) => column.name),
      ["company_id", "ticker"]
    );
    assert.equal(multiColumnConstraint.expression, 'UNIQUE ("company_id", "ticker")');
    assert.equal(multiColumnConstraint.originalExpression, multiColumnConstraint.expression);
    assert.equal(multiColumnConstraint.editable, true);
    assert.equal(multiColumnConstraint.preserved, true);

    const partialConstraint = draft.uniqueConstraints.find((constraint) => constraint.partial);
    assert.ok(partialConstraint);
    assert.equal(partialConstraint.name, "uniq_active_company_ticker");
    assert.match(partialConstraint.sql, /CREATE UNIQUE INDEX uniq_active_company_ticker/i);
    assert.match(partialConstraint.sql, /WHERE deleted_at IS NULL/i);
    assert.equal(partialConstraint.expression, partialConstraint.sql);

    const changedDraft = {
      ...draft,
      uniqueConstraints: draft.uniqueConstraints.map((constraint) =>
        constraint.id === multiColumnConstraint.id
          ? {
              ...constraint,
              expression: 'UNIQUE ("company_id", "ticker", "name")',
            }
          : constraint
      ),
    };
    const analysis = analyzeTableDesignerChanges({ draft: changedDraft, originalDraft: draft });
    assert.equal(analysis.dirty, true);
    assert.equal(analysis.executable, false);
    assert.match(analysis.warnings[0].title, /Constraint Change Requires Rebuild/);

    const uniqueWarning = draft.schemaWarnings.find(
      (warning) => warning.code === "COMPLEX_UNIQUE_CONSTRAINTS_PRESENT"
    );
    assert.ok(uniqueWarning);
    assert.equal(uniqueWarning.title, "Table Designer v2 Unique Constraints");
    assert.equal(uniqueWarning.tone, "muted");
    assert.doesNotMatch(uniqueWarning.message, /outside Table Designer v1/i);
  } finally {
    db.close();
  }
});
