const { quoteIdentifier } = require("../../../utils/identifier");
const { getRawStructureEntries } = require("../introspection");

const SUPPORTED_TABLE_DESIGNER_TYPES = [
  "TEXT",
  "INTEGER",
  "REAL",
  "BLOB",
  "NUMERIC",
  "BOOLEAN",
  "DATE",
  "DATETIME",
];

function normalizeDesignerType(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || "TEXT";
}

function createDesignerWarning({
  code,
  title,
  message,
  tone = "alert",
  blocking = false,
}) {
  return {
    code,
    title,
    message,
    tone,
    blocking,
  };
}

function buildSingleColumnUniqueSet(indexes = []) {
  const uniqueColumns = new Set();

  indexes.forEach((index) => {
    if (!index?.unique || index.partial || !Array.isArray(index.columns) || index.columns.length !== 1) {
      return;
    }

    const columnName = index.columns[0]?.name;

    if (columnName) {
      uniqueColumns.add(columnName);
    }
  });

  return uniqueColumns;
}

function buildSimpleForeignKeyMap(foreignKeys = []) {
  const map = new Map();

  foreignKeys.forEach((foreignKey) => {
    if (!Array.isArray(foreignKey?.mappings) || foreignKey.mappings.length !== 1) {
      return;
    }

    const mapping = foreignKey.mappings[0];

    if (!mapping?.from || !mapping?.to || map.has(mapping.from)) {
      return;
    }

    map.set(mapping.from, {
      table: foreignKey.referencedTable,
      column: mapping.to,
    });
  });

  return map;
}

function buildSchemaWarnings(tableDetail) {
  const warnings = [];
  const generatedColumns = (tableDetail.columns ?? []).filter((column) => column.generated);
  const compositePrimaryKeyColumns = (tableDetail.columns ?? []).filter(
    (column) => Number(column.primaryKeyPosition ?? 0) > 0
  );
  const complexForeignKeys = (tableDetail.foreignKeys ?? []).filter(
    (foreignKey) => (foreignKey.mappings?.length ?? 0) !== 1
  );
  const complexUniqueIndexes = (tableDetail.indexes ?? []).filter(
    (index) => index.unique && (index.partial || (index.columns?.length ?? 0) !== 1)
  );

  if (generatedColumns.length) {
    warnings.push(
      createDesignerWarning({
        code: "GENERATED_COLUMNS_PRESENT",
        title: "Generated Columns Detected",
        message:
          "Generated or hidden columns are not editable in Table Designer v1. Safe operations like table rename or adding simple columns still work.",
      })
    );
  }

  if (compositePrimaryKeyColumns.length > 1) {
    warnings.push(
      createDesignerWarning({
        code: "COMPOSITE_PRIMARY_KEY_PRESENT",
        title: "Composite Primary Key Detected",
        message:
          "This table uses more than one primary key column. Table Designer v1 preserves it, but changing primary key structure requires a manual table rebuild.",
      })
    );
  }

  if (complexForeignKeys.length) {
    warnings.push(
      createDesignerWarning({
        code: "COMPLEX_FOREIGN_KEYS_PRESENT",
        title: "Complex Foreign Keys Detected",
        message:
          "Composite or multi-mapping foreign keys cannot be edited directly in Table Designer v1. They are preserved until a rebuild is done manually.",
      })
    );
  }

  if (complexUniqueIndexes.length) {
    warnings.push(
      createDesignerWarning({
        code: "COMPLEX_UNIQUE_CONSTRAINTS_PRESENT",
        title: "Complex Unique Constraints Detected",
        message:
          "Multi-column or partial UNIQUE constraints are outside Table Designer v1. They remain untouched unless you rebuild the table manually.",
      })
    );
  }

  if (tableDetail.strict) {
    warnings.push(
      createDesignerWarning({
        code: "STRICT_TABLE_PRESENT",
        title: "STRICT Table",
        message:
          "STRICT tables can be renamed and extended with supported columns, but rebuild-style schema edits should be reviewed carefully.",
        tone: "muted",
      })
    );
  }

  if (tableDetail.withoutRowId) {
    warnings.push(
      createDesignerWarning({
        code: "WITHOUT_ROWID_PRESENT",
        title: "WITHOUT ROWID Table",
        message:
          "WITHOUT ROWID tables can be inspected here, but rebuild-style changes are intentionally blocked in v1.",
        tone: "muted",
      })
    );
  }

  return warnings;
}

function mapTableColumnToDraft(column, { uniqueColumns, foreignKeyMap }) {
  const foreignKey = foreignKeyMap.get(column.name);
  const type = normalizeDesignerType(column.declaredType || column.affinity || "TEXT");
  const defaultValue = column.defaultValue ?? "";

  return {
    id: `existing:${column.cid}:${column.name}`,
    isNew: false,
    deleted: false,
    name: column.name,
    type,
    notNull: Boolean(column.notNull),
    unique: uniqueColumns.has(column.name),
    primaryKey: Number(column.primaryKeyPosition ?? 0) > 0,
    defaultValue,
    referencesTable: foreignKey?.table ?? "",
    referencesColumn: foreignKey?.column ?? "",
    originalName: column.name,
    originalType: type,
    originalNotNull: Boolean(column.notNull),
    originalUnique: uniqueColumns.has(column.name),
    originalPrimaryKey: Number(column.primaryKeyPosition ?? 0) > 0,
    originalDefaultValue: defaultValue,
    originalReferencesTable: foreignKey?.table ?? "",
    originalReferencesColumn: foreignKey?.column ?? "",
  };
}

function buildTableDesignerDraft(tableDetail) {
  const uniqueColumns = buildSingleColumnUniqueSet(tableDetail.indexes);
  const foreignKeyMap = buildSimpleForeignKeyMap(tableDetail.foreignKeys);
  const columns = (tableDetail.columns ?? [])
    .filter((column) => column.visible !== false && !column.generated)
    .map((column) => mapTableColumnToDraft(column, { uniqueColumns, foreignKeyMap }));
  const schemaWarnings = buildSchemaWarnings(tableDetail);

  return {
    mode: "edit",
    originalTableName: tableDetail.name,
    tableName: tableDetail.name,
    columns,
    dirty: false,
    schemaWarnings,
    warnings: [...schemaWarnings],
  };
}

function listDesignerTables(db) {
  return getRawStructureEntries(db)
    .filter((entry) => entry.type === "table")
    .map((entry) => {
      const columns = db
        .prepare(`PRAGMA table_xinfo(${quoteIdentifier(entry.name)})`)
        .all()
        .filter((column) => Number(column.hidden ?? 0) === 0)
        .map((column) => column.name);

      return {
        name: entry.name,
        columnCount: columns.length,
        columns,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

module.exports = {
  SUPPORTED_TABLE_DESIGNER_TYPES,
  buildTableDesignerDraft,
  createDesignerWarning,
  listDesignerTables,
  normalizeDesignerType,
};
