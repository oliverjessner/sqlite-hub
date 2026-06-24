const { ValidationError } = require("../../utils/errors");
const { quoteIdentifier } = require("../../utils/identifier");

const DEFAULT_SAMPLE_LIMIT = 25;
const MIN_SAMPLE_LIMIT = 1;
const MAX_SAMPLE_LIMIT = 100;
const USER_SCHEMA_TYPES = new Set(["table", "index", "view", "trigger"]);

function normalizeBackupDiffSampleLimit(value) {
  if (value === undefined) {
    return DEFAULT_SAMPLE_LIMIT;
  }

  const text = String(value).trim();

  if (!/^\d+$/.test(text)) {
    throw new ValidationError("sampleLimit must be an integer between 1 and 100.");
  }

  const limit = Number(text);

  if (limit < MIN_SAMPLE_LIMIT || limit > MAX_SAMPLE_LIMIT) {
    throw new ValidationError("sampleLimit must be an integer between 1 and 100.");
  }

  return limit;
}

function normalizeSqlDefinition(sql = "") {
  return String(sql ?? "")
    .replace(/\s+/g, " ")
    .replace(/;\s*$/, "")
    .trim()
    .toLowerCase();
}

function normalizeType(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function serializeSqliteValue(value) {
  if (Buffer.isBuffer(value)) {
    return {
      __type: "blob",
      sizeBytes: value.length,
      hexPreview: value.subarray(0, 16).toString("hex"),
    };
  }

  if (typeof value === "bigint") {
    return {
      __type: "integer",
      value: value.toString(),
    };
  }

  return value;
}

function valueComparisonKey(value) {
  if (Buffer.isBuffer(value)) {
    return `blob:${value.toString("base64")}`;
  }

  if (typeof value === "bigint") {
    return `bigint:${value.toString()}`;
  }

  return JSON.stringify([typeof value, value]);
}

function valuesEqual(left, right) {
  return valueComparisonKey(left) === valueComparisonKey(right);
}

function buildColumnDefinition(column) {
  const parts = [];

  if (column.declaredType) {
    parts.push(column.declaredType);
  }

  if (column.notNull) {
    parts.push("NOT NULL");
  }

  if (column.defaultValue !== null && column.defaultValue !== undefined) {
    parts.push(`DEFAULT ${column.defaultValue}`);
  }

  if (column.primaryKeyPosition > 0) {
    parts.push(
      column.primaryKeyPosition === 1
        ? "PRIMARY KEY"
        : `PRIMARY KEY (${column.primaryKeyPosition})`
    );
  }

  if (column.generated) {
    parts.push("GENERATED");
  }

  if (!column.visible) {
    parts.push("HIDDEN");
  }

  return parts.join(" ") || "value";
}

function columnSignature(column) {
  return JSON.stringify({
    declaredType: column.declaredType.toLowerCase(),
    notNull: column.notNull,
    defaultValue: column.defaultValue,
    primaryKeyPosition: column.primaryKeyPosition,
    hidden: column.hidden,
  });
}

function readTableColumns(db, tableName) {
  return db
    .prepare(`PRAGMA table_xinfo(${quoteIdentifier(tableName)})`)
    .all()
    .map((row) => {
      const hidden = Number(row.hidden ?? 0);
      const column = {
        cid: Number(row.cid ?? 0),
        name: row.name,
        declaredType: normalizeType(row.type),
        notNull: Boolean(row.notnull),
        defaultValue: row.dflt_value,
        primaryKeyPosition: Number(row.pk ?? 0),
        hidden,
        visible: hidden === 0,
        generated: hidden === 2 || hidden === 3,
      };

      return {
        ...column,
        definition: buildColumnDefinition(column),
        signature: columnSignature(column),
      };
    });
}

function indexDefinition(index) {
  if (index.sql) {
    return index.sql;
  }

  const unique = index.unique ? "UNIQUE " : "";
  const columns = index.columns.length
    ? index.columns.map((column) => quoteIdentifier(column)).join(", ")
    : "expression";

  return `CREATE ${unique}INDEX ${quoteIdentifier(index.name)} ON ${quoteIdentifier(
    index.tableName
  )} (${columns})`;
}

function readTableIndexes(db, tableName, schemaEntriesByName) {
  return db
    .prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`)
    .all()
    .filter((row) => row.name)
    .map((row) => {
      const columns = db
        .prepare(`PRAGMA index_xinfo(${quoteIdentifier(row.name)})`)
        .all()
        .filter((entry) => Number(entry.key ?? 0) === 1 && Number(entry.cid ?? -1) >= 0)
        .sort((left, right) => Number(left.seqno ?? 0) - Number(right.seqno ?? 0))
        .map((entry) => entry.name);
      const schemaEntry = schemaEntriesByName.get(row.name) ?? {};
      const index = {
        name: row.name,
        tableName,
        unique: Boolean(row.unique),
        partial: Boolean(row.partial),
        origin: row.origin ?? null,
        internal: String(row.name).startsWith("sqlite_"),
        columns,
        sql: schemaEntry.sql ?? null,
      };

      return {
        ...index,
        definition: indexDefinition(index),
        signature: JSON.stringify({
          unique: index.unique,
          partial: index.partial,
          columns: index.columns,
          sql: normalizeSqlDefinition(index.sql),
        }),
      };
    });
}

function groupForeignKeys(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const id = Number(row.id ?? 0);
    const group = grouped.get(id) ?? {
      id,
      table: row.table,
      from: [],
      to: [],
      onUpdate: row.on_update ?? "NO ACTION",
      onDelete: row.on_delete ?? "NO ACTION",
      match: row.match ?? "NONE",
    };

    group.from[Number(row.seq ?? 0)] = row.from;
    group.to[Number(row.seq ?? 0)] = row.to;
    grouped.set(id, group);
  });

  return [...grouped.values()].map((foreignKey) => {
    const targetColumns = foreignKey.to.filter(Boolean);
    const targetColumnList = targetColumns.length
      ? ` (${targetColumns.map((column) => quoteIdentifier(column)).join(", ")})`
      : "";
    const definition = [
      `FOREIGN KEY (${foreignKey.from.map((column) => quoteIdentifier(column)).join(", ")})`,
      `REFERENCES ${quoteIdentifier(foreignKey.table)}${targetColumnList}`,
      `ON UPDATE ${foreignKey.onUpdate}`,
      `ON DELETE ${foreignKey.onDelete}`,
    ].join(" ");

    return {
      ...foreignKey,
      definition,
      signature: JSON.stringify({
        table: foreignKey.table,
        from: foreignKey.from,
        to: foreignKey.to,
        onUpdate: foreignKey.onUpdate,
        onDelete: foreignKey.onDelete,
        match: foreignKey.match,
      }),
    };
  });
}

function readTableForeignKeys(db, tableName) {
  return groupForeignKeys(db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`).all());
}

