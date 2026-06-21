const fs = require("node:fs");
const { ReadOnlyError, ValidationError, mapSqliteError } = require("../../utils/errors");
const { validateSqlDumpPath } = require("../../utils/fileValidation");
const { splitSqlStatements } = require("./sqlExecutor");

const LARGE_IMPORT_ROW_THRESHOLD = 1000;
const LARGE_IMPORT_FILE_SIZE_THRESHOLD = 5 * 1024 * 1024;

class ImportService {
  constructor({ connectionManager }) {
    this.connectionManager = connectionManager;
  }

  containsExplicitTransaction(sql) {
    return /\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(sql);
  }

  inspectSqlImport({ sqlFilePath }) {
    const dumpPath = validateSqlDumpPath(sqlFilePath);
    const stat = fs.statSync(dumpPath);
    const sql = fs.readFileSync(dumpPath, "utf8");
    const statementCount = splitSqlStatements(sql).length;

    return {
      sourceDumpPath: dumpPath,
      sizeBytes: stat.size,
      statementCount,
      requiresSafetyBackup:
        stat.size > LARGE_IMPORT_FILE_SIZE_THRESHOLD ||
        statementCount > LARGE_IMPORT_ROW_THRESHOLD,
      thresholds: {
        rowCount: LARGE_IMPORT_ROW_THRESHOLD,
        sizeBytes: LARGE_IMPORT_FILE_SIZE_THRESHOLD,
      },
    };
  }

  importSql({
    sqlFilePath,
    targetPath,
    targetConnectionId,
    createNew = false,
    label,
  }) {
    const dumpPath = validateSqlDumpPath(sqlFilePath);
    const sql = fs.readFileSync(dumpPath, "utf8");
    let createdNewDatabase = false;

    if (!sql.trim()) {
      throw new ValidationError("SQL dump is empty.");
    }

    let activeConnection = null;

    if (createNew) {
      if (!targetPath) {
        throw new ValidationError("targetPath is required when createNew is true.");
      }

      activeConnection = this.connectionManager.createConnection({
        filePath: targetPath,
        label,
      });
      createdNewDatabase = true;
    } else if (targetConnectionId) {
      activeConnection = this.connectionManager.selectActiveConnection(targetConnectionId);
    } else if (targetPath) {
      activeConnection = this.connectionManager.openConnection({
        filePath: targetPath,
        label,
        makeActive: true,
      });
    } else {
      activeConnection = this.connectionManager.getActiveConnection();
    }

    if (!activeConnection) {
      throw new ValidationError(
        "An active SQLite database or explicit target is required for import."
      );
    }

    if (activeConnection.readOnly) {
      throw new ReadOnlyError(
        `Cannot import SQL into a read-only database: ${activeConnection.path}`
      );
    }

    const db = this.connectionManager.getActiveDatabase();
    const warnings = [];
    const startedAt = Date.now();
    const statementCount = splitSqlStatements(sql).length;

    try {
      if (this.containsExplicitTransaction(sql)) {
        warnings.push(
          "SQL dump contains explicit transaction control. Import executed without an additional wrapper transaction."
        );
        db.exec(sql);
      } else {
        db.exec("BEGIN");
        try {
          db.exec(sql);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
    } catch (error) {
      if (createdNewDatabase) {
        try {
          this.connectionManager.closeCurrent();
          fs.rmSync(activeConnection.path, { force: true });
        } catch (cleanupError) {
          // Keep original SQLite error surface.
        }
      }
      throw mapSqliteError(error);
    }

    return {
      importedInto: activeConnection,
      sourceDumpPath: dumpPath,
      statementCount,
      timingMs: Date.now() - startedAt,
      warnings,
    };
  }
}

module.exports = {
  LARGE_IMPORT_FILE_SIZE_THRESHOLD,
  LARGE_IMPORT_ROW_THRESHOLD,
  ImportService,
};
