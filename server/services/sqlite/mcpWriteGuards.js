const { NotFoundError, ValidationError } = require("../../utils/errors");
const { assertValidIdentifier } = require("../../utils/identifier");

function normalizeColumnValues(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object of column values.`);
  }

  return Object.entries(value).map(([column, cell]) => {
    assertValidIdentifier(column, "Column name");
    if (cell === null || typeof cell === "string" || typeof cell === "boolean" ||
        (typeof cell === "number" && Number.isFinite(cell))) {
      return [column, typeof cell === "boolean" ? Number(cell) : cell];
    }
    throw new ValidationError(`${label}, column ${column} must be a string, finite number, boolean, or null.`);
  });
}

function getMcpWritableTable(db, tableName, operation) {
  assertValidIdentifier(tableName, "Table name");
  const tables = db.prepare("PRAGMA main.table_list").all().filter((entry) => entry.schema === "main");
  const table = tables.find((entry) => entry.name === tableName);
  if (!table) {
    throw new NotFoundError(`Table not found: ${tableName}`);
  }
  const action = operation === "UPDATE" ? "updates" : "inserts";
  if (table.type !== "table" || /^sqlite_/i.test(table.name)) {
    throw new ValidationError(`MCP ${action} require an ordinary, non-internal table.`, {
      code: `MCP_${operation}_TABLE_REQUIRED`,
    });
  }

  for (const schema of ["main", "temp"]) {
    const trigger = db.prepare(
      `SELECT name FROM ${schema}.sqlite_schema WHERE type = 'trigger' AND tbl_name = ? COLLATE NOCASE LIMIT 1`
    ).get(table.name);
    if (trigger) {
      throw new ValidationError(`MCP ${action} are blocked for tables with triggers because they may update or delete rows.`, {
        code: `MCP_${operation}_TRIGGER_BLOCKED`,
      });
    }
  }

  const columns = db.prepare("SELECT * FROM pragma_table_xinfo(?, 'main')").all(table.name);
  return { table, tables, columns };
}

module.exports = { normalizeColumnValues, getMcpWritableTable };