function readSchemaSnapshot(db) {
  const schemaEntries = db
    .prepare(
      [
        "SELECT type, name, tbl_name AS tableName, sql",
        "FROM sqlite_schema",
        "WHERE name NOT LIKE 'sqlite_%'",
        "ORDER BY type ASC, name ASC",
      ].join(" ")
    )
    .all()
    .filter((entry) => USER_SCHEMA_TYPES.has(entry.type));
  const schemaEntriesByName = new Map(schemaEntries.map((entry) => [entry.name, entry]));
  const tables = new Map();
  const views = new Map();
  const triggers = new Map();

  schemaEntries.forEach((entry) => {
    if (entry.type === "table") {
      const columns = readTableColumns(db, entry.name);
      const allIndexes = readTableIndexes(db, entry.name, schemaEntriesByName);
      const indexes = allIndexes.filter((index) => !index.internal);
      const foreignKeys = readTableForeignKeys(db, entry.name);

      tables.set(entry.name, {
        type: "table",
        name: entry.name,
        sql: entry.sql ?? "",
        normalizedSql: normalizeSqlDefinition(entry.sql),
        columns,
        indexes,
        keyIndexes: allIndexes,
        foreignKeys,
      });
    } else if (entry.type === "view") {
      views.set(entry.name, {
        type: "view",
        name: entry.name,
        sql: entry.sql ?? "",
        normalizedSql: normalizeSqlDefinition(entry.sql),
      });
    } else if (entry.type === "trigger") {
      triggers.set(entry.name, {
        type: "trigger",
        name: entry.name,
        tableName: entry.tableName,
        sql: entry.sql ?? "",
        normalizedSql: normalizeSqlDefinition(entry.sql),
      });
    }
  });

  return {
    tables,
    views,
    triggers,
  };
}

