const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { version: sqliteHubVersion } = require("../../../package.json");
const {
  AppError,
  ConflictError,
  DatabaseRequiredError,
  NotFoundError,
  ReadOnlyError,
  ValidationError,
  mapSqliteError,
} = require("../../utils/errors");
const {
  ensureParentDirectory,
  getFileMetadata,
  resolvePathInsideDirectory,
  validateSqlitePath,
} = require("../../utils/fileValidation");
const { quoteIdentifier } = require("../../utils/identifier");
const {
  buildBackupDiff,
  normalizeBackupDiffSampleLimit,
} = require("./backupDiff");

const BACKUP_TYPES = new Set([
  "manual",
  "automatic",
  "pre_restore",
  "pre_migration",
  "pre_import",
  "pre_schema_change",
]);
const ACTIVE_BACKUP_STATUSES = new Set(["creating", "verifying", "restoring"]);
const ROW_COUNT_SIZE_THRESHOLD_BYTES = 20 * 1024 * 1024;

function toBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "").replaceAll(":", "-");
}

function formatDisplayDate(date = new Date()) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeBackupType(value) {
  const normalized = String(value ?? "manual").trim();
  return BACKUP_TYPES.has(normalized) ? normalized : "manual";
}

function sanitizePathSegment(value, fallback = "backup") {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function buildDefaultBackupName(type, date = new Date(), context = "") {
  const suffix = context ? ` ${context}` : "";

  if (type === "pre_restore") {
    return `Before restore${suffix}`;
  }

  if (type === "pre_import") {
    return `Before import${suffix}`;
  }

  if (type === "pre_migration") {
    return "Before migration";
  }

  if (type === "pre_schema_change") {
    return `Before schema change${suffix}`;
  }

  return `Manual backup - ${formatDisplayDate(date)}`;
}

function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function writeJsonAtomic(filePath, value) {
  ensureParentDirectory(filePath);
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function readQuickCheckResult(db) {
  const row = db.prepare("PRAGMA quick_check").get();
  const value = Object.values(row ?? {})[0];
  return String(value ?? "").trim().toLowerCase();
}

class BackupService {
  constructor({ connectionManager, appStateStore, backupRootDirectory = null }) {
    this.connectionManager = connectionManager;
    this.appStateStore = appStateStore;
    this.backupRootDirectory =
      backupRootDirectory ?? path.join(appStateStore.stateDirectory, "backups");
    this.activeOperations = new Set();
  }

  getBackupDirectory(connectionId) {
    return path.join(this.backupRootDirectory, sanitizePathSegment(connectionId, "database"));
  }

  getManifestPathForDirectory(directoryPath) {
    return path.join(directoryPath, "manifest.json");
  }

  assertBackupPathInsideRoot(filePath) {
    return resolvePathInsideDirectory(this.backupRootDirectory, filePath, "Backup path");
  }

  async withOperation(lockKey, callback) {
    if (this.activeOperations.has(lockKey)) {
      throw new ConflictError("A backup operation is already running for this target.");
    }

    this.activeOperations.add(lockKey);

    try {
      return await callback();
    } finally {
      this.activeOperations.delete(lockKey);
    }
  }

  listBackups({ connectionId = null, includeAll = false } = {}) {
    const activeConnection = this.connectionManager.getActiveConnection();
    const targetConnectionId = connectionId ?? activeConnection?.id ?? null;

    return this.appStateStore.listBackups({
      connectionId: targetConnectionId,
      includeAll,
    }).map((backup) => this.decorateBackupFileState(backup));
  }

  getBackup(backupId) {
    const backup = this.appStateStore.getBackup(backupId);

    if (!backup) {
      throw new NotFoundError(`Backup not found: ${backupId}`);
    }

    return this.decorateBackupFileState(backup);
  }

  updateBackupDetails(backupId, { name, notes } = {}) {
    const backup = this.appStateStore.updateBackupRecord(backupId, {
      name,
      notes,
    });

    this.updateManifestForBackup(backup);
    return this.decorateBackupFileState(backup);
  }

  decorateBackupFileState(backup) {
    const fileExists = Boolean(backup.path && fs.existsSync(backup.path));

    return {
      ...backup,
      fileExists,
      fileName: backup.path ? path.basename(backup.path) : "",
      directory: backup.path ? path.dirname(backup.path) : "",
    };
  }

  async createActiveBackup(options = {}) {
    const activeConnection = this.connectionManager.getActiveConnection();

    if (!activeConnection) {
      throw new DatabaseRequiredError("No active SQLite database selected for backup.");
    }

    return this.createBackupForConnection(activeConnection, options);
  }

  async createBackupForConnection(connection, options = {}) {
    if (!connection?.id) {
      throw new DatabaseRequiredError("No active SQLite database selected for backup.");
    }

    const type = normalizeBackupType(options.type);
    const createdAtDate = new Date();
    const createdAt = createdAtDate.toISOString();
    const backupName =
      String(options.name ?? "").trim() ||
      buildDefaultBackupName(type, createdAtDate, options.context);
    const sourcePath = validateSqlitePath(connection.path, { mustExist: true });
    const backupDirectory = this.getBackupDirectory(connection.id);
    const backupPath = path.join(backupDirectory, `backup-${toBackupTimestamp(createdAtDate)}.sqlite`);

    return this.withOperation(`connection:${connection.id}`, async () => {
      ensureParentDirectory(backupPath);

      const record = this.appStateStore.createBackupRecord({
        id: crypto.randomUUID(),
        connectionId: connection.id,
        name: backupName,
        notes: options.notes,
        path: backupPath,
        status: "creating",
        type,
        sourcePath,
        sourceLabel: connection.label,
        sqliteHubVersion,
        createdAt,
      });

      this.updateManifestForBackup(record);

      try {
        const sourceDb = this.connectionManager.getActiveDatabase();

        if (!sourceDb || this.connectionManager.getActiveConnection()?.id !== connection.id) {
          throw new DatabaseRequiredError("The active database changed before backup creation.");
        }

        await sourceDb.backup(backupPath);

        const sourceMetadata = this.collectSourceMetadata(sourceDb, sourcePath);
        const sizeBytes = getFileMetadata(backupPath).sizeBytes;
        const checksumSha256 = await hashFileSha256(backupPath);
        let updated = this.appStateStore.updateBackupRecord(record.id, {
          ...sourceMetadata,
          sizeBytes,
          checksumSha256,
          status: "verifying",
          errorMessage: null,
        });
        this.updateManifestForBackup(updated);

        updated = this.verifyBackupRecord(updated.id);
        this.updateManifestForBackup(updated);
        return this.decorateBackupFileState(updated);
      } catch (error) {
        const normalized = mapSqliteError(error);
        const failed = this.appStateStore.updateBackupRecord(record.id, {
          status: "failed",
          errorMessage: normalized.message,
        });
        this.updateManifestForBackup(failed);
        throw normalized;
      }
    });
  }

  collectSourceMetadata(db, sourcePath) {
    const metadata = {
      sqliteHubVersion,
      sqliteVersion: null,
      journalMode: null,
      schemaVersion: null,
      tableCount: null,
      rowCount: null,
    };

    try {
      metadata.sqliteVersion = db.prepare("SELECT sqlite_version() AS version").get()?.version ?? null;
    } catch {}

    try {
      const journalModeRow = db.prepare("PRAGMA journal_mode").get();
      metadata.journalMode = Object.values(journalModeRow ?? {})[0] ?? null;
    } catch {}

    try {
      const userVersionRow = db.prepare("PRAGMA user_version").get();
      metadata.schemaVersion = Number(Object.values(userVersionRow ?? {})[0] ?? 0);
    } catch {}

    let tableNames = [];
    try {
      tableNames = db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all()
        .map((row) => row.name);
      metadata.tableCount = tableNames.length;
    } catch {}

    try {
      const sourceSize = fs.statSync(sourcePath).size;
      if (sourceSize <= ROW_COUNT_SIZE_THRESHOLD_BYTES) {
        metadata.rowCount = tableNames.reduce((sum, tableName) => {
          const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`).get();
          return sum + Number(row?.count ?? 0);
        }, 0);
      }
    } catch {
      metadata.rowCount = null;
    }

    return metadata;
  }

  verifyBackupRecord(backupId) {
    const backup = this.getBackup(backupId);

    if (!backup.fileExists) {
      return this.appStateStore.updateBackupRecord(backup.id, {
        status: "failed",
        errorMessage: "Backup file is missing.",
      });
    }

    let db = null;

    try {
      db = new Database(backup.path, {
        readonly: true,
        fileMustExist: true,
      });
      const quickCheck = readQuickCheckResult(db);

      if (quickCheck !== "ok") {
        throw new ValidationError(`Backup verification failed: ${quickCheck}`);
      }

      return this.appStateStore.updateBackupRecord(backup.id, {
        status: "verified",
        verifiedAt: new Date().toISOString(),
        errorMessage: null,
      });
    } catch (error) {
      const normalized = mapSqliteError(error);
      return this.appStateStore.updateBackupRecord(backup.id, {
        status: "failed",
        errorMessage: normalized.message,
      });
    } finally {
      db?.close();
    }
  }

  updateManifestForBackup(backup) {
    const directoryPath = path.dirname(backup.path);
    const manifestPath = this.getManifestPathForDirectory(directoryPath);
    const backups = this.appStateStore.listBackupsByDirectory(directoryPath);
    const manifest = {
      databaseId: backup.connectionId ?? path.basename(directoryPath),
      sourcePath: backup.sourcePath,
      sourceLabel: backup.sourceLabel,
      updatedAt: new Date().toISOString(),
      backups: backups.map((entry) => ({
        id: entry.id,
        name: entry.name,
        notes: entry.notes,
        fileName: path.basename(entry.path),
        sizeBytes: entry.sizeBytes,
        type: entry.type,
        status: entry.status,
        createdAt: entry.createdAt,
        verifiedAt: entry.verifiedAt,
        checksumSha256: entry.checksumSha256,
        lastRestoredAt: entry.lastRestoredAt,
        errorMessage: entry.errorMessage,
      })),
    };

    writeJsonAtomic(manifestPath, manifest);
  }

  getDownloadInfo(backupId) {
    const backup = this.getBackup(backupId);

    if (!backup.fileExists) {
      throw new NotFoundError("Backup file is missing.");
    }

    return {
      path: backup.path,
      filename: `${sanitizePathSegment(backup.name, "backup")}_${toBackupTimestamp(
        new Date(backup.createdAt ?? Date.now())
      )}.sqlite`,
    };
  }

  backupBelongsToConnection(backup, connection) {
    if (!backup || !connection) {
      return false;
    }

    if (backup.connectionId && backup.connectionId === connection.id) {
      return true;
    }

    if (backup.sourcePath && connection.path) {
      return path.resolve(backup.sourcePath) === path.resolve(connection.path);
    }

    return false;
  }

  diffBackupWithCurrent(backupId, { sampleLimit } = {}) {
    const normalizedSampleLimit = normalizeBackupDiffSampleLimit(sampleLimit);
    const activeConnection = this.connectionManager.getActiveConnection();

    if (!activeConnection) {
      throw new DatabaseRequiredError("No active SQLite database selected for backup comparison.");
    }

    if (this.activeOperations.size > 0) {
      throw new ConflictError("A backup operation is already running.");
    }

    const backup = this.getBackup(backupId);

    if (backup.status !== "verified") {
      throw new ValidationError("Only verified backups can be compared.");
    }

    if (!backup.fileExists) {
      throw new NotFoundError("Backup file is missing.");
    }

    if (!this.backupBelongsToConnection(backup, activeConnection)) {
      throw new ValidationError("Backup does not belong to the active database.");
    }

    let backupDb = null;

    try {
      backupDb = new Database(backup.path, {
        readonly: true,
        fileMustExist: true,
      });

      const quickCheck = readQuickCheckResult(backupDb);

      if (quickCheck !== "ok") {
        throw new ValidationError(`Backup verification failed: ${quickCheck}`);
      }

      return buildBackupDiff({
        backupDb,
        currentDb: this.connectionManager.getActiveDatabase(),
        backup,
        currentConnection: activeConnection,
        comparedAt: new Date(),
        sampleLimit: normalizedSampleLimit,
      });
    } catch (error) {
      throw mapSqliteError(error);
    } finally {
      backupDb?.close();
    }
  }

  deleteBackup(backupId) {
    const backup = this.getBackup(backupId);

    if (ACTIVE_BACKUP_STATUSES.has(backup.status)) {
      throw new ConflictError("Backup is currently busy and cannot be deleted.");
    }

    if (backup.fileExists) {
      fs.rmSync(backup.path, { force: false });
    }

    const deleted = this.appStateStore.deleteBackupRecord(backup.id);
    this.updateManifestAfterDelete(deleted);
    this.removeEmptyBackupDirectory(path.dirname(deleted.path));
    return deleted;
  }

  updateManifestAfterDelete(deletedBackup) {
    const directoryPath = path.dirname(deletedBackup.path);
    const remaining = this.appStateStore.listBackupsByDirectory(directoryPath);

    if (!remaining.length) {
      const manifestPath = this.getManifestPathForDirectory(directoryPath);
      if (fs.existsSync(manifestPath)) {
        fs.rmSync(manifestPath, { force: true });
      }
      return;
    }

    this.updateManifestForBackup(remaining[0]);
  }

  removeEmptyBackupDirectory(directoryPath) {
    try {
      if (fs.existsSync(directoryPath) && !fs.readdirSync(directoryPath).length) {
        fs.rmdirSync(directoryPath);
      }
    } catch {}
  }

  restoreBackup(backupId) {
    const activeConnection = this.connectionManager.getActiveConnection();

    if (!activeConnection) {
      throw new DatabaseRequiredError("No active SQLite database selected for restore.");
    }

    if (activeConnection.readOnly) {
      throw new ReadOnlyError("Cannot restore into a read-only database.");
    }

    const backup = this.getBackup(backupId);

    if (backup.status !== "verified") {
      throw new ValidationError("Only verified backups can be restored.");
    }

    if (!backup.fileExists) {
      throw new NotFoundError("Backup file is missing.");
    }

    if (backup.connectionId && backup.connectionId !== activeConnection.id) {
      throw new ValidationError("Backup does not belong to the active database.");
    }

    return this.withOperation(`restore:${backup.id}`, async () => {
      const verified = this.verifyBackupRecord(backup.id);
      this.updateManifestForBackup(verified);

      if (verified.status !== "verified") {
        throw new ValidationError(verified.errorMessage || "Backup verification failed.");
      }

      const targetPath = activeConnection.path;
      const rollbackPath = `${targetPath}.sqlite-hub-restore-${Date.now()}.bak`;
      const temporaryRestorePath = `${targetPath}.sqlite-hub-restore-${Date.now()}.sqlite`;
      let restored = null;

      try {
        fs.copyFileSync(backup.path, temporaryRestorePath, fs.constants.COPYFILE_EXCL);
        validateSqlitePath(temporaryRestorePath, { mustExist: true });

        this.connectionManager.closeCurrent();
        fs.renameSync(targetPath, rollbackPath);
        fs.renameSync(temporaryRestorePath, targetPath);

        this.connectionManager.openConnection({
          filePath: targetPath,
          label: activeConnection.label,
          id: activeConnection.id,
          makeActive: true,
          readOnly: false,
          logoPath: activeConnection.logoPath ?? null,
        });

        const db = this.connectionManager.getActiveDatabase();
        const quickCheck = readQuickCheckResult(db);

        if (quickCheck !== "ok") {
          throw new ValidationError(`Restored database verification failed: ${quickCheck}`);
        }

        fs.rmSync(rollbackPath, { force: true });
        restored = this.appStateStore.updateBackupRecord(backup.id, {
          status: "verified",
          lastRestoredAt: new Date().toISOString(),
          errorMessage: null,
        });
        this.updateManifestForBackup(restored);
        return this.decorateBackupFileState(restored);
      } catch (error) {
        try {
          if (fs.existsSync(temporaryRestorePath)) {
            fs.rmSync(temporaryRestorePath, { force: true });
          }

          if (fs.existsSync(rollbackPath)) {
            if (fs.existsSync(targetPath)) {
              fs.rmSync(targetPath, { force: true });
            }
            fs.renameSync(rollbackPath, targetPath);
          }

          this.connectionManager.openConnection({
            filePath: targetPath,
            label: activeConnection.label,
            id: activeConnection.id,
            makeActive: true,
            readOnly: false,
            logoPath: activeConnection.logoPath ?? null,
          });
        } catch (reopenError) {
          console.warn(`Failed to reopen database after restore failure: ${reopenError.message}`);
        }

        throw mapSqliteError(error);
      }
    });
  }
}

module.exports = {
  BACKUP_TYPES,
  BackupService,
  buildDefaultBackupName,
  sanitizePathSegment,
  toBackupTimestamp,
};
