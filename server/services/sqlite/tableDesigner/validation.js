const { ValidationError } = require("../../../utils/errors");
const { assertValidIdentifier } = require("../../../utils/identifier");
const { normalizeDesignerType } = require("./schemaMapping");

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeSqlFragment(value) {
  return String(value ?? "").trim();
}

function assertSafeSqlFragment(value, label, { allowEmpty = true } = {}) {
  const normalized = normalizeSqlFragment(value);

  if (!normalized) {
    if (allowEmpty) {
      return "";
    }

    throw new ValidationError(`${label} is required.`);
  }

  if (
    normalized.includes("\0") ||
    normalized.includes(";") ||
    normalized.includes("--") ||
    normalized.includes("/*") ||
    normalized.includes("*/")
  ) {
    throw new ValidationError(
      `${label} must be a single SQL fragment without statement separators or comments.`
    );
  }

  return normalized;
}

function normalizeColumnPayload(column = {}, index = 0) {
  const importedValueIndex =
    column.importedValueIndex === null || column.importedValueIndex === undefined
      ? null
      : Number(column.importedValueIndex);

  return {
    id: String(column.id ?? `column:${index}`),
    isNew: normalizeBoolean(column.isNew),
    deleted: normalizeBoolean(column.deleted),
    name: String(column.name ?? "").trim(),
    type: normalizeDesignerType(column.type),
    notNull: normalizeBoolean(column.notNull),
    unique: normalizeBoolean(column.unique),
    primaryKey: normalizeBoolean(column.primaryKey),
    defaultValue: assertSafeSqlFragment(column.defaultValue, "Default value"),
    referencesTable: String(column.referencesTable ?? "").trim(),
    referencesColumn: String(column.referencesColumn ?? "").trim(),
    originalName: String(column.originalName ?? "").trim(),
    originalType: normalizeDesignerType(column.originalType || column.type),
    originalNotNull: normalizeBoolean(column.originalNotNull),
    originalUnique: normalizeBoolean(column.originalUnique),
    originalPrimaryKey: normalizeBoolean(column.originalPrimaryKey),
    originalDefaultValue: assertSafeSqlFragment(column.originalDefaultValue, "Original default value"),
    originalReferencesTable: String(column.originalReferencesTable ?? "").trim(),
    originalReferencesColumn: String(column.originalReferencesColumn ?? "").trim(),
    importedValueIndex: Number.isInteger(importedValueIndex) ? importedValueIndex : null,
  };
}

function normalizeDraftPayload(payload = {}) {
  const mode = String(payload.mode ?? "create").trim() === "edit" ? "edit" : "create";

  return {
    mode,
    originalTableName: String(payload.originalTableName ?? "").trim(),
    tableName: String(payload.tableName ?? "").trim(),
    columns: Array.isArray(payload.columns)
      ? payload.columns.map((column, index) => normalizeColumnPayload(column, index))
      : [],
    schemaWarnings: Array.isArray(payload.schemaWarnings) ? payload.schemaWarnings : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    fillImportedRows: normalizeBoolean(payload.fillImportedRows),
    importedCsvFileName: String(payload.importedCsvFileName ?? "").trim(),
    importedCsvDelimiter: String(payload.importedCsvDelimiter ?? "").trim(),
    importedCsvRows: Array.isArray(payload.importedCsvRows)
      ? payload.importedCsvRows.map((row) =>
          Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []
        )
      : [],
    dirty: normalizeBoolean(payload.dirty),
  };
}

function normalizeIdentifierKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function buildSelfReferenceColumns(draft) {
  return draft.columns
    .filter((column) => !column.deleted)
    .map((column) => column.name)
    .filter(Boolean);
}