function mapByName(entries = []) {
  return new Map(entries.map((entry) => [entry.name, entry]));
}

function buildSchemaChange(action, objectType, entry, extra = {}) {
  return {
    action,
    objectType,
    name: entry.name,
    definition: entry.definition ?? entry.sql ?? "",
    ...extra,
  };
}

function appendNamedObjectChanges(changes, baseEntries, currentEntries, objectType) {
  const baseByName = mapByName(baseEntries);
  const currentByName = mapByName(currentEntries);

  currentEntries.forEach((entry) => {
    const previous = baseByName.get(entry.name);

    if (!previous) {
      changes.push(buildSchemaChange("added", objectType, entry));
      return;
    }

    if (previous.signature !== entry.signature) {
      changes.push(
        buildSchemaChange("changed", objectType, entry, {
          before: previous.definition ?? previous.sql ?? "",
          after: entry.definition ?? entry.sql ?? "",
        })
      );
    }
  });

  baseEntries.forEach((entry) => {
    if (!currentByName.has(entry.name)) {
      changes.push(buildSchemaChange("removed", objectType, entry));
    }
  });
}

function appendForeignKeyChanges(changes, baseForeignKeys, currentForeignKeys) {
  const baseBySignature = new Map(baseForeignKeys.map((entry) => [entry.signature, entry]));
  const currentBySignature = new Map(currentForeignKeys.map((entry) => [entry.signature, entry]));

  currentForeignKeys.forEach((entry) => {
    if (!baseBySignature.has(entry.signature)) {
      changes.push(buildSchemaChange("added", "foreign_key", entry));
    }
  });

  baseForeignKeys.forEach((entry) => {
    if (!currentBySignature.has(entry.signature)) {
      changes.push(buildSchemaChange("removed", "foreign_key", entry));
    }
  });
}

function appendColumnChanges(changes, baseColumns, currentColumns) {
  const baseByName = mapByName(baseColumns);
  const currentByName = mapByName(currentColumns);

  currentColumns.forEach((column) => {
    const previous = baseByName.get(column.name);

    if (!previous) {
      changes.push(buildSchemaChange("added", "column", column));
      return;
    }

    if (previous.signature !== column.signature) {
      changes.push(
        buildSchemaChange("changed", "column", column, {
          before: previous.definition,
          after: column.definition,
        })
      );
    }
  });

  baseColumns.forEach((column) => {
    if (!currentByName.has(column.name)) {
      changes.push(buildSchemaChange("removed", "column", column));
    }
  });
}

function diffTopLevelSchemaObjects(schema, baseObjects, currentObjects, objectType) {
  currentObjects.forEach((entry, name) => {
    const previous = baseObjects.get(name);

    if (!previous) {
      schema.added.push({
        type: objectType,
        name,
        definition: entry.sql,
      });
      return;
    }

    if (previous.normalizedSql !== entry.normalizedSql) {
      schema.changed.push({
        type: objectType,
        name,
        before: previous.sql,
        after: entry.sql,
        changes: [
          {
            action: "changed",
            objectType,
            name,
            before: previous.sql,
            after: entry.sql,
          },
        ],
      });
    }
  });

  baseObjects.forEach((entry, name) => {
    if (!currentObjects.has(name)) {
      schema.removed.push({
        type: objectType,
        name,
        definition: entry.sql,
      });
    }
  });
}

