const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { AppError, DatabaseRequiredError } = require("../../utils/errors");
const { listSchema } = require("./introspection");

const execFileAsync = promisify(execFile);

class OverviewService {
  constructor({ connectionManager }) {
    this.connectionManager = connectionManager;
  }

  safePragmaValue(db, pragmaName) {
    const row = db.prepare(`PRAGMA ${pragmaName}`).get();
    return row ? Object.values(row)[0] : null;
  }

  getDbStatSizes(db) {
    try {
      return db
        .prepare(
          [
            "SELECT name, SUM(pgsize) AS sizeBytes",
            "FROM dbstat",
            "WHERE name NOT LIKE 'sqlite_%'",
            "GROUP BY name",
            "ORDER BY sizeBytes DESC",
          ].join(" ")
        )
        .all();
    } catch (error) {
      return null;
    }
  }

  getOverview() {
    const connection = this.connectionManager.getActiveConnection();
    const db = this.connectionManager.getActiveDatabase();
    const schema = listSchema(db);
    const pageSize = this.safePragmaValue(db, "page_size");
    const pageCount = this.safePragmaValue(db, "page_count");
    const freelistCount = this.safePragmaValue(db, "freelist_count");
    const warnings = [];

    const dbStatSizes = this.getDbStatSizes(db);

    if (!dbStatSizes) {
      warnings.push("Estimated table sizes unavailable because dbstat is not enabled.");
    }

    return {
      connection,
      file: {
        filename: connection.label,
        path: connection.path,
        sizeBytes: connection.sizeBytes,
        lastModifiedAt: connection.lastModifiedAt,
      },
      sqlite: {
        version: db.prepare("SELECT sqlite_version() AS version").get().version,
        pageSize,
        pageCount,
        freelistCount,
        journalMode: this.safePragmaValue(db, "journal_mode"),
        foreignKeys: Boolean(this.safePragmaValue(db, "foreign_keys")),
        autoVacuum: this.safePragmaValue(db, "auto_vacuum"),
        encoding: this.safePragmaValue(db, "encoding"),
        userVersion: this.safePragmaValue(db, "user_version"),
        schemaVersion: this.safePragmaValue(db, "schema_version"),
        integrityCheck: this.safePragmaValue(db, "integrity_check"),
        quickCheck: this.safePragmaValue(db, "quick_check"),
      },
      counts: {
        tables: schema.tables.length,
        views: schema.views.length,
        indexes: schema.indexes.length,
        triggers: schema.triggers.length,
      },
      topTablesByRowCount: [...schema.tables]
        .sort((left, right) => (right.rowCount ?? 0) - (left.rowCount ?? 0))
        .slice(0, 10)
        .map((table) => ({
          name: table.name,
          rowCount: table.rowCount,
          indexCount: table.indexCount,
        })),
      topTablesByEstimatedSize: dbStatSizes
        ? dbStatSizes.slice(0, 10).map((row) => ({
            name: row.name,
            sizeBytes: row.sizeBytes,
          }))
        : [],
      estimatedSizeBytes:
        typeof pageSize === "number" && typeof pageCount === "number"
          ? pageSize * pageCount
          : null,
      warnings,
    };
  }

  getStatus() {
    const active = this.connectionManager.getActiveConnection();

    return {
      connected: Boolean(active),
      activeConnection: active,
      readOnly: active?.readOnly ?? false,
    };
  }

  async revealActiveDatabaseInFinder() {
    const active = this.connectionManager.getActiveConnection();
    const targetPath = active?.path;

    if (!targetPath) {
      throw new DatabaseRequiredError();
    }

    if (!fs.existsSync(targetPath)) {
      throw new AppError("The active database file could not be found on disk.", 404, {
        code: "DATABASE_FILE_NOT_FOUND",
      });
    }

    if (process.platform === "darwin") {
      await execFileAsync("open", ["-R", targetPath]);
      return;
    }

    if (process.platform === "win32") {
      await execFileAsync("explorer.exe", ["/select,", targetPath]);
      return;
    }

    await execFileAsync("xdg-open", [path.dirname(targetPath)]);
  }
}

module.exports = {
  OverviewService,
};
