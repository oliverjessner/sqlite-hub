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

function normalizeImportFormat(value, { allowEmpty = false } = {}) {
  const normalized = normalizeIdentifierKey(value);

  if (["csv", "tsv", "json"].includes(normalized)) {
    return normalized;
  }

  return allowEmpty ? "" : "csv";
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

function normalizeImportedCellValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (["boolean", "number", "string"].includes(typeof value)) {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeImportedRows(rows) {
  return Array.isArray(rows)
    ? rows.map((row) =>
        Array.isArray(row) ? row.map((cell) => normalizeImportedCellValue(cell)) : []
      )
    : [];
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
  const importRows = normalizeImportedRows(rawDraft.importRows ?? rawDraft.importedCsvRows);
  const importSourceFileName = normalizeText(
    rawDraft.importSourceFileName ?? rawDraft.importedCsvFileName ?? ""
  );
  const importDelimiter = normalizeText(rawDraft.importDelimiter ?? rawDraft.importedCsvDelimiter ?? "");
  const importFormat = normalizeImportFormat(
    rawDraft.importFormat ?? (importSourceFileName ? "csv" : ""),
    { allowEmpty: true }
  );

  return {
    mode: String(rawDraft.mode ?? "create").trim() === "edit" ? "edit" : "create",
    originalTableName: normalizeText(rawDraft.originalTableName ?? ""),
    tableName: normalizeText(rawDraft.tableName ?? ""),
    columns: Array.isArray(rawDraft.columns)
      ? rawDraft.columns.map((column) => createEmptyTableDesignerColumn(column))
      : [],
    uniqueConstraints: Array.isArray(rawDraft.uniqueConstraints)
      ? rawDraft.uniqueConstraints.map((constraint, index) => ({
          id: normalizeText(constraint.id ?? `unique:${index}`),
          name: normalizeText(constraint.name ?? ""),
          originalName: normalizeText(constraint.originalName ?? constraint.name ?? ""),
          columns: Array.isArray(constraint.columns)
            ? constraint.columns
                .map((column) => ({
                  name: normalizeText(column?.name ?? ""),
                  descending: normalizeBoolean(column?.descending),
                  collation: normalizeText(column?.collation ?? ""),
                }))
                .filter((column) => normalizeTrimmed(column.name))
            : [],
          partial: normalizeBoolean(constraint.partial),
          origin: normalizeText(constraint.origin ?? ""),
          sql: normalizeText(constraint.sql ?? ""),
          originalSql: normalizeText(constraint.originalSql ?? constraint.sql ?? ""),
          expression: normalizeText(constraint.expression ?? ""),
          originalExpression: normalizeText(constraint.originalExpression ?? constraint.expression ?? constraint.sql ?? ""),
          editable: normalizeBoolean(constraint.editable),
          preserved: constraint.preserved === undefined ? true : normalizeBoolean(constraint.preserved),
        }))
      : [],
    checkConstraints: Array.isArray(rawDraft.checkConstraints)
      ? rawDraft.checkConstraints.map((constraint, index) => ({
          id: normalizeText(constraint.id ?? `check:${index}`),
          name: normalizeText(constraint.name ?? `CHECK ${index + 1}`),
          originalName: normalizeText(constraint.originalName ?? constraint.name ?? `CHECK ${index + 1}`),
          deleted: normalizeBoolean(constraint.deleted),
          columns: Array.isArray(constraint.columns)
            ? constraint.columns
                .map((column) => ({
                  name: normalizeText(column?.name ?? ""),
                  allowedValues: Array.isArray(column?.allowedValues)
                    ? column.allowedValues.map((value) => normalizeText(value))
                    : [],
                }))
                .filter((column) => normalizeTrimmed(column.name))
            : [],
          expression: normalizeText(constraint.expression ?? ""),
          originalExpression: normalizeText(constraint.originalExpression ?? constraint.expression ?? ""),
          editable: normalizeBoolean(constraint.editable),
          preserved: constraint.preserved === undefined ? true : normalizeBoolean(constraint.preserved),
          columnId: normalizeText(constraint.columnId ?? ""),
          source: normalizeText(constraint.source ?? (constraint.originalExpression ? "detected" : "user")),
          presetId: normalizeText(constraint.presetId ?? ""),
          presetFields:
            constraint.presetFields && typeof constraint.presetFields === "object"
              ? Object.fromEntries(
                  Object.entries(constraint.presetFields).map(([key, value]) => [
                    key,
                    normalizeText(value),
                  ])
                )
              : {},
        }))
      : [],
    designerVersion: Number(rawDraft.designerVersion) || 1,
    schemaWarnings: Array.isArray(rawDraft.schemaWarnings) ? rawDraft.schemaWarnings : [],
    fillImportedRows: normalizeBoolean(rawDraft.fillImportedRows),
    importFormat,
    importSourceFileName,
    importDelimiter,
    importRows,
    importedCsvFileName: importSourceFileName,
    importedCsvDelimiter: importDelimiter,
    importedCsvRows: importRows,
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
    return ["Table Designer v2 supports only one primary key column for new tables."];
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
    : ["Composite primary keys can be preserved but not edited in Table Designer v2."];
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

function hasConstraintChanged(constraint) {
  return (
    normalizeComparableValue(constraint.name) !==
      normalizeComparableValue(constraint.originalName ?? constraint.name) ||
    normalizeComparableValue(constraint.expression || constraint.sql) !==
      normalizeComparableValue(
        constraint.originalExpression ?? constraint.originalSql ?? constraint.expression ?? constraint.sql
      )
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

function normalizeCheckExpressionSql(expression) {
  const normalized = normalizeTrimmed(expression);

  if (!normalized) {
    return "";
  }

  if (/^CHECK\s*\(/i.test(normalized)) {
    return normalized;
  }

  return `CHECK (${normalized})`;
}

function buildCheckConstraintSql(constraint) {
  if (constraint.deleted) {
    return "";
  }

  return normalizeCheckExpressionSql(constraint.expression);
}

function buildCreateTableSql(draft) {
  const columnSql = draft.columns
    .filter((column) => !column.deleted)
    .map((column) => `  ${buildColumnDefinition(column)}`);
  const checkSql = (draft.checkConstraints ?? [])
    .map(buildCheckConstraintSql)
    .filter(Boolean)
    .map((constraintSql) => `  ${constraintSql}`);
  const definitionSql = [...columnSql, ...checkSql]
    .join(",\n");

  return `CREATE TABLE ${quoteIdentifier(draft.tableName)} (\n${definitionSql}\n);`;
}

function getUniqueConstraintExpression(constraint) {
  const expression = normalizeTrimmed(constraint.expression || constraint.sql);

  if (expression) {
    return expression;
  }

  const columnSql = (constraint.columns ?? [])
    .map((column) => quoteIdentifier(column.name))
    .join(", ");

  return columnSql ? `UNIQUE (${columnSql})` : "UNIQUE constraint";
}

function getCheckConstraintExpression(constraint) {
  return normalizeTrimmed(constraint.expression) || "CHECK constraint";
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
              `Renaming column ${originalColumn.name} to ${column.name} is intentionally blocked in Table Designer v2.`
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

  [...(draft.uniqueConstraints ?? []), ...(draft.checkConstraints ?? [])].forEach((constraint) => {
    if (!hasConstraintChanged(constraint)) {
      return;
    }

    warnings.push(
      buildRiskyChangeWarning(
        "Constraint Change Requires Rebuild",
        `Changing ${constraint.originalName || constraint.name || "a table constraint"} requires a SQLite table rebuild.`
      )
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
  const preservedUniqueConstraints = draft.mode === "edit" ? draft.uniqueConstraints ?? [] : [];
  const preservedCheckConstraints = draft.mode === "edit" ? draft.checkConstraints ?? [] : [];
  const preservedUniqueConstraintComments = preservedUniqueConstraints.length
    ? [
        "-- Table Designer v2 preserves these UNIQUE constraints:",
        ...preservedUniqueConstraints.map(
          (constraint) => `-- - ${getUniqueConstraintExpression(constraint)}`
        ),
      ]
    : [];
  const preservedCheckConstraintComments = preservedCheckConstraints.length
    ? [
        "-- Table Designer v2 preserves these CHECK constraints:",
        ...preservedCheckConstraints.map(
          (constraint) => `-- - ${getCheckConstraintExpression(constraint)}`
        ),
      ]
    : [];
  const preservedConstraintComments = [
    ...preservedUniqueConstraintComments,
    ...(
      preservedUniqueConstraintComments.length && preservedCheckConstraintComments.length
        ? [""]
        : []
    ),
    ...preservedCheckConstraintComments,
  ];

  if (readOnly) {
    return [
      "-- This connection is opened READ ONLY.",
      "-- Table Designer preview is available, but schema changes cannot be saved.",
      ...(
        preservedConstraintComments.length
          ? ["", ...preservedConstraintComments]
          : []
      ),
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
      "-- This draft is not executable in Table Designer v2.",
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

    if (preservedConstraintComments.length) {
      lines.push("", ...preservedConstraintComments);
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
    return [
      "-- No schema changes pending.",
      ...(
        preservedConstraintComments.length
          ? ["", ...preservedConstraintComments]
          : []
      ),
    ].join("\n");
  }

  return [
    ...analysis.statements,
    ...(
      preservedConstraintComments.length
        ? [preservedConstraintComments.join("\n")]
        : []
    ),
    ...buildImportedInsertPreviewSql(draft),
  ].join("\n\n");
}

function escapeSqlLiteral(value) {
  return normalizeText(value).replaceAll("'", "''");
}

function formatImportedCellValueForSql(column, value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  const type = normalizeDesignerType(column.type);
  const normalizedValue =
    typeof value === "object" ? normalizeImportedCellValue(value) : value;
  const textValue = normalizeText(normalizedValue);
  const trimmedValue = normalizeTrimmed(normalizedValue);

  if (!trimmedValue) {
    return type === "TEXT" || type === "DATE" || type === "DATETIME" ? "''" : "NULL";
  }

  if (typeof normalizedValue === "boolean") {
    return normalizedValue ? "1" : "0";
  }

  if (type === "BOOLEAN") {
    if (["true", "yes", "1"].includes(normalizeIdentifierKey(normalizedValue))) {
      return "1";
    }

    if (["false", "no", "0"].includes(normalizeIdentifierKey(normalizedValue))) {
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

function getImportedRows(draft) {
  return Array.isArray(draft.importRows) && draft.importRows.length
    ? draft.importRows
    : draft.importedCsvRows ?? [];
}

function buildImportedInsertPreviewSql(draft, maxRows = 3) {
  const importRows = getImportedRows(draft);

  if (!draft.fillImportedRows || !importRows.length) {
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
  const previewStatements = importRows.slice(0, maxRows).map((row) => {
    const valueSql = importedColumns
      .map((column) => formatImportedCellValueForSql(column, row[column.importedValueIndex]))
      .join(", ");

    return [insertPrefix, "(", valueSql, ");"].join(" ");
  });

  if (importRows.length > maxRows) {
    previewStatements.push(
      `-- ... ${importRows.length - maxRows} more imported row${
        importRows.length - maxRows === 1 ? "" : "s"
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

  if (inQuotes) {
    throw new Error("Delimited text contains an unterminated quoted value.");
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

function inferImportFormatFromFileName(fileName) {
  const extension = normalizeIdentifierKey(String(fileName ?? "").split(".").pop());

  if (["csv", "tsv", "json"].includes(extension)) {
    return extension;
  }

  return "csv";
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

function isNumericImportValue(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerImportValue(value) {
  return isNumericImportValue(value) && Number.isInteger(value);
}

export function inferSQLiteType(values = [], { columnName = "" } = {}) {
  const nonEmptyValues = values.filter((value) => {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === "string") {
      return Boolean(normalizeTrimmed(value));
    }

    return true;
  });
  const normalizedColumnName = normalizeIdentifierKey(columnName);

  if (normalizedColumnName === "id") {
    return "INTEGER";
  }

  if (!nonEmptyValues.length) {
    return normalizedColumnName.endsWith("_id") ? "INTEGER" : "TEXT";
  }

  if (nonEmptyValues.some((value) => typeof value === "object")) {
    return "TEXT";
  }

  if (nonEmptyValues.every((value) => typeof value === "boolean")) {
    return "INTEGER";
  }

  if (nonEmptyValues.every(isIntegerImportValue)) {
    return "INTEGER";
  }

  if (nonEmptyValues.every(isNumericImportValue)) {
    return "REAL";
  }

  const stringValues = nonEmptyValues.map(normalizeTrimmed);

  if (nonEmptyValues.every(isDateTimeSample)) {
    return "DATETIME";
  }

  if (stringValues.every(isDateSample)) {
    return "DATE";
  }

  if (stringValues.every(isBooleanSample)) {
    return "BOOLEAN";
  }

  if (stringValues.every(isIntegerSample)) {
    return "INTEGER";
  }

  if (stringValues.every((value) => isIntegerSample(value) || isRealSample(value))) {
    return "REAL";
  }

  return "TEXT";
}

function isPlainImportObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeJsonImportValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  return normalizeImportedCellValue(value);
}

function buildImportColumns(sourceNames, importRows) {
  const usedColumnNames = new Set();
  let primaryKeyAssigned = false;

  return sourceNames.map((sourceName, index) => {
    const fallbackName = `column_${index + 1}`;
    const targetName = buildUniqueName(
      normalizeImportedColumnName(sourceName) || fallbackName,
      usedColumnNames,
      fallbackName
    );
    const values = importRows.map((row) => row[index]);
    const sourceKey = normalizeIdentifierKey(sourceName);
    const isPrimaryKey = !primaryKeyAssigned && sourceKey === "id";

    if (isPrimaryKey) {
      primaryKeyAssigned = true;
    }

    return {
      sourceName,
      targetName,
      inferredType: isPrimaryKey ? "INTEGER" : inferSQLiteType(values, { columnName: targetName }),
      nullable: values.some((value) => value === null || value === undefined || normalizeTrimmed(value) === ""),
      primaryKey: isPrimaryKey,
    };
  });
}

function createDelimitedImportDataset({ fileName = "", text = "", format = "csv" } = {}) {
  const importFormat = normalizeImportFormat(format);
  const delimiter = importFormat === "tsv" ? "\t" : detectCsvDelimiter(text);
  const rows = parseCsvRows(text, delimiter, Number.POSITIVE_INFINITY).filter(
    (row) => !isCsvRowEmpty(row)
  );

  if (!rows.length) {
    throw new Error(`The selected ${importFormat.toUpperCase()} file is empty.`);
  }

  const headerRow = rows[0].map((cell) => normalizeImportedColumnName(cell));

  if (!headerRow.some((cell) => normalizeTrimmed(cell))) {
    throw new Error(`The ${importFormat.toUpperCase()} header row is empty.`);
  }

  const dataRows = rows.slice(1).filter((row) => !isCsvRowEmpty(row));
  const headerWidth = headerRow.length;
  const overflowRow = dataRows.find((row) => row.length > headerWidth);

  if (overflowRow) {
    throw new Error(
      `${importFormat.toUpperCase()} row has more values than the header row.`
    );
  }

  const importRows = dataRows.map((row) => headerRow.map((_, index) => row[index] ?? ""));
  const sourceNames = headerRow.map((headerCell, index) => headerCell || `column_${index + 1}`);
  const columns = buildImportColumns(sourceNames, importRows);

  return {
    format: importFormat,
    sourceFileName: normalizeText(fileName),
    suggestedTableName: normalizeImportedTableName(fileName),
    delimiter,
    columns,
    previewRows: importRows.slice(0, 16),
    rows: importRows,
    rowCount: importRows.length,
  };
}

function createJsonImportDataset({ fileName = "", text = "" } = {}) {
  const sourceText = normalizeText(text).replace(/^\uFEFF/, "").trim();

  if (!sourceText) {
    throw new Error("The selected JSON file is empty.");
  }

  let parsed;

  try {
    parsed = JSON.parse(sourceText);
  } catch (error) {
    throw new Error(`INVALID_JSON: ${error.message}`);
  }

  let records;

  if (Array.isArray(parsed)) {
    if (!parsed.length) {
      throw new Error("EMPTY_JSON_ARRAY_IS_NOT_SUPPORTED");
    }

    if (!parsed.every(isPlainImportObject)) {
      throw new Error("MIXED_ARRAY_VALUES_ARE_NOT_SUPPORTED");
    }

    records = parsed;
  } else if (isPlainImportObject(parsed)) {
    records = [parsed];
  } else {
    throw new Error("JSON_ROOT_VALUE_IS_NOT_SUPPORTED");
  }

  const sourceNames = [];
  const seenKeys = new Set();

  records.forEach((record) => {
    Object.keys(record).forEach((key) => {
      if (seenKeys.has(key)) {
        return;
      }

      seenKeys.add(key);
      sourceNames.push(key);
    });
  });

  if (!sourceNames.length) {
    throw new Error("JSON records do not contain importable properties.");
  }

  const importRows = records.map((record) =>
    sourceNames.map((sourceName) =>
      Object.prototype.hasOwnProperty.call(record, sourceName)
        ? normalizeJsonImportValue(record[sourceName])
        : null
    )
  );
  const columns = buildImportColumns(sourceNames, importRows);

  return {
    format: "json",
    sourceFileName: normalizeText(fileName),
    suggestedTableName: normalizeImportedTableName(fileName),
    delimiter: "",
    columns,
    previewRows: importRows.slice(0, 16),
    rows: importRows,
    rowCount: importRows.length,
  };
}

export function createImportDatasetFromText({ fileName = "", text = "", format = "" } = {}) {
  const importFormat = normalizeImportFormat(format || inferImportFormatFromFileName(fileName));

  if (importFormat === "json") {
    return createJsonImportDataset({ fileName, text });
  }

  return createDelimitedImportDataset({ fileName, text, format: importFormat });
}

export function createTableDesignerDraftFromImport(
  { fileName = "", text = "", format = "" },
  { catalogTables = [], supportedTypes = DEFAULT_TABLE_DESIGNER_TYPES, readOnly = false } = {}
) {
  const dataset = createImportDatasetFromText({ fileName, text, format });
  const columns = dataset.columns.map((column, index) =>
    createEmptyTableDesignerColumn({
      name: column.targetName,
      type: column.inferredType,
      primaryKey: column.primaryKey,
      notNull: column.primaryKey,
      importedValueIndex: index,
    })
  );

  const draft = recalculateTableDesignerDraft(
    {
      mode: "create",
      originalTableName: "",
      tableName: suggestImportedTableName(dataset.sourceFileName, catalogTables),
      columns,
      uniqueConstraints: [],
      checkConstraints: [],
      designerVersion: 2,
      schemaWarnings: [],
      fillImportedRows: dataset.rows.length > 0,
      importFormat: dataset.format,
      importSourceFileName: dataset.sourceFileName,
      importDelimiter: dataset.delimiter,
      importRows: dataset.rows,
      importedCsvFileName: dataset.sourceFileName,
      importedCsvDelimiter: dataset.delimiter,
      importedCsvRows: dataset.rows,
    },
    { catalogTables, supportedTypes, readOnly }
  );

  return {
    draft,
    columnCount: columns.length,
    delimiter: dataset.delimiter,
    format: dataset.format,
    importedRowCount: dataset.rowCount,
    dataset,
    sampleRowCount: Math.min(dataset.rowCount, 16),
  };
}

export function createTableDesignerDraftFromCsvImport(
  { fileName = "", csvText = "" },
  context = {}
) {
  return createTableDesignerDraftFromImport(
    { fileName, text: csvText, format: "csv" },
    context
  );
}

export function createNewTableDesignerDraft() {
  return {
    mode: "create",
    originalTableName: "",
    tableName: "",
    columns: [createEmptyTableDesignerColumn()],
    uniqueConstraints: [],
    checkConstraints: [],
    designerVersion: 2,
    dirty: false,
    schemaWarnings: [],
    fillImportedRows: false,
    importFormat: "",
    importSourceFileName: "",
    importDelimiter: "",
    importRows: [],
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

export function updateTableDesignerConstraintField(
  draft,
  constraintKind,
  constraintId,
  field,
  value,
  context = {}
) {
  const collectionKey = constraintKind === "check" ? "checkConstraints" : "uniqueConstraints";

  return recalculateTableDesignerDraft(
    {
      ...draft,
      [collectionKey]: (draft[collectionKey] ?? []).map((constraint) =>
        constraint.id === constraintId
          ? {
              ...constraint,
              [field]: value,
            }
          : constraint
      ),
    },
    context
  );
}

export function addTableDesignerCheckConstraint(draft, seed = {}, context = {}) {
  const nextIndex = (draft.checkConstraints ?? []).length + 1;
  const checkConstraint = {
    id: normalizeText(seed.id ?? `check:new:${createColumnId()}`),
    name: normalizeText(seed.name ?? `CHECK ${nextIndex}`),
    originalName: "",
    deleted: false,
    columns: Array.isArray(seed.columns) ? seed.columns : [],
    expression: normalizeText(seed.expression ?? ""),
    originalExpression: "",
    editable: true,
    preserved: false,
    columnId: normalizeText(seed.columnId ?? ""),
    source: normalizeText(seed.source ?? "user"),
    presetId: normalizeText(seed.presetId ?? ""),
    presetFields:
      seed.presetFields && typeof seed.presetFields === "object"
        ? Object.fromEntries(
            Object.entries(seed.presetFields).map(([key, value]) => [key, normalizeText(value)])
          )
        : {},
  };

  return recalculateTableDesignerDraft(
    {
      ...draft,
      checkConstraints: [...(draft.checkConstraints ?? []), checkConstraint],
    },
    context
  );
}

export function removeTableDesignerCheckConstraint(draft, constraintId, context = {}) {
  const targetConstraint = (draft.checkConstraints ?? []).find(
    (constraint) => constraint.id === constraintId
  );

  if (!targetConstraint) {
    return recalculateTableDesignerDraft(draft, context);
  }

  const nextCheckConstraints = targetConstraint.originalExpression
    ? (draft.checkConstraints ?? []).map((constraint) =>
        constraint.id === constraintId ? { ...constraint, deleted: true } : constraint
      )
    : (draft.checkConstraints ?? []).filter((constraint) => constraint.id !== constraintId);

  return recalculateTableDesignerDraft(
    {
      ...draft,
      checkConstraints: nextCheckConstraints,
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