function buildSchemaDiff(baseSchema, currentSchema) {
  const schema = {
    added: [],
    changed: [],
    removed: [],
  };

  currentSchema.tables.forEach((table, name) => {
    const previous = baseSchema.tables.get(name);

    if (!previous) {
      schema.added.push({
        type: "table",
        name,
        definition: table.sql,
        columns: table.columns.map((column) => ({
          name: column.name,
          definition: column.definition,
        })),
        indexes: table.indexes.map((index) => ({
          name: index.name,
          definition: index.definition,
        })),
        foreignKeys: table.foreignKeys.map((foreignKey) => ({
          definition: foreignKey.definition,
        })),
      });
      return;
    }

    const changes = [];
    appendColumnChanges(changes, previous.columns, table.columns);
    appendNamedObjectChanges(changes, previous.indexes, table.indexes, "index");
    appendForeignKeyChanges(changes, previous.foreignKeys, table.foreignKeys);

    if (!changes.length && previous.normalizedSql !== table.normalizedSql) {
      changes.push({
        action: "changed",
        objectType: "table",
        name,
        before: previous.sql,
        after: table.sql,
      });
    }

    if (changes.length) {
      schema.changed.push({
        type: "table",
        name,
        changes,
      });
    }
  });

  baseSchema.tables.forEach((table, name) => {
    if (!currentSchema.tables.has(name)) {
      schema.removed.push({
        type: "table",
        name,
        definition: table.sql,
        columns: table.columns.map((column) => ({
          name: column.name,
          definition: column.definition,
        })),
        indexes: table.indexes.map((index) => ({
          name: index.name,
          definition: index.definition,
        })),
        foreignKeys: table.foreignKeys.map((foreignKey) => ({
          definition: foreignKey.definition,
        })),
      });
    }
  });

  diffTopLevelSchemaObjects(schema, baseSchema.views, currentSchema.views, "view");
  diffTopLevelSchemaObjects(schema, baseSchema.triggers, currentSchema.triggers, "trigger");

  return schema;
}

function getVisibleColumnNames(table) {
  return table.columns.filter((column) => column.visible).map((column) => column.name);
}

function getStableKeyCandidates(table) {
  const columnsByName = mapByName(table.columns);
  const primaryKeyColumns = table.columns
    .filter((column) => column.primaryKeyPosition > 0)
    .sort((left, right) => left.primaryKeyPosition - right.primaryKeyPosition)
    .map((column) => column.name);
  const candidates = [];

  if (primaryKeyColumns.length) {
    candidates.push({
      type: "primary_key",
      columns: primaryKeyColumns,
    });
  }

  const indexes = table.keyIndexes ?? table.indexes;

  indexes
    .filter((index) => index.unique && !index.partial && index.columns.length)
    .filter((index) =>
      index.columns.every((columnName) => {
        const column = columnsByName.get(columnName);
        return column?.notNull || column?.primaryKeyPosition > 0;
      })
    )
    .sort((left, right) => left.columns.length - right.columns.length || left.name.localeCompare(right.name))
    .forEach((index) => {
      candidates.push({
        type: "unique_index",
        name: index.name,
        columns: index.columns,
      });
    });

  return candidates;
}

function arraysEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => String(value) === String(right[index]))
  );
}

function resolveSharedStableKey(baseTable, currentTable) {
  const currentCandidates = getStableKeyCandidates(currentTable);

  return (
    getStableKeyCandidates(baseTable).find((baseCandidate) =>
      currentCandidates.some((currentCandidate) =>
        arraysEqual(baseCandidate.columns, currentCandidate.columns)
      )
    ) ?? null
  );
}

