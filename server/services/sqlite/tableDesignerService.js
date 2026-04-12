const { mapSqliteError, ValidationError } = require("../../utils/errors");
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

function coerceImportedCellValue(column, value) {
  const textValue = String(value ?? "");
  const trimmedValue = textValue.trim();
  const type = normalizeDesignerType(column.type);

  if (!trimmedValue) {
    return ["TEXT", "DATE", "DATETIME"].includes(type) ? "" : null;
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
        "This schema change set would require a SQLite table rebuild. Table Designer v1 keeps the SQL preview available but will not execute those changes automatically.",
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

      if (!nextDraft.fillImportedRows || !nextDraft.importedCsvRows.length) {
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

      nextDraft.importedCsvRows.forEach((row) => {
        insertStatement.run(
          importedColumns.map((column) =>
            coerceImportedCellValue(column, row[column.importedValueIndex] ?? "")
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
}

module.exports = {
  TableDesignerService,
};
