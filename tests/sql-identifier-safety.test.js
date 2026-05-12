const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const test = require("node:test");
const { DataBrowserService } = require("../server/services/sqlite/dataBrowserService");
const { quoteIdentifier } = require("../server/utils/identifier");

test("data browser mutations preserve quoted dynamic identifiers", () => {
  const db = new Database(":memory:");
  const tableName = 'items" archived';
  const valueColumn = 'display"name';

  try {
    db.exec(
      [
        "CREATE TABLE",
        quoteIdentifier(tableName),
        "(",
        quoteIdentifier(valueColumn),
        "TEXT, status INTEGER",
        ")",
      ].join(" ")
    );
    db.prepare(
      [
        "INSERT INTO",
        quoteIdentifier(tableName),
        "(" + quoteIdentifier(valueColumn) + ", status)",
        "VALUES (?, ?)",
      ].join(" ")
    ).run("before", 0);

    const service = new DataBrowserService({
      connectionManager: {
        assertWritable() {},
        getActiveDatabase: () => db,
      },
    });
    const tableData = service.getTableData(tableName, { limit: 10, offset: 0 });
    const identity = tableData.rows[0].__identity;

    const updated = service.updateTableRow(tableName, {
      identity,
      values: {
        [valueColumn]: "after",
      },
    });

    assert.equal(updated.row[valueColumn], "after");
    assert.equal(
      db.prepare(["SELECT", quoteIdentifier(valueColumn), "FROM", quoteIdentifier(tableName)].join(" ")).get()[valueColumn],
      "after"
    );

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
