const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const test = require("node:test");
const { DataBrowserService } = require("../server/services/sqlite/dataBrowserService");
const { getTableDetail } = require("../server/services/sqlite/introspection");
const { StructureService } = require("../server/services/sqlite/structureService");
const { NotFoundError } = require("../server/utils/errors");
const { quoteIdentifier } = require("../server/utils/identifier");

test("data browser mutations preserve quoted dynamic identifiers", () => {
  const db = new Database(":memory:");
  const tableName = 'items" archived';
  const valueColumn = 'display"name';
  const noteColumn = 'review"note';

  try {
    db.exec(
      [
        "CREATE TABLE",
        quoteIdentifier(tableName),
        "(",
        quoteIdentifier(valueColumn),
        "TEXT, status INTEGER,",
        quoteIdentifier(noteColumn),
        "TEXT",
        ")",
      ].join(" ")
    );
    db.prepare(
      [
        "INSERT INTO",
        quoteIdentifier(tableName),
        "(" + quoteIdentifier(valueColumn) + ", status, " + quoteIdentifier(noteColumn) + ")",
        "VALUES (?, ?, ?)",
      ].join(" ")
    ).run("before", 0, null);

    const service = new DataBrowserService({
      connectionManager: {
        assertWritable() {},
        getActiveDatabase: () => db,
      },
    });
    const structureService = new StructureService({
      connectionManager: {
        getActiveDatabase: () => db,
      },
      appStateStore: {
        getSettings: () => ({ defaultPageSize: 10 }),
      },
    });
    const tableData = service.getTableData(tableName, { limit: 10, offset: 0 });
    const tableStructure = structureService.getTableStructure(tableName);
    const filteredTableData = service.getTableData(tableName, {
      limit: 10,
      offset: 0,
      filterColumn: valueColumn,
      filterOperator: "=",
      filterValue: "EFO",
    });
    const negativeFilteredTableData = service.getTableData(tableName, {
      limit: 10,
      offset: 0,
      filterColumn: valueColumn,
      filterOperator: "!=",
      filterValue: "EFO",
    });
    const exactFilteredTableData = service.getTableData(tableName, {
      limit: 10,
      offset: 0,
      filterColumn: valueColumn,
      filterOperator: "equals",
      filterValue: "BEFORE",
    });
    const exactSubstringMissTableData = service.getTableData(tableName, {
      limit: 10,
      offset: 0,
      filterColumn: valueColumn,
      filterOperator: "equals",
      filterValue: "EFO",
    });

    assert.equal(filteredTableData.rowCount, 1);
    assert.equal(tableStructure.preview.rows[0][valueColumn], "before");
    assert.equal(filteredTableData.rows[0][valueColumn], "before");
    assert.deepEqual(filteredTableData.filter, {
      column: valueColumn,
      operator: "=",
      value: "EFO",
      matchMode: "contains",
    });
    assert.equal(negativeFilteredTableData.rowCount, 0);
    assert.equal(exactFilteredTableData.rowCount, 1);
    assert.equal(exactFilteredTableData.rows[0][valueColumn], "before");
    assert.deepEqual(exactFilteredTableData.filter, {
      column: valueColumn,
      operator: "equals",
      value: "BEFORE",
      matchMode: "equals",
    });
    assert.equal(exactSubstringMissTableData.rowCount, 0);
    assert.throws(
      () =>
        service.getTableData(tableName, {
          limit: 10,
          offset: 0,
          filterColumn: valueColumn,
          filterOperator: "<>",
          filterValue: "before",
        }),
      /filterOperator/
    );

    const identity = tableData.rows[0].__identity;
    const preview = service.previewTableRowUpdate(tableName, {
      identity,
      values: {
        [valueColumn]: "after",
        status: 0,
        [noteColumn]: "",
      },
    });

    assert.equal(
      preview.sql,
      [
        "UPDATE",
        quoteIdentifier(tableName),
        "SET",
        quoteIdentifier(valueColumn) + " = ?,",
        quoteIdentifier(noteColumn) + " = ?",
        "WHERE",
        "rowid IS ?",
      ].join(" ")
    );
    assert.deepEqual(preview.changes, [
      {
        column: valueColumn,
        oldValue: "before",
        newValue: "after",
      },
      {
        column: noteColumn,
        oldValue: "NULL",
        newValue: "",
      },
    ]);

    const updated = service.updateTableRow(tableName, {
      identity,
      values: {
        [valueColumn]: "after",
        [noteColumn]: "",
      },
    });

    assert.equal(updated.row[valueColumn], "after");
    assert.equal(updated.row[noteColumn], "");
    const persistedRow = db.prepare(
      [
        "SELECT",
        quoteIdentifier(valueColumn) + ",",
        quoteIdentifier(noteColumn),
        "FROM",
        quoteIdentifier(tableName),
      ].join(" ")
    ).get();

    assert.equal(persistedRow[valueColumn], "after");
    assert.equal(persistedRow[noteColumn], "");

    const deleted = service.deleteTableRow(tableName, {
      identity: updated.row.__identity,
    });

    assert.equal(deleted.affectedRowCount, 1);
    assert.equal(
      db.prepare(["SELECT COUNT(*) AS count FROM", quoteIdentifier(tableName)].join(" ")).get().count,
      0
    );
  } finally {
    db.close();
  }
});

