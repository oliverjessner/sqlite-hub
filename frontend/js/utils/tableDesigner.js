const DEFAULT_TABLE_DESIGNER_TYPES = [
  "TEXT",
  "INTEGER",
  "REAL",
  "BLOB",
  "NUMERIC",
  "BOOLEAN",
  "DATE",
  "DATETIME",
];

function createWarning({
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

function normalizeBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeText(value) {
  return String(value ?? "");
}

function normalizeTrimmed(value) {
  return normalizeText(value).trim();
}

function normalizeIdentifierKey(value) {
  return normalizeTrimmed(value).toLowerCase();
}

function normalizeDesignerType(value) {
  return normalizeTrimmed(value).toUpperCase() || "TEXT";
}

function normalizeSqlFragment(value) {
  return normalizeTrimmed(value);
}

function quoteIdentifier(identifier) {
  return `"${normalizeText(identifier).replaceAll('"', '""')}"`;
}

function createColumnId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `column_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createEmptyTableDesignerColumn(seed = {}) {
  const type = normalizeDesignerType(seed.type ?? "TEXT");
  const defaultValue = normalizeText(seed.defaultValue ?? "");
  const referencesTable = normalizeText(seed.referencesTable ?? "");
  const referencesColumn = normalizeText(seed.referencesColumn ?? "");
  const importedValueIndex =
    seed.importedValueIndex === null || seed.importedValueIndex === undefined
      ? null
      : Number(seed.importedValueIndex);

  return {
    id: normalizeText(seed.id ?? `new:${createColumnId()}`),
    isNew: seed.isNew !== false,
    deleted: normalizeBoolean(seed.deleted),
    name: normalizeText(seed.name ?? ""),
    type,
    notNull: normalizeBoolean(seed.notNull),
    unique: normalizeBoolean(seed.unique),
    primaryKey: normalizeBoolean(seed.primaryKey),
    defaultValue,
    referencesTable,
    referencesColumn,
    originalName: normalizeText(seed.originalName ?? ""),
    originalType: normalizeDesignerType(seed.originalType ?? type),
    originalNotNull: normalizeBoolean(seed.originalNotNull),
    originalUnique: normalizeBoolean(seed.originalUnique),
    originalPrimaryKey: normalizeBoolean(seed.originalPrimaryKey),
    originalDefaultValue: normalizeText(seed.originalDefaultValue ?? defaultValue),
    originalReferencesTable: normalizeText(seed.originalReferencesTable ?? referencesTable),
    originalReferencesColumn: normalizeText(seed.originalReferencesColumn ?? referencesColumn),
    importedValueIndex: Number.isInteger(importedValueIndex) ? importedValueIndex : null,
  };
}

function normalizeDraft(rawDraft = {}) {
  return {
    mode: String(rawDraft.mode ?? "create").trim() === "edit" ? "edit" : "create",
    originalTableName: normalizeText(rawDraft.originalTableName ?? ""),
    tableName: normalizeText(rawDraft.tableName ?? ""),
    columns: Array.isArray(rawDraft.columns)
      ? rawDraft.columns.map((column) => createEmptyTableDesignerColumn(column))
      : [],
    schemaWarnings: Array.isArray(rawDraft.schemaWarnings) ? rawDraft.schemaWarnings : [],
    fillImportedRows: normalizeBoolean(rawDraft.fillImportedRows),
    importedCsvFileName: normalizeText(rawDraft.importedCsvFileName ?? ""),
    importedCsvDelimiter: normalizeText(rawDraft.importedCsvDelimiter ?? ""),
    importedCsvRows: Array.isArray(rawDraft.importedCsvRows)
      ? rawDraft.importedCsvRows.map((row) =>
          Array.isArray(row) ? row.map((cell) => normalizeText(cell)) : []
        )
      : [],
  };
}

function hasMeaningfulCreateContent(draft) {
  return (
    Boolean(normalizeTrimmed(draft.tableName)) ||
    draft.columns.some((column) =>
      !column.deleted &&
      [
        Boolean(normalizeTrimmed(column.name)),
        Boolean(normalizeTrimmed(column.defaultValue)),
        Boolean(normalizeTrimmed(column.referencesTable)),
        Boolean(normalizeTrimmed(column.referencesColumn)),
        Boolean(column.notNull),
        Boolean(column.unique),
        Boolean(column.primaryKey),
        normalizeDesignerType(column.type) !== "TEXT",
      ].some(Boolean)
    )
  );
}

function assertSafeSqlFragment(value) {
  const normalized = normalizeSqlFragment(value);

  if (!normalized) {
    return "";
  }

  if (
    normalized.includes("\0") ||
    normalized.includes(";") ||
    normalized.includes("--") ||
    normalized.includes("/*") ||
    normalized.includes("*/")
  ) {
    return "Must be a single SQL fragment without comments or semicolons.";
  }

  return "";
}

function validatePrimaryKeys(draft) {
  const currentPrimaryKeyColumns = draft.columns.filter(
    (column) => !column.deleted && column.primaryKey
  );

  if (currentPrimaryKeyColumns.length <= 1) {
    return [];
  }

  if (draft.mode !== "edit") {
    return ["Table Designer v1 supports only one primary key column for new tables."];
  }

  const originalPrimaryKeyNames = new Set(
    draft.columns
      .filter((column) => column.originalPrimaryKey)
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

  return isUnchangedCompositePrimaryKey
    ? []
    : ["Composite primary keys can be preserved but not edited in Table Designer v1."];
}

function resolveReferencedTableColumns(draft, catalogTables, referencedTableName) {
  const normalizedReferenceTable = normalizeIdentifierKey(referencedTableName);
  const normalizedDraftTableName = normalizeIdentifierKey(draft.tableName);

  if (normalizedReferenceTable && normalizedReferenceTable === normalizedDraftTableName) {
    return draft.columns
      .filter((column) => !column.deleted)
      .map((column) => column.name)
      .filter(Boolean);
  }

  return (
    catalogTables.find(
      (table) => normalizeIdentifierKey(table.name) === normalizedReferenceTable
    )?.columns ?? []
  );
}

function validateDraft(draft, { catalogTables = [] } = {}) {
  const errors = [];
  const tableName = normalizeTrimmed(draft.tableName);

  if (!tableName) {
    errors.push("Table name cannot be empty.");
  }

  if (!draft.columns.length) {
    errors.push("At least one column is required.");
  }

  const activeColumns = draft.columns.filter((column) => !column.deleted);

  if (!activeColumns.length) {
    errors.push("At least one column is required.");
  }

  const normalizedTableName = normalizeIdentifierKey(tableName);
  const normalizedOriginalTableName = normalizeIdentifierKey(draft.originalTableName);

  if (
    normalizedTableName &&
    catalogTables.some(
      (table) =>
        normalizeIdentifierKey(table.name) === normalizedTableName &&
        (draft.mode !== "edit" || normalizedTableName !== normalizedOriginalTableName)
    )
  ) {
    errors.push(`A table named ${tableName} already exists.`);
  }

  const seenColumns = new Set();

  activeColumns.forEach((column, index) => {
    const columnName = normalizeTrimmed(column.name);

    if (!columnName) {
      errors.push(`Column ${index + 1} needs a name.`);
    } else {
      const normalizedColumnName = normalizeIdentifierKey(columnName);

      if (seenColumns.has(normalizedColumnName)) {
        errors.push(`Duplicate column name: ${columnName}.`);
      }

      seenColumns.add(normalizedColumnName);
    }

    if (!normalizeTrimmed(column.type)) {
      errors.push(`Column ${columnName || index + 1} needs a type.`);
    }

    const typeError = assertSafeSqlFragment(column.type);

    if (typeError) {
      errors.push(`Type for ${columnName || index + 1}: ${typeError}`);
    }

    const defaultError = assertSafeSqlFragment(column.defaultValue);

    if (defaultError) {
      errors.push(`Default value for ${columnName || index + 1}: ${defaultError}`);
    }

    const hasReferenceTable = Boolean(normalizeTrimmed(column.referencesTable));
    const hasReferenceColumn = Boolean(normalizeTrimmed(column.referencesColumn));

    if (hasReferenceTable !== hasReferenceColumn) {
      errors.push(
        `Column ${columnName || index + 1} must define both referenced table and column.`
      );
    }

    if (!hasReferenceTable || !hasReferenceColumn) {
      return;
    }

    const referencedColumns = resolveReferencedTableColumns(
      draft,
      catalogTables,
      column.referencesTable
    );

    if (!referencedColumns.length) {
      errors.push(`Referenced table ${column.referencesTable} does not exist.`);
      return;
    }

    if (
      !referencedColumns.some(
        (candidate) =>
          normalizeIdentifierKey(candidate) === normalizeIdentifierKey(column.referencesColumn)
      )
    ) {
      errors.push(
        `Referenced column ${column.referencesColumn} does not exist on ${column.referencesTable}.`
      );
    }
  });

  return [...errors, ...validatePrimaryKeys(draft)];
}

function normalizeComparableValue(value) {
  return normalizeSqlFragment(value);
}

function hasColumnChanged(originalColumn, draftColumn) {
  return (
    normalizeIdentifierKey(originalColumn.name) !== normalizeIdentifierKey(draftColumn.name) ||
    normalizeComparableValue(originalColumn.type) !== normalizeComparableValue(draftColumn.type) ||
    Boolean(originalColumn.notNull) !== Boolean(draftColumn.notNull) ||
    Boolean(originalColumn.unique) !== Boolean(draftColumn.unique) ||
    Boolean(originalColumn.primaryKey) !== Boolean(draftColumn.primaryKey) ||
    normalizeComparableValue(originalColumn.defaultValue) !==
      normalizeComparableValue(draftColumn.defaultValue) ||
    normalizeIdentifierKey(originalColumn.referencesTable) !==
      normalizeIdentifierKey(draftColumn.referencesTable) ||
    normalizeIdentifierKey(originalColumn.referencesColumn) !==
      normalizeIdentifierKey(draftColumn.referencesColumn)
  );
}

function buildColumnDefinition(column) {
  const parts = [quoteIdentifier(column.name)];
  const type = normalizeComparableValue(column.type);
  const defaultValue = normalizeComparableValue(column.defaultValue);

  if (type) {
    parts.push(type);
  }

  if (column.primaryKey) {
    parts.push("PRIMARY KEY");
  }

  if (column.notNull) {
    parts.push("NOT NULL");
  }

  if (column.unique) {
    parts.push("UNIQUE");
  }

  if (defaultValue) {
    parts.push(`DEFAULT ${defaultValue}`);
  }

  if (normalizeTrimmed(column.referencesTable) && normalizeTrimmed(column.referencesColumn)) {
    parts.push(
      `REFERENCES ${quoteIdentifier(column.referencesTable)}(${quoteIdentifier(column.referencesColumn)})`
    );
  }

  return parts.join(" ");
}

function buildCreateTableSql(draft) {
  const columnSql = draft.columns
    .filter((column) => !column.deleted)
    .map((column) => `  ${buildColumnDefinition(column)}`)
    .join(",\n");

  return `CREATE TABLE ${quoteIdentifier(draft.tableName)} (\n${columnSql}\n);`;
}

function buildAlterTableRenameSql(fromName, toName) {
  return `ALTER TABLE ${quoteIdentifier(fromName)} RENAME TO ${quoteIdentifier(toName)};`;
}

function buildAlterTableAddColumnSql(tableName, column) {
  return `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${buildColumnDefinition(column)};`;
}

function buildRiskyChangeWarning(title, message) {
  return createWarning({
    code: "TABLE_REBUILD_REQUIRED",
    title,
    message,
    blocking: true,
  });
}

function isAlterAddColumnSafe(column) {
  const defaultValue = normalizeComparableValue(column.defaultValue);
  const normalizedDefault = defaultValue.toUpperCase();

  if (column.primaryKey) {
    return {
      safe: false,
      reason: `Column ${column.name} cannot be added with PRIMARY KEY via ALTER TABLE in SQLite.`,
    };
  }

  if (column.unique) {
    return {
      safe: false,
      reason: `Column ${column.name} cannot be added with UNIQUE via ALTER TABLE in SQLite.`,
    };
  }

  if (column.notNull && !defaultValue) {
    return {
      safe: false,
      reason:
        `Column ${column.name} uses NOT NULL without a default value. SQLite requires a table rebuild for that change.`,
    };
  }

  if (["CURRENT_TIME", "CURRENT_DATE", "CURRENT_TIMESTAMP"].includes(normalizedDefault)) {
    return {
      safe: false,
      reason:
        `Column ${column.name} uses a dynamic default value that SQLite does not allow in ALTER TABLE ADD COLUMN.`,
    };
  }

  if (/^\(.+\)$/.test(defaultValue)) {
    return {
      safe: false,
      reason:
        `Column ${column.name} uses an expression default value. SQLite requires a table rebuild for that ADD COLUMN operation.`,
    };
  }

  if (
    normalizeTrimmed(column.referencesTable) &&
    normalizeTrimmed(column.referencesColumn) &&
    defaultValue &&
    normalizedDefault !== "NULL"
  ) {
    return {
      safe: false,
      reason:
        `Column ${column.name} adds a foreign key with a non-NULL default value. SQLite requires a table rebuild for that change.`,
    };
  }

  return { safe: true, reason: "" };
}

function analyzeEditDraft(draft) {
  const originalColumnsByName = new Map(
    draft.columns
      .filter((column) => normalizeTrimmed(column.originalName))
      .map((column) => [normalizeIdentifierKey(column.originalName), column])
  );
  const matchedOriginalNames = new Set();
  const newColumns = [];
  const warnings = [];
  const executableStatements = [];

  draft.columns.forEach((column) => {
    if (column.deleted) {
      if (normalizeTrimmed(column.originalName || column.name)) {
        warnings.push(
          buildRiskyChangeWarning(
            "Column Delete Requires Rebuild",
            `Deleting column ${column.originalName || column.name} requires a SQLite table rebuild.`
          )
        );
      }

      return;
    }

    const originalNameKey = normalizeIdentifierKey(column.originalName);

    if (originalNameKey && originalColumnsByName.has(originalNameKey)) {
      const originalColumn = originalColumnsByName.get(originalNameKey);
      matchedOriginalNames.add(originalNameKey);

      if (hasColumnChanged(originalColumn, column)) {
        if (normalizeIdentifierKey(originalColumn.name) !== normalizeIdentifierKey(column.name)) {
          warnings.push(
            buildRiskyChangeWarning(
              "Column Rename Requires Rebuild",
              `Renaming column ${originalColumn.name} to ${column.name} is intentionally blocked in Table Designer v1.`
            )
          );
        }

        if (normalizeComparableValue(originalColumn.type) !== normalizeComparableValue(column.type)) {
          warnings.push(
            buildRiskyChangeWarning(
              "Column Type Change Requires Rebuild",
              `Changing the type of ${originalColumn.name} from ${originalColumn.type} to ${column.type} requires a SQLite table rebuild.`
            )
          );
        }

        if (Boolean(originalColumn.notNull) !== Boolean(column.notNull)) {
          warnings.push(
            buildRiskyChangeWarning(
              "NOT NULL Change Requires Rebuild",
              `Changing the NOT NULL setting on ${originalColumn.name} requires a SQLite table rebuild.`
            )
          );
        }

        if (Boolean(originalColumn.unique) !== Boolean(column.unique)) {
          warnings.push(
            buildRiskyChangeWarning(
              "UNIQUE Change Requires Rebuild",
              `Changing the UNIQUE setting on ${originalColumn.name} requires a SQLite table rebuild.`
            )
          );
        }

        if (Boolean(originalColumn.primaryKey) !== Boolean(column.primaryKey)) {
          warnings.push(
            buildRiskyChangeWarning(
              "Primary Key Change Requires Rebuild",
              `Changing the primary key definition on ${originalColumn.name} requires a SQLite table rebuild.`
            )
          );
        }

        if (
          normalizeComparableValue(originalColumn.defaultValue) !==
          normalizeComparableValue(column.defaultValue)
        ) {
          warnings.push(
            buildRiskyChangeWarning(
              "Default Value Change Requires Rebuild",
              `Changing the default value on ${originalColumn.name} requires a SQLite table rebuild.`
            )
          );
        }

        if (
          normalizeIdentifierKey(originalColumn.referencesTable) !==
            normalizeIdentifierKey(column.referencesTable) ||
          normalizeIdentifierKey(originalColumn.referencesColumn) !==
            normalizeIdentifierKey(column.referencesColumn)
        ) {
          warnings.push(
            buildRiskyChangeWarning(
              "Foreign Key Change Requires Rebuild",
              `Changing the foreign key on ${originalColumn.name} requires a SQLite table rebuild.`
            )
          );
        }
      }

      return;
    }

    newColumns.push(column);
  });

  const tableRenameChanged =
    normalizeIdentifierKey(draft.tableName) !== normalizeIdentifierKey(draft.originalTableName);

  if (tableRenameChanged) {
    executableStatements.push(
      buildAlterTableRenameSql(draft.originalTableName, draft.tableName)
    );
  }

  newColumns.forEach((column) => {
    const safety = isAlterAddColumnSafe(column);

    if (!safety.safe) {
      warnings.push(buildRiskyChangeWarning("Column Add Requires Rebuild", safety.reason));
      return;
    }

    executableStatements.push(
      buildAlterTableAddColumnSql(tableRenameChanged ? draft.tableName : draft.originalTableName, column)
    );
  });

  return {
    dirty: Boolean(executableStatements.length || warnings.length),
    executable: warnings.length === 0,
    statements: warnings.length === 0 ? executableStatements : [],
    previewStatements: executableStatements,
    warnings,
  };
}

function analyzeDraft(draft) {
  if (draft.mode === "create") {
    return {
      dirty: hasMeaningfulCreateContent(draft),
      executable: true,
      statements: [buildCreateTableSql(draft)],
      previewStatements: [buildCreateTableSql(draft)],
      warnings: [],
    };
  }

  return analyzeEditDraft(draft);
}

function prefixSqlAsComment(sql) {
  return sql
    .split("\n")
    .map((line) => `-- ${line}`)
    .join("\n");
}

function buildPreviewSql({ draft, validationErrors, warnings, analysis, readOnly }) {
  if (readOnly) {
    return [
      "-- This connection is opened READ ONLY.",
      "-- Table Designer preview is available, but schema changes cannot be saved.",
    ].join("\n");
  }

  if (validationErrors.length) {
    return [
      "-- Fix the validation issues below before SQL can be executed.",
      ...validationErrors.map((error) => `-- - ${error}`),
    ].join("\n");
  }

  if (warnings.some((warning) => warning.blocking)) {
    const lines = [
      "-- This draft is not executable in Table Designer v1.",
      "-- SQLite would require a table rebuild for the requested changes:",
      ...warnings
        .filter((warning) => warning.blocking)
        .map((warning) => `-- - ${warning.title}: ${warning.message}`),
    ];

    if (analysis.previewStatements.length) {
      lines.push("", "-- Safe statements currently suppressed:");
      analysis.previewStatements.forEach((statement) => {
        lines.push(prefixSqlAsComment(statement));
      });
    }

    lines.push(
      "",
      "-- Suggested rebuild outline:",
      "-- BEGIN TRANSACTION;",
      "-- CREATE TABLE \"__new_table\" (...);",
      "-- INSERT INTO \"__new_table\" (...) SELECT ... FROM \"old_table\";",
      "-- DROP TABLE \"old_table\";",
      "-- ALTER TABLE \"__new_table\" RENAME TO \"old_table\";",
      "-- COMMIT;"
    );

    return lines.join("\n");
  }

  if (!analysis.dirty && draft.mode === "edit") {
    return "-- No schema changes pending.";
  }

  return [...analysis.statements, ...buildImportedInsertPreviewSql(draft)].join("\n\n");
}

function escapeSqlLiteral(value) {
  return normalizeText(value).replaceAll("'", "''");
}

function formatImportedCellValueForSql(column, value) {
  const textValue = normalizeText(value);
  const trimmedValue = normalizeTrimmed(value);
  const type = normalizeDesignerType(column.type);

  if (!trimmedValue) {
    return type === "TEXT" || type === "DATE" || type === "DATETIME" ? "''" : "NULL";
  }

  if (type === "BOOLEAN") {
    if (["true", "yes", "1"].includes(normalizeIdentifierKey(value))) {
      return "1";
    }

    if (["false", "no", "0"].includes(normalizeIdentifierKey(value))) {
      return "0";
    }
  }

  if (
    ["INTEGER", "REAL", "NUMERIC"].includes(type) &&
    /^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmedValue)
  ) {
    return trimmedValue;
  }

  return `'${escapeSqlLiteral(textValue)}'`;
}

function getImportedFillColumns(draft) {
  return draft.columns.filter(
    (column) => !column.deleted && Number.isInteger(column.importedValueIndex)
  );
}

function buildImportedInsertPreviewSql(draft, maxRows = 3) {
  if (!draft.fillImportedRows || !draft.importedCsvRows.length) {
    return [];
  }

  const importedColumns = getImportedFillColumns(draft);

  if (!importedColumns.length) {
    return [];
  }

  const columnSql = importedColumns.map((column) => quoteIdentifier(column.name)).join(", ");
  const insertPrefix = [
    "INSERT INTO",
    quoteIdentifier(draft.tableName),
    "(",
    columnSql,
    ") VALUES",
  ].join(" ");
  const previewStatements = draft.importedCsvRows.slice(0, maxRows).map((row) => {
    const valueSql = importedColumns
      .map((column) => formatImportedCellValueForSql(column, row[column.importedValueIndex] ?? ""))
      .join(", ");

    return [insertPrefix, "(", valueSql, ");"].join(" ");
  });

  if (draft.importedCsvRows.length > maxRows) {
    previewStatements.push(
      `-- ... ${draft.importedCsvRows.length - maxRows} more imported row${
        draft.importedCsvRows.length - maxRows === 1 ? "" : "s"
      }`
    );
  }

  return previewStatements;
}

function dedupeWarnings(warnings) {
  const seen = new Set();

  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.title}:${warning.message}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isCsvRowEmpty(row = []) {
  return !row.some((cell) => normalizeTrimmed(cell));
}

function parseCsvRows(text, delimiter = ",", maxRows = 16) {
  const source = normalizeText(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
    return rows.length >= maxRows;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += character;
      }

      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === delimiter) {
      pushCell();
      continue;
    }

    if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") {
        index += 1;
      }

      if (pushRow()) {
        return rows;
      }

      continue;
    }

    cell += character;
  }

  if (cell.length || row.length) {
    pushRow();
  }

  return rows;
}

function scoreCsvDelimiter(text, delimiter) {
  const rows = parseCsvRows(text, delimiter, 10).filter((row) => !isCsvRowEmpty(row));

  if (!rows.length) {
    return Number.NEGATIVE_INFINITY;
  }

  const headerWidth = rows[0]?.length ?? 0;
  const consistentWidthCount = rows.filter((row) => row.length === headerWidth).length;
  const populatedHeaderCount = rows[0].filter((cell) => normalizeTrimmed(cell)).length;

  return headerWidth * 20 + consistentWidthCount * 8 + populatedHeaderCount * 6;
}

function detectCsvDelimiter(text) {
  const candidates = [",", ";", "\t", "|"];
  let bestDelimiter = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  candidates.forEach((delimiter) => {
    const score = scoreCsvDelimiter(text, delimiter);

    if (score > bestScore) {
      bestDelimiter = delimiter;
      bestScore = score;
    }
  });

  return bestDelimiter;
}

function normalizeImportedColumnName(value) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function normalizeImportedTableName(value) {
  const normalized = normalizeText(value)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  if (!normalized) {
    return "imported_table";
  }

  return /^[0-9]/.test(normalized) ? `table_${normalized}` : normalized;
}

function buildUniqueName(baseName, usedNames, fallbackPrefix) {
  const normalizedBase = normalizeTrimmed(baseName) || fallbackPrefix;
  let candidate = normalizedBase;
  let suffix = 2;

  while (usedNames.has(normalizeIdentifierKey(candidate))) {
    candidate = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }

  usedNames.add(normalizeIdentifierKey(candidate));
  return candidate;
}

function suggestImportedTableName(fileName, catalogTables = []) {
  const existingNames = new Set(
    catalogTables.map((table) => normalizeIdentifierKey(table.name))
  );

  return buildUniqueName(normalizeImportedTableName(fileName), existingNames, "imported_table");
}

function isBooleanSample(value) {
  return ["true", "false", "yes", "no"].includes(normalizeIdentifierKey(value));
}

function isIntegerSample(value) {
  return /^-?\d+$/.test(normalizeTrimmed(value));
}

function isRealSample(value) {
  return /^-?(?:\d+\.\d+|\d+\.\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(normalizeTrimmed(value));
}

function isDateSample(value) {
  const normalized = normalizeTrimmed(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return false;
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

function isDateTimeSample(value) {
  const normalized = normalizeTrimmed(value);

  if (
    !/^\d{4}-\d{2}-\d{2}[ tT]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(
      normalized
    )
  ) {
    return false;
  }

  return !Number.isNaN(Date.parse(normalized.replace(" ", "T")));
}

function inferImportedColumnType(columnName, sampleValues) {
  const nonEmptyValues = sampleValues.map(normalizeTrimmed).filter(Boolean);
  const normalizedColumnName = normalizeIdentifierKey(columnName);

  if (normalizedColumnName === "id") {
    return "INTEGER";
  }

  if (!nonEmptyValues.length) {
    return normalizedColumnName.endsWith("_id") ? "INTEGER" : "TEXT";
  }

  if (nonEmptyValues.every(isDateTimeSample)) {
    return "DATETIME";
  }

  if (nonEmptyValues.every(isDateSample)) {
    return "DATE";
  }

  if (nonEmptyValues.every(isBooleanSample)) {
    return "BOOLEAN";
  }

  if (nonEmptyValues.every(isIntegerSample)) {
    return "INTEGER";
  }

  if (nonEmptyValues.every((value) => isIntegerSample(value) || isRealSample(value))) {
    return "REAL";
  }

  return "TEXT";
}

export function createTableDesignerDraftFromCsvImport(
  { fileName = "", csvText = "" },
  { catalogTables = [], supportedTypes = DEFAULT_TABLE_DESIGNER_TYPES, readOnly = false } = {}
) {
  const delimiter = detectCsvDelimiter(csvText);
  const rows = parseCsvRows(csvText, delimiter, Number.POSITIVE_INFINITY).filter(
    (row) => !isCsvRowEmpty(row)
  );

  if (!rows.length) {
    throw new Error("The selected CSV file is empty.");
  }

  const headerRow = rows[0].map((cell) => normalizeImportedColumnName(cell));

  if (!headerRow.some((cell) => normalizeTrimmed(cell))) {
    throw new Error("The CSV header row is empty.");
  }

  const sampleRows = rows.slice(1).filter((row) => !isCsvRowEmpty(row)).slice(0, 3);
  const usedColumnNames = new Set();
  let primaryKeyAssigned = false;

  const columns = headerRow.map((headerCell, index) => {
    const fallbackName = `column_${index + 1}`;
    const columnName = buildUniqueName(
      normalizeImportedColumnName(headerCell) || fallbackName,
      usedColumnNames,
      fallbackName
    );
    const sampleValues = sampleRows.map((row) => row[index] ?? "");
    const originalHeaderName = normalizeIdentifierKey(headerCell);
    const isPrimaryKey = !primaryKeyAssigned && originalHeaderName === "id";

    if (isPrimaryKey) {
      primaryKeyAssigned = true;
    }

    return createEmptyTableDesignerColumn({
      name: columnName,
      type: isPrimaryKey ? "INTEGER" : inferImportedColumnType(columnName, sampleValues),
      primaryKey: isPrimaryKey,
      notNull: isPrimaryKey,
      importedValueIndex: index,
    });
  });

  const importedCsvRows = rows
    .slice(1)
    .filter((row) => !isCsvRowEmpty(row))
    .map((row) => headerRow.map((_, index) => row[index] ?? ""));

  const draft = recalculateTableDesignerDraft(
    {
      mode: "create",
      originalTableName: "",
      tableName: suggestImportedTableName(fileName, catalogTables),
      columns,
      schemaWarnings: [],
      fillImportedRows: importedCsvRows.length > 0,
      importedCsvFileName: normalizeText(fileName),
      importedCsvDelimiter: delimiter,
      importedCsvRows,
    },
    { catalogTables, supportedTypes, readOnly }
  );

  return {
    draft,
    columnCount: columns.length,
    delimiter,
    importedRowCount: importedCsvRows.length,
    sampleRowCount: sampleRows.length,
  };
}

export function createNewTableDesignerDraft() {
  return {
    mode: "create",
    originalTableName: "",
    tableName: "",
    columns: [createEmptyTableDesignerColumn()],
    dirty: false,
    schemaWarnings: [],
    fillImportedRows: false,
    importedCsvFileName: "",
    importedCsvDelimiter: "",
    importedCsvRows: [],
    warnings: [],
    validationErrors: [],
    sqlPreview: "-- Start a new table by naming it and adding at least one column.",
    canSave: false,
  };
}

export function getTableDesignerTypeOptions(draft, supportedTypes = DEFAULT_TABLE_DESIGNER_TYPES) {
  const typeSet = new Set([
    ...(supportedTypes ?? DEFAULT_TABLE_DESIGNER_TYPES),
    ...draft.columns.filter((column) => !column.deleted).map((column) => column.type),
  ]);
  return [...typeSet].filter(Boolean).sort((left, right) => left.localeCompare(right));
}

export function recalculateTableDesignerDraft(
  rawDraft,
  { catalogTables = [], supportedTypes = DEFAULT_TABLE_DESIGNER_TYPES, readOnly = false } = {}
) {
  const draft = normalizeDraft(rawDraft);
  const validationErrors = validateDraft(draft, { catalogTables });
  const analysis = analyzeDraft(draft);
  const warnings = dedupeWarnings([
    ...draft.schemaWarnings,
    ...analysis.warnings,
    ...(readOnly
      ? [
          createWarning({
            code: "READ_ONLY_CONNECTION",
            title: "Read Only Connection",
            message: "The active SQLite file is opened read-only, so schema changes cannot be saved.",
            blocking: true,
          }),
        ]
      : []),
  ]);
  const dirty = draft.mode === "create" ? hasMeaningfulCreateContent(draft) : analysis.dirty;
  const sqlPreview = buildPreviewSql({
    draft,
    validationErrors,
    warnings,
    analysis,
    readOnly,
  });
  const canSave =
    !readOnly &&
    dirty &&
    validationErrors.length === 0 &&
    !warnings.some((warning) => warning.blocking);

  return {
    ...draft,
    dirty,
    warnings,
    validationErrors,
    sqlPreview,
    canSave,
    hasBlockingWarnings: warnings.some((warning) => warning.blocking),
    supportedTypes: getTableDesignerTypeOptions(draft, supportedTypes),
  };
}

export function updateTableDesignerDraftField(draft, field, value, context = {}) {
  return recalculateTableDesignerDraft(
    {
      ...draft,
      [field]: value,
    },
    context
  );
}

export function updateTableDesignerColumnField(draft, columnId, field, value, context = {}) {
  return recalculateTableDesignerDraft(
    {
      ...draft,
      columns: draft.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              [field]:
                ["notNull", "unique", "primaryKey"].includes(field)
                  ? normalizeBoolean(value)
                  : value,
            }
          : column
      ),
    },
    context
  );
}

export function addTableDesignerColumn(draft, context = {}) {
  return recalculateTableDesignerDraft(
    {
      ...draft,
      columns: [...draft.columns, createEmptyTableDesignerColumn()],
    },
    context
  );
}

export function removeTableDesignerColumn(draft, columnId, context = {}) {
  const targetColumn = draft.columns.find((column) => column.id === columnId);

  if (!targetColumn) {
    return recalculateTableDesignerDraft(draft, context);
  }

  return recalculateTableDesignerDraft(
    {
      ...draft,
      columns: targetColumn.isNew
        ? draft.columns.filter((column) => column.id !== columnId)
        : draft.columns.map((column) =>
            column.id === columnId
              ? {
                  ...column,
                  deleted: true,
                }
              : column
          ),
    },
    context
  );
}

export function hydrateTableDesignerDraft(
  draft,
  { catalogTables = [], supportedTypes = DEFAULT_TABLE_DESIGNER_TYPES, readOnly = false } = {}
) {
  return recalculateTableDesignerDraft(draft, {
    catalogTables,
    supportedTypes,
    readOnly,
  });
}
