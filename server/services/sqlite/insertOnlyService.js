const { ValidationError, mapSqliteError } = require("../../utils/errors");
const { assertValidIdentifier, quoteIdentifier } = require("../../utils/identifier");
const { normalizeColumnValues, getMcpWritableTable } = require("./mcpWriteGuards");

const MAX_INSERT_ROWS = 1000;

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_INSERT_ROWS) {
    throw new ValidationError(`Rows must contain between 1 and ${MAX_INSERT_ROWS} objects.`);
  }

  return Array.from(rows, (row, index) => normalizeColumnValues(row, `Row ${index + 1}`));
}

function serializeRowId(rowId) {
  return rowId >= BigInt(Number.MIN_SAFE_INTEGER) && rowId <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(rowId) : String(rowId);
}

function insertRows(db, tableName, rows) {
  assertValidIdentifier(tableName, "Table name");
  const normalizedRows = normalizeRows(rows);

  try {
    db.pragma("foreign_keys = ON");
    // Hold the write lock while checking the schema and inserting. A concurrent
    // schema change must not introduce a trigger after the checks below.
    return db.transaction(() => {
      const { table, columns: tableColumns } = getMcpWritableTable(db, tableName, "INSERT");
      const columns = new Set(tableColumns.filter((column) => column.hidden === 0).map((column) => column.name));
      const statements = new Map();
      const lastInsertRowids = [];
      for (const entries of normalizedRows) {
        const names = entries.map(([name]) => name);
        for (const name of names) {
          if (!columns.has(name)) {
            throw new ValidationError(`Column ${name} is not an insertable column of ${table.name}.`);
          }
        }

        const key = JSON.stringify(names);
        if (!statements.has(key)) {
          const valuesClause = names.length
            ? `(${names.map(quoteIdentifier).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`
            : "DEFAULT VALUES";
          // ABORT overrides schema-level ON CONFLICT REPLACE, which would delete
          // an existing row. Neither SQL text nor conflict modes come from callers.
          statements.set(key, db.prepare(`INSERT OR ABORT INTO main.${quoteIdentifier(table.name)} ${valuesClause}`).safeIntegers());
        }
        const info = statements.get(key).run(...entries.map(([, value]) => value));
        lastInsertRowids.push(table.wr ? null : serializeRowId(info.lastInsertRowid));
      }

      return { tableName: table.name, insertedRowCount: normalizedRows.length, lastInsertRowids };
    }).immediate();
  } catch (error) {
    throw mapSqliteError(error);
  }
}

module.exports = { MAX_INSERT_ROWS, insertRows };