function validatePrimaryKeys(draft, originalDraft) {
  const currentPrimaryKeyColumns = draft.columns.filter(
    (column) => !column.deleted && column.primaryKey
  );

  if (currentPrimaryKeyColumns.length <= 1) {
    return;
  }

  if (!originalDraft) {
    throw new ValidationError(
      "Table Designer v1 supports a single primary key column when creating a table."
    );
  }

  const originalPrimaryKeyNames = new Set(
    originalDraft.columns
      .filter((column) => column.primaryKey)
      .map((column) => normalizeIdentifierKey(column.originalName || column.name))
  );
  const currentPrimaryKeyNames = new Set(
    currentPrimaryKeyColumns.map((column) =>
      normalizeIdentifierKey(column.originalName || column.name)
    )
  );

  const isUnchangedCompositePrimaryKey =
    originalPrimaryKeyNames.size > 1 &&
    originalPrimaryKeyNames.size === currentPrimaryKeyNames.size &&
    [...currentPrimaryKeyNames].every((name) => originalPrimaryKeyNames.has(name));

  if (!isUnchangedCompositePrimaryKey) {
    throw new ValidationError(
      "Table Designer v1 does not support editing composite primary keys."
    );
  }
}

function validateTableDesignerDraft(draft, { catalogTables = [], originalDraft = null } = {}) {
  if (!["create", "edit"].includes(draft.mode)) {
    throw new ValidationError("Draft mode must be create or edit.");
  }

  assertValidIdentifier(draft.tableName, "Table name");

  if (draft.mode === "edit") {
    assertValidIdentifier(draft.originalTableName, "Original table name");
  }

  if (!draft.columns.length) {
    throw new ValidationError("At least one column is required.");
  }

  const activeColumns = draft.columns.filter((column) => !column.deleted);

  if (!activeColumns.length) {
    throw new ValidationError("At least one column is required.");
  }

  const catalogByName = new Map(
    catalogTables.map((table) => [normalizeIdentifierKey(table.name), table])
  );
  const normalizedTableName = normalizeIdentifierKey(draft.tableName);
  const normalizedOriginalTableName = normalizeIdentifierKey(draft.originalTableName);

  if (
    catalogByName.has(normalizedTableName) &&
    (draft.mode === "create" || normalizedTableName !== normalizedOriginalTableName)
  ) {
    throw new ValidationError(`A table named ${draft.tableName} already exists.`);
  }

  const seenColumns = new Set();

  activeColumns.forEach((column) => {
    assertValidIdentifier(column.name, "Column name");
    assertSafeSqlFragment(column.type, `Type for ${column.name}`, { allowEmpty: false });

    const normalizedColumnName = normalizeIdentifierKey(column.name);

    if (seenColumns.has(normalizedColumnName)) {
      throw new ValidationError(`Duplicate column name: ${column.name}`);
    }

    seenColumns.add(normalizedColumnName);

    const hasReferenceTable = Boolean(column.referencesTable);
    const hasReferenceColumn = Boolean(column.referencesColumn);

    if (hasReferenceTable !== hasReferenceColumn) {
      throw new ValidationError(
        `Column ${column.name} must define both a referenced table and a referenced column.`
      );
    }

    if (!hasReferenceTable || !hasReferenceColumn) {
      return;
    }

    const normalizedReferenceTable = normalizeIdentifierKey(column.referencesTable);
    const referencedTable =
      normalizedReferenceTable === normalizedTableName
        ? {
            name: draft.tableName,
            columns: buildSelfReferenceColumns(draft),
          }
        : catalogByName.get(normalizedReferenceTable);

    if (!referencedTable) {
      throw new ValidationError(
        `Referenced table ${column.referencesTable} does not exist in the current SQLite schema.`
      );
    }

    const hasReferencedColumn = (referencedTable.columns ?? []).some(
      (candidate) => normalizeIdentifierKey(candidate) === normalizeIdentifierKey(column.referencesColumn)
    );

    if (!hasReferencedColumn) {
      throw new ValidationError(
        `Referenced column ${column.referencesColumn} does not exist on ${referencedTable.name}.`
      );
    }
  });

  validatePrimaryKeys(draft, originalDraft);

  if (draft.mode === "edit" && draft.fillImportedRows) {
    throw new ValidationError("Imported row fill is only available when creating a table.");
  }

  if (draft.fillImportedRows && !draft.importedCsvRows.length) {
    throw new ValidationError("Fill requires imported CSV rows.");
  }
}

module.exports = {
  normalizeDraftPayload,
  normalizeIdentifierKey,
  normalizeSqlFragment,
  validateTableDesignerDraft,
};
