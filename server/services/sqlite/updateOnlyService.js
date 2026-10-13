const { NotFoundError, ValidationError, mapSqliteError } = require("../../utils/errors");
const { assertValidIdentifier, quoteIdentifier } = require("../../utils/identifier");
const { normalizeColumnValues, getMcpWritableTable } = require("./mcpWriteGuards");

const MAX_UPDATE_ROWS = 1000;

function normalizeUpdates(updates) {
  if (!Array.isArray(updates) || updates.length < 1 || updates.length > MAX_UPDATE_ROWS) {
    throw new ValidationError(`Updates must contain between 1 and ${MAX_UPDATE_ROWS} objects.`);
  }
  return Array.from(updates, (update, index) => {
    if (!update || typeof update !== "object" || Array.isArray(update) ||
        Object.keys(update).some((name) => !["key", "values"].includes(name))) {
      throw new ValidationError(`Update ${index + 1} accepts only key and values; raw SQL and filters are not allowed.`);
    }
    const key = normalizeColumnValues(update.key, `Update ${index + 1} key`);
    const values = normalizeColumnValues(update.values, `Update ${index + 1} values`);
    if (!key.length || !values.length) {
      throw new ValidationError(`Update ${index + 1} requires a non-empty key and values.`);
    }
    return { key: new Map(key), values };
  });
}

function getReferencedColumns(db, table, tables) {
  const referenced = new Set();
  const query = db.prepare(
    'SELECT "to" FROM pragma_foreign_key_list(?, \'main\') WHERE "table" = ? COLLATE NOCASE'
  );
  for (const child of tables.filter((entry) => entry.type === "table")) {
    for (const foreignKey of query.all(child.name, table.name)) {
      if (foreignKey.to !== null) referenced.add(foreignKey.to.toLowerCase());
    }
  }
  return referenced;
}

function updateRows(db, tableName, updates) {
  assertValidIdentifier(tableName, "Table name");
  const normalizedUpdates = normalizeUpdates(updates);
  try {
    db.pragma("foreign_keys = ON");
    // Check keys, triggers, and foreign-key targets while holding the write lock.
    return db.transaction(() => {
      const { table, tables, columns } = getMcpWritableTable(db, tableName, "UPDATE");
      const primaryKey = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk).map((column) => column.name);
      if (!primaryKey.length) {
        throw new ValidationError("MCP updates require a declared primary key.", { code: "MCP_UPDATE_PRIMARY_KEY_REQUIRED" });
      }
      const referenced = getReferencedColumns(db, table, tables);
      if (columns.some((column) => column.hidden !== 0 && referenced.has(column.name.toLowerCase()))) {
        throw new ValidationError("MCP updates are blocked when a generated column is referenced by a foreign key, because its value could change indirectly.", {
          code: "MCP_UPDATE_KEY_COLUMN_BLOCKED",
        });
      }
      const editable = new Set(columns.filter((column) => column.hidden === 0 && column.pk === 0 &&
        !referenced.has(column.name.toLowerCase())).map((column) => column.name));
      const target = `main.${quoteIdentifier(table.name)}`;
      const where = primaryKey.map((name) => `${quoteIdentifier(name)} = ?`).join(" AND ");
      const findRow = db.prepare(`SELECT ${primaryKey.map(quoteIdentifier).join(", ")} FROM ${target} WHERE ${where}`).raw().safeIntegers();
      const seen = new Set();
      const statements = new Map();

      for (const [index, update] of normalizedUpdates.entries()) {
        if (update.key.size !== primaryKey.length || primaryKey.some((name) => !update.key.has(name) || update.key.get(name) === null)) {
          throw new ValidationError(`Update ${index + 1} key must contain exactly the complete, non-null primary key.`, {
            code: "MCP_UPDATE_PRIMARY_KEY_REQUIRED",
          });
        }
        const names = update.values.map(([name]) => name);
        for (const name of names) {
          if (!editable.has(name)) {
            throw new ValidationError(`Column ${name} is not updateable through MCP. Primary keys, referenced keys, generated columns, and unknown columns cannot be changed.`, {
              code: "MCP_UPDATE_KEY_COLUMN_BLOCKED",
            });
          }
        }
        const keyValues = primaryKey.map((name) => update.key.get(name));
        const row = findRow.get(...keyValues);
        if (!row) {
          throw new NotFoundError(`Update ${index + 1} row was not found in ${table.name}.`, { code: "MCP_UPDATE_ROW_NOT_FOUND" });
        }
        // Compare stored keys, so SQLite affinity/collation aliases such as 1
        // and "1" cannot update the same row twice in one batch.
        const identity = JSON.stringify(row.map((value) => [typeof value, String(value)]));
        if (seen.has(identity)) {
          throw new ValidationError("A row may only appear once in an MCP update batch.", { code: "MCP_UPDATE_DUPLICATE_KEY" });
        }
        seen.add(identity);

        const cacheKey = JSON.stringify(names);
        if (!statements.has(cacheKey)) {
          const assignments = names.map((name) => `${quoteIdentifier(name)} = ?`).join(", ");
          // ABORT prevents schema-level REPLACE policies from deleting a row.
          statements.set(cacheKey, db.prepare(`UPDATE OR ABORT ${target} SET ${assignments} WHERE ${where}`));
        }
        const info = statements.get(cacheKey).run(...update.values.map(([, value]) => value), ...keyValues);
        if (info.changes !== 1) {
          throw new ValidationError("Each MCP update must match exactly one existing row.", { code: "MCP_UPDATE_ROW_REQUIRED" });
        }
      }
      return { tableName: table.name, updatedRowCount: normalizedUpdates.length };
    }).immediate();
  } catch (error) {
    throw mapSqliteError(error);
  }
}

module.exports = { MAX_UPDATE_ROWS, updateRows };