function countTableRows(db, tableName) {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`).get();
  return Number(row?.count ?? 0);
}

function rowIdentity(row, keyColumns) {
  return keyColumns.map((column) => ({
    column,
    value: serializeSqliteValue(row[column]),
  }));
}

function rowIdentityLabel(identity) {
  return identity
    .map((part) => `${part.column} = ${String(part.value?.value ?? part.value ?? "NULL")}`)
    .join(", ");
}

function rowValues(row, columns) {
  return Object.fromEntries(columns.map((column) => [column, serializeSqliteValue(row[column])]));
}

function buildRowKey(row, keyColumns) {
  return JSON.stringify(keyColumns.map((column) => valueComparisonKey(row[column])));
}

function buildSelectSql(tableName, columns) {
  return `SELECT ${columns.map((column) => quoteIdentifier(column)).join(", ")} FROM ${quoteIdentifier(
    tableName
  )}`;
}

function readRowsByKey(db, tableName, columns, keyColumns) {
  const rows = new Map();
  let duplicateKey = null;

  for (const row of db.prepare(buildSelectSql(tableName, columns)).iterate()) {
    const key = buildRowKey(row, keyColumns);

    if (rows.has(key)) {
      duplicateKey = rowIdentityLabel(rowIdentity(row, keyColumns));
      break;
    }

    rows.set(key, row);
  }

  return {
    rows,
    duplicateKey,
  };
}

function readSampleRows(db, tableName, columns, keyColumns, sampleLimit) {
  if (!columns.length) {
    return [];
  }

  const rows = db.prepare(`${buildSelectSql(tableName, columns)} LIMIT ?`).all(sampleLimit);

  return rows.map((row) => {
    const identity = keyColumns.length ? rowIdentity(row, keyColumns) : [];

    return {
      identity,
      identityLabel: identity.length ? rowIdentityLabel(identity) : "",
      values: rowValues(row, columns),
    };
  });
}

function buildSkippedDataTable(name, reason) {
  return {
    name,
    status: "skipped",
    statusLabel: "No stable key",
    reason,
    keyColumns: [],
    added: null,
    changed: null,
    removed: null,
    samples: {
      added: [],
      changed: [],
      removed: [],
    },
  };
}

function compareTableRows({ baseDb, currentDb, tableName, baseTable, currentTable, sampleLimit }) {
  const stableKey = resolveSharedStableKey(baseTable, currentTable);

  if (!stableKey) {
    return buildSkippedDataTable(
      tableName,
      "No primary key or non-null unique index exists in both versions."
    );
  }

  const baseVisibleColumns = getVisibleColumnNames(baseTable);
  const currentVisibleColumns = getVisibleColumnNames(currentTable);
  const commonColumns = baseVisibleColumns.filter((column) => currentVisibleColumns.includes(column));
  const compareColumns = commonColumns.filter((column) => !stableKey.columns.includes(column));
  const selectColumns = [...new Set([...stableKey.columns, ...commonColumns])];
  const baseRows = readRowsByKey(baseDb, tableName, selectColumns, stableKey.columns);
  const currentRows = readRowsByKey(currentDb, tableName, selectColumns, stableKey.columns);

  if (baseRows.duplicateKey || currentRows.duplicateKey) {
    return buildSkippedDataTable(
      tableName,
      `Stable key contains duplicate values (${baseRows.duplicateKey || currentRows.duplicateKey}).`
    );
  }

  const samples = {
    added: [],
    changed: [],
    removed: [],
  };
  const seenCurrentKeys = new Set();
  let added = 0;
  let changed = 0;
  let removed = 0;

  baseRows.rows.forEach((baseRow, key) => {
    const currentRow = currentRows.rows.get(key);

    if (!currentRow) {
      removed += 1;

      if (samples.removed.length < sampleLimit) {
        const identity = rowIdentity(baseRow, stableKey.columns);
        samples.removed.push({
          identity,
          identityLabel: rowIdentityLabel(identity),
          values: rowValues(baseRow, baseVisibleColumns),
        });
      }

      return;
    }

    seenCurrentKeys.add(key);

    const changedColumns = compareColumns
      .filter((column) => !valuesEqual(baseRow[column], currentRow[column]))
      .map((column) => ({
        name: column,
        backup: serializeSqliteValue(baseRow[column]),
        current: serializeSqliteValue(currentRow[column]),
      }));

    if (changedColumns.length) {
      changed += 1;

      if (samples.changed.length < sampleLimit) {
        const identity = rowIdentity(baseRow, stableKey.columns);
        samples.changed.push({
          identity,
          identityLabel: rowIdentityLabel(identity),
          columns: changedColumns,
        });
      }
    }
  });

  currentRows.rows.forEach((currentRow, key) => {
    if (seenCurrentKeys.has(key) || baseRows.rows.has(key)) {
      return;
    }

    added += 1;

    if (samples.added.length < sampleLimit) {
      const identity = rowIdentity(currentRow, stableKey.columns);
      samples.added.push({
        identity,
        identityLabel: rowIdentityLabel(identity),
        values: rowValues(currentRow, currentVisibleColumns),
      });
    }
  });

  return {
    name: tableName,
    status: "comparable",
    statusLabel: "Comparable",
    reason: "",
    keyColumns: stableKey.columns,
    added,
    changed,
    removed,
    samples,
  };
}

function compareDataTables(baseDb, currentDb, baseSchema, currentSchema, sampleLimit) {
  const tables = [];
  const tableNames = [...new Set([...baseSchema.tables.keys(), ...currentSchema.tables.keys()])].sort();

  tableNames.forEach((tableName) => {
    const baseTable = baseSchema.tables.get(tableName);
    const currentTable = currentSchema.tables.get(tableName);

    try {
      if (!baseTable && currentTable) {
        const columns = getVisibleColumnNames(currentTable);
        tables.push({
          name: tableName,
          status: "added_table",
          statusLabel: "Added table",
          reason: "",
          keyColumns: [],
          added: countTableRows(currentDb, tableName),
          changed: 0,
          removed: 0,
          samples: {
            added: readSampleRows(currentDb, tableName, columns, [], sampleLimit),
            changed: [],
            removed: [],
          },
        });
        return;
      }

      if (baseTable && !currentTable) {
        const columns = getVisibleColumnNames(baseTable);
        tables.push({
          name: tableName,
          status: "removed_table",
          statusLabel: "Removed table",
          reason: "",
          keyColumns: [],
          added: 0,
          changed: 0,
          removed: countTableRows(baseDb, tableName),
          samples: {
            added: [],
            changed: [],
            removed: readSampleRows(baseDb, tableName, columns, [], sampleLimit),
          },
        });
        return;
      }

      tables.push(
        compareTableRows({
          baseDb,
          currentDb,
          tableName,
          baseTable,
          currentTable,
          sampleLimit,
        })
      );
    } catch (error) {
      tables.push(
        buildSkippedDataTable(
          tableName,
          error?.message || "Table could not be compared safely."
        )
      );
    }
  });

  return {
    tables,
  };
}

function countSchemaChanges(schema) {
  return ["added", "changed", "removed"].reduce(
    (sum, group) =>
      sum +
      schema[group].reduce(
        (groupSum, entry) => groupSum + (Array.isArray(entry.changes) ? entry.changes.length : 1),
        0
      ),
    0
  );
}

function sumTableMetric(tables, metric) {
  return tables.reduce((sum, table) => {
    const value = Number(table[metric]);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function buildSummary(schema, data) {
  return {
    schemaChanges: countSchemaChanges(schema),
    tablesAdded: schema.added.filter((entry) => entry.type === "table").length,
    tablesRemoved: schema.removed.filter((entry) => entry.type === "table").length,
    rowsAdded: sumTableMetric(data.tables, "added"),
    rowsChanged: sumTableMetric(data.tables, "changed"),
    rowsRemoved: sumTableMetric(data.tables, "removed"),
    skippedTables: data.tables.filter((table) => table.status === "skipped").length,
  };
}

function buildBackupDiff({ backupDb, currentDb, backup, currentConnection, comparedAt, sampleLimit }) {
  const baseSchema = readSchemaSnapshot(backupDb);
  const currentSchema = readSchemaSnapshot(currentDb);
  const schema = buildSchemaDiff(baseSchema, currentSchema);
  const data = compareDataTables(backupDb, currentDb, baseSchema, currentSchema, sampleLimit);

  return {
    backup: {
      id: backup.id,
      name: backup.name,
      createdAt: backup.createdAt,
    },
    current: {
      connectionId: currentConnection.id,
      label: currentConnection.label,
    },
    comparedAt: comparedAt.toISOString(),
    sampleLimit,
    summary: buildSummary(schema, data),
    schema,
    data,
  };
}

module.exports = {
  DEFAULT_SAMPLE_LIMIT,
  MAX_SAMPLE_LIMIT,
  MIN_SAMPLE_LIMIT,
  buildBackupDiff,
  normalizeBackupDiffSampleLimit,
};
