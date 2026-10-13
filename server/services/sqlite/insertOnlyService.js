const { NotFoundError, ValidationError, mapSqliteError } = require("../../utils/errors");
const { assertValidIdentifier, quoteIdentifier } = require("../../utils/identifier");

const MAX_INSERT_ROWS = 1000;

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_INSERT_ROWS) {
    throw new ValidationError(`Rows must contain between 1 and ${MAX_INSERT_ROWS} objects.`);
  }

  return Array.from(rows, (row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new ValidationError(`Row ${index + 1} must be an object of column values.`);
    }

    return Object.entries(row).map(([column, value]) => {
      assertValidIdentifier(column, "Column name");
      if (value === null || typeof value === "string" || typeof value === "boolean" ||
          (typeof value === "number" && Number.isFinite(value))) {
        return [column, typeof value === "boolean" ? Number(value) : value];
      }
      throw new ValidationError(`Row ${index + 1}, column ${column} must be a string, finite number, boolean, or null.`);
    });
  });
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
      const table = db.prepare("PRAGMA main.table_list").all().find((entry) => entry.name === tableName);
      if (!table) {
        throw new NotFoundError(`Table not found: ${tableName}`);
      }
      if (table.type !== "table" || /^sqlite_/i.test(table.name)) {
        throw new ValidationError("MCP inserts require an ordinary, non-internal table.", {
          code: "MCP_INSERT_TABLE_REQUIRED",
        });
      }

      for (const schema of ["main", "temp"]) {
        const trigger = db.prepare(`SELECT name FROM ${schema}.sqlite_schema WHERE type = 'trigger' AND tbl_name = ? COLLATE NOCASE LIMIT 1`).get(table.name);
        if (trigger) {
          throw new ValidationError("MCP inserts are blocked for tables with triggers because they may update or delete rows.", {
            code: "MCP_INSERT_TRIGGER_BLOCKED",
          });
        }
      }

      const columns = new Set(db.prepare("SELECT name FROM pragma_table_xinfo(?, 'main') WHERE hidden = 0").all(table.name).map((column) => column.name));
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
