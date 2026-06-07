const {
  buildAlterTableAddColumnSql,
  buildAlterTableRenameSql,
  buildCreateTableSql,
} = require("./sql");
const { createDesignerWarning } = require("./schemaMapping");
const { normalizeIdentifierKey, normalizeSqlFragment } = require("./validation");

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

function hasMeaningfulNewDraftContent(draft) {
  return (
    Boolean(String(draft.tableName ?? "").trim()) ||
    draft.columns.some((column) =>
      !column.deleted &&
      [
        Boolean(String(column.name ?? "").trim()),
        Boolean(String(column.defaultValue ?? "").trim()),
        Boolean(String(column.referencesTable ?? "").trim()),
        Boolean(String(column.referencesColumn ?? "").trim()),
        Boolean(column.notNull),
        Boolean(column.unique),
        Boolean(column.primaryKey),
        String(column.type ?? "").trim().toUpperCase() !== "TEXT",
      ].some(Boolean)
    )
  );
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
        `Column ${column.name} uses an expression default value. SQLite requires a rebuild for that ADD COLUMN operation.`,
    };
  }

  if (
    column.referencesTable &&
    column.referencesColumn &&
    defaultValue &&
    normalizedDefault !== "NULL"
  ) {
    return {
      safe: false,
      reason:
        `Column ${column.name} adds a foreign key with a non-NULL default value. SQLite requires a table rebuild for that change.`,
    };
  }

  return {
    safe: true,
    reason: "",
  };
}

function buildRiskyChangeWarning(title, message) {
  return createDesignerWarning({
    code: "TABLE_REBUILD_REQUIRED",
    title,
    message,
    blocking: true,
  });
}

function analyzeEditDraft(draft, originalDraft) {
  const originalColumnsByName = new Map(
    originalDraft.columns.map((column) => [normalizeIdentifierKey(column.originalName || column.name), column])
  );
  const matchedOriginalNames = new Set();
  const newColumns = [];
  const warnings = [];
  const executableStatements = [];

  draft.columns.forEach((column) => {
    if (column.deleted) {
      if (normalizeIdentifierKey(column.originalName || column.name)) {
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

  originalDraft.columns.forEach((column) => {
    const key = normalizeIdentifierKey(column.originalName || column.name);
    const isExplicitlyDeleted = draft.columns.some(
      (draftColumn) =>
        draftColumn.deleted &&
        normalizeIdentifierKey(draftColumn.originalName || draftColumn.name) === key
    );

    if (!matchedOriginalNames.has(key) && !isExplicitlyDeleted) {
      warnings.push(
        buildRiskyChangeWarning(
          "Column Delete Requires Rebuild",
          `Deleting column ${column.name} requires a SQLite table rebuild.`
        )
      );
    }
  });

  const tableRenameChanged =
    normalizeIdentifierKey(draft.tableName) !== normalizeIdentifierKey(originalDraft.tableName);

  if (tableRenameChanged) {
    executableStatements.push(
      buildAlterTableRenameSql(originalDraft.tableName, draft.tableName)
    );
  }

  newColumns.forEach((column) => {
    const addColumnSafety = isAlterAddColumnSafe(column);

    if (!addColumnSafety.safe) {
      warnings.push(
        buildRiskyChangeWarning("Column Add Requires Rebuild", addColumnSafety.reason)
      );
      return;
    }

    executableStatements.push(
      buildAlterTableAddColumnSql(tableRenameChanged ? draft.tableName : originalDraft.tableName, column)
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

  const dirty = Boolean(executableStatements.length || warnings.length);

  return {
    dirty,
    executable: warnings.length === 0,
    statements: warnings.length === 0 ? executableStatements : [],
    previewStatements: executableStatements,
    warnings,
  };
}

function analyzeTableDesignerChanges({ draft, originalDraft = null }) {
  if (!originalDraft) {
    return {
      dirty: hasMeaningfulNewDraftContent(draft),
      executable: true,
      statements: [buildCreateTableSql(draft)],
      previewStatements: [buildCreateTableSql(draft)],
      warnings: [],
    };
  }

  return analyzeEditDraft(draft, originalDraft);
}

module.exports = {
  analyzeTableDesignerChanges,
};