test("data browser rejects unknown table names as not found", () => {
  const db = new Database(":memory:");

  try {
    db.exec("CREATE TABLE safe_items (id INTEGER)");

    const service = new DataBrowserService({
      connectionManager: {
        assertWritable() {},
        getActiveDatabase: () => db,
      },
    });
    const structureService = new StructureService({
      connectionManager: {
        getActiveDatabase: () => db,
      },
      appStateStore: {
        getSettings: () => ({ defaultPageSize: 10 }),
      },
    });

    for (const tableName of ["missing", 'safe_items"; DROP TABLE safe_items; --']) {
      assert.throws(
        () => service.getTableData(tableName, { limit: 10 }),
        (error) => error instanceof NotFoundError && error.statusCode === 404
      );
      assert.throws(
        () => service.deleteTableRow(tableName, { identity: { values: { rowid: 1 } } }),
        (error) => error instanceof NotFoundError && error.statusCode === 404
      );
      assert.throws(
        () => structureService.getTableStructure(tableName),
        (error) => error instanceof NotFoundError && error.statusCode === 404
      );
    }

    assert.ok(
      db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'safe_items'").get()
    );
  } finally {
    db.close();
  }
});

test("introspection parameterizes pragma arguments for unusual schema identifiers", () => {
  const db = new Database(":memory:");
  const parentTable = 'parent" records';
  const childTable = 'child" records';
  const foreignKeyColumn = 'parent" id';
  const indexName = 'child" parent index';

  try {
    db.exec(
      [
        `CREATE TABLE ${quoteIdentifier(parentTable)} (id INTEGER PRIMARY KEY)`,
        [
          `CREATE TABLE ${quoteIdentifier(childTable)} (`,
          "id INTEGER PRIMARY KEY,",
          `${quoteIdentifier(foreignKeyColumn)} INTEGER REFERENCES ${quoteIdentifier(parentTable)}(id)`,
          ")",
        ].join(" "),
        `CREATE INDEX ${quoteIdentifier(indexName)} ON ${quoteIdentifier(childTable)} (${quoteIdentifier(foreignKeyColumn)})`,
        `INSERT INTO ${quoteIdentifier(childTable)} DEFAULT VALUES`,
      ].join("; ")
    );

    const detail = getTableDetail(db, childTable);

    assert.equal(detail.name, childTable);
    assert.equal(detail.rowCount, 1);
    assert.equal(detail.foreignKeys[0].referencedTable, parentTable);
    assert.equal(detail.foreignKeys[0].mappings[0].from, foreignKeyColumn);
    assert.equal(detail.indexes[0].name, indexName);
    assert.equal(detail.indexes[0].columns[0].name, foreignKeyColumn);
  } finally {
    db.close();
  }
});
