const fs = require("node:fs");
const path = require("node:path");
const { DatabaseRequiredError } = require("../../utils/errors");
const {
  SQLITE_EXTENSIONS,
  ensureParentDirectory,
  getFileMetadata,
  validateSqlitePath,
} = require("../../utils/fileValidation");

function padTimestampPart(value) {
  return String(value).padStart(2, "0");
}

function formatBackupTimestamp(date) {
  return [
    date.getFullYear(),
    padTimestampPart(date.getMonth() + 1),
    padTimestampPart(date.getDate()),
  ].join("-")
    + "_"
    + [
      padTimestampPart(date.getHours()),
      padTimestampPart(date.getMinutes()),
      padTimestampPart(date.getSeconds()),
    ].join("-");
}

function sanitizeBackupBaseName(value) {
  const normalized = String(value ?? "").trim().replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_");
  return normalized || "database";
}

function normalizeBackupLabelBase(value, fallback) {
  const normalized = String(value ?? "").trim() || String(fallback ?? "").trim() || "database";
  const extension = path.extname(normalized).toLowerCase();

  if (SQLITE_EXTENSIONS.has(extension)) {
    return normalized.slice(0, -extension.length) || "database";
  }

  return normalized;
}

class BackupService {
  constructor({ connectionManager }) {
    this.connectionManager = connectionManager;
  }

  createActiveBackup() {
    const activeConnection = this.connectionManager.getActiveConnection();

    if (!activeConnection) {
      throw new DatabaseRequiredError("No active SQLite database selected for backup.");
    }

    const sourcePath = validateSqlitePath(activeConnection.path, { mustExist: true });
    const { backupPath, connectionLabel } = this.buildBackupPath(sourcePath, activeConnection.label);

    ensureParentDirectory(backupPath);
    fs.copyFileSync(sourcePath, backupPath, fs.constants.COPYFILE_EXCL);

    const backupConnection = this.connectionManager.rememberConnection({
      filePath: backupPath,
      label: connectionLabel,
      makeActive: false,
    });
    const metadata = getFileMetadata(backupPath);

    return {
      sourcePath,
      backupPath,
      directory: path.dirname(backupPath),
      fileName: path.basename(backupPath),
      createdAt: new Date().toISOString(),
      sizeBytes: metadata.sizeBytes,
      connection: backupConnection,
    };
  }

  buildBackupPath(sourcePath, sourceLabel) {
    const parsedSource = path.parse(sourcePath);
    const backupDirectory = path.join(parsedSource.dir, "backups");
    const extension = parsedSource.ext || ".sqlite";
    const displayBaseName = normalizeBackupLabelBase(sourceLabel, parsedSource.name);
    const fileBaseName = sanitizeBackupBaseName(displayBaseName);
    const timestamp = formatBackupTimestamp(new Date());
    let attempt = 1;

    while (true) {
      const suffix = attempt === 1 ? "" : `_${String(attempt).padStart(2, "0")}`;
      const fileStem = `${fileBaseName}_${timestamp}${suffix}`;
      const candidate = path.join(
        backupDirectory,
        `${fileStem}${extension}`
      );

      if (!fs.existsSync(candidate)) {
        return {
          backupPath: candidate,
          connectionLabel: `${displayBaseName}_${timestamp}${suffix}`,
        };
      }

      attempt += 1;
    }
  }
}

module.exports = {
  BackupService,
};
