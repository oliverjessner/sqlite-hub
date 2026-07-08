const { mapSqliteError, ValidationError } = require("../../utils/errors");
const { quoteIdentifier } = require("../../utils/identifier");
const { getTableDetail } = require("./introspection");
const { analyzeTableDesignerChanges } = require("./tableDesigner/changeAnalysis");
const {
  SUPPORTED_TABLE_DESIGNER_TYPES,
  buildTableDesignerDraft,
  listDesignerTables,
  normalizeDesignerType,
} = require("./tableDesigner/schemaMapping");
const {
  normalizeDraftPayload,
  validateTableDesignerDraft,
} = require("./tableDesigner/validation");
const { buildCreateTableSql, buildInsertRowsSql } = require("./tableDesigner/sql");

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

function coerceImportedCellValue(column, value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue =
    typeof value === "object" ? JSON.stringify(value) : value;
  const type = normalizeDesignerType(column.type);
  const textValue = String(normalizedValue ?? "");
  const trimmedValue = textValue.trim();

  if (!trimmedValue) {
    return ["TEXT", "DATE", "DATETIME"].includes(type) ? "" : null;
  }

  if (typeof normalizedValue === "boolean") {
    return normalizedValue ? 1 : 0;
  }

  if (type === "BOOLEAN") {
    const normalized = trimmedValue.toLowerCase();

    if (["true", "yes", "1"].includes(normalized)) {
      return 1;
    }

    if (["false", "no", "0"].includes(normalized)) {
      return 0;
    }
  }

  if (type === "INTEGER" && /^-?\d+$/.test(trimmedValue)) {
    return Number(trimmedValue);
  }

  if (
    ["REAL", "NUMERIC"].includes(type) &&
    /^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmedValue)
  ) {
    return Number(trimmedValue);
  }

  return textValue;
}

function normalizeCheckExpressionSql(expression) {
  const normalized = String(expression ?? "").trim();

  if (/^CHECK\s*\(/i.test(normalized)) {
    return normalized;
  }

  return `CHECK (${normalized})`;
}

function assertSafeCheckExpressionFragment(expression) {
  const normalized = String(expression ?? "").trim();

  if (
    normalized.includes("\0") ||
    normalized.includes(";") ||
    normalized.includes("--") ||
    normalized.includes("/*") ||
    normalized.includes("*/")
  ) {
    throw new ValidationError(
      "CHECK expression must be a single SQL fragment without statement separators or comments.",
      {
        code: "CHECK_EXPRESSION_INVALID_FRAGMENT",
      }
    );
  }
}

class TableDesignerService {
  constructor({ connectionManager }) {
    this.connectionManager = connectionManager;
  }

  getOverview() {
    const db = this.connectionManager.getActiveDatabase();

    return {
      tables: listDesignerTables(db),
      supportedTypes: SUPPORTED_TABLE_DESIGNER_TYPES,
    };
  }

  getTableDraft(tableName) {
    const db = this.connectionManager.getActiveDatabase();
    const tableDetail = getTableDetail(db, tableName, { includeRowCount: false });

    return {
      draft: buildTableDesignerDraft(tableDetail),
      supportedTypes: SUPPORTED_TABLE_DESIGNER_TYPES,
    };
  }

  saveDraft(payload = {}) {
    this.connectionManager.assertWritable();

    const db = this.connectionManager.getActiveDatabase();
    const draft = normalizeDraftPayload(payload.draft ?? payload);
    const catalogTables = listDesignerTables(db);
    const originalDraft =
      draft.mode === "edit"
        ? buildTableDesignerDraft(
            getTableDetail(db, draft.originalTableName, { includeRowCount: false })
          )
        : null;

    validateTableDesignerDraft(draft, {
      catalogTables,
      originalDraft,
    });

    const analysis = analyzeTableDesignerChanges({ draft, originalDraft });

    if (!analysis.dirty) {
      return {
        savedTableName: draft.mode === "edit" ? draft.originalTableName : draft.tableName,
        executedSql: [],
        draft: originalDraft ?? draft,
        tables: catalogTables,
      };
    }

    if (!analysis.executable) {
      throw new ValidationError(
        "This schema change set would require a SQLite table rebuild. Table Designer v2 keeps the SQL preview available but will not execute those changes automatically.",
        {
          code: "TABLE_DESIGNER_REBUILD_REQUIRED",
          warnings: analysis.warnings,
        }
      );
    }

    const executeStatements = db.transaction((statements) => {
      statements.forEach((statement) => {
        db.exec(statement);
      });
    });

    const executeCreateWithImport = db.transaction((nextDraft) => {
      db.exec(buildCreateTableSql(nextDraft));

      const importRows = getImportedRows(nextDraft);

      if (!nextDraft.fillImportedRows || !importRows.length) {
        return;
      }

      const importedColumns = getImportedFillColumns(nextDraft);

      if (!importedColumns.length) {
        return;
      }

      const insertStatement = db.prepare(
        buildInsertRowsSql(
          nextDraft.tableName,
          importedColumns.map((column) => column.name)
        )
      );

      importRows.forEach((row) => {
        insertStatement.run(
          importedColumns.map((column) =>
            coerceImportedCellValue(column, row[column.importedValueIndex])
          )
        );
      });
    });

    try {
      if (draft.mode === "create") {
        executeCreateWithImport(draft);
      } else {
        executeStatements(analysis.statements);
      }
    } catch (error) {
      throw mapSqliteError(error);
    }

    const savedTableName = draft.tableName;
    const nextDraft = buildTableDesignerDraft(
      getTableDetail(db, savedTableName, { includeRowCount: false })
    );

    return {
      savedTableName,
      executedSql: analysis.statements,
      draft: nextDraft,
      tables: listDesignerTables(db),
    };
  }

  validateCheckExpression(payload = {}) {
    const db = this.connectionManager.getActiveDatabase();
    const draft = normalizeDraftPayload(payload.draft ?? {});
    const expression = String(payload.expression ?? "").trim();

    if (!expression) {
      throw new ValidationError("CHECK expression is required.", {
        code: "CHECK_EXPRESSION_REQUIRED",
      });
    }

    assertSafeCheckExpressionFragment(expression);

    const columns = draft.columns.filter((column) => !column.deleted && column.name);

    if (!columns.length) {
      throw new ValidationError("At least one named column is required to validate a CHECK expression.", {
        code: "CHECK_VALIDATION_COLUMNS_REQUIRED",
      });
    }

    const tempTableName = `__sqlite_hub_check_validation_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    const tempDraft = {
      ...draft,
      tableName: tempTableName,
      columns,
      checkConstraints: [
        {
          id: "check:validation",
          expression,
        },
      ],
    };
    const createSql = buildCreateTableSql(tempDraft).replace(/^CREATE TABLE\s+/i, "CREATE TEMP TABLE ");
    const dropSql = `DROP TABLE IF EXISTS ${quoteIdentifier(tempTableName)};`;

    try {
      db.exec(dropSql);
      db.exec(createSql);
      db.exec(dropSql);
      return {
        valid: true,
        generatedSql: normalizeCheckExpressionSql(expression),
      };
    } catch (error) {
      try {
        db.exec(dropSql);
      } catch {
        // Ignore cleanup failures; the validation error below is the useful signal.
      }

      throw mapSqliteError(error);
    }
  }
}

module.exports = {
  TableDesignerService,
};
