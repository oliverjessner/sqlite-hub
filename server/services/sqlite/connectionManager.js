const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const {
  ConflictError,
  DatabaseRequiredError,
  NotFoundError,
  ReadOnlyError,
  ValidationError,
  mapSqliteError,
} = require("../../utils/errors");
const {
  ensureFileDoesNotExist,
  ensureParentDirectory,
  getFileMetadata,
  isWritable,
  resolveUserPath,
  validateSqlitePath,
} = require("../../utils/fileValidation");

class ConnectionManager {
  constructor({ appStateStore }) {
    this.appStateStore = appStateStore;
    this.current = null;
  }

  initialize() {
    const activeId = this.appStateStore.getActiveConnectionId();

    if (!activeId) {
      return null;
    }

    const recent = this.appStateStore
      .getRecentConnections()
      .find((connection) => connection.id === activeId);

    if (!recent) {
      return null;
    }

    try {
      return this.openConnection({
        filePath: recent.path,
        label: recent.label,
        id: recent.id,
        makeActive: true,
      });
    } catch (error) {
      this.appStateStore.setActiveConnectionId(null);
      return null;
    }
  }

  buildConnectionRecord(filePath, options = {}) {
    const metadata = getFileMetadata(filePath);

    return {
      id:
        options.id ??
        `conn_${crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 16)}`,
      label: options.label?.trim() || path.basename(filePath),
      path: filePath,
      lastOpenedAt: new Date().toISOString(),
      lastModifiedAt: metadata.lastModifiedAt,
      sizeBytes: metadata.sizeBytes,
      readOnly: options.readOnly ?? !isWritable(filePath),
    };
  }

  openRawDatabase(filePath, options = {}) {
    const db = new Database(filePath, {
      readonly: Boolean(options.readOnly),
      fileMustExist: Boolean(options.fileMustExist),
      timeout: this.appStateStore.getSettings().busyTimeoutMs,
    });

    try {
      db.pragma(`busy_timeout = ${this.appStateStore.getSettings().busyTimeoutMs}`);
      db.pragma("foreign_keys");
      db.prepare("SELECT sqlite_version() AS version").get();
      return db;
    } catch (error) {
      db.close();
      throw mapSqliteError(error);
    }
  }

  closeCurrent() {
    if (this.current?.db) {
      this.current.db.close();
    }

    this.current = null;
  }

  openConnection({ filePath, label, id, makeActive = true, readOnly = false }) {
    const resolvedPath = validateSqlitePath(filePath, { mustExist: true });
    const db = this.openRawDatabase(resolvedPath, {
      fileMustExist: true,
      readOnly,
    });

    this.closeCurrent();

    const connection = this.buildConnectionRecord(resolvedPath, {
      id,
      label,
      readOnly,
    });

    this.current = {
      ...connection,
      db,
    };

    if (makeActive) {
      this.appStateStore.upsertRecentConnection(connection);
    }

    return this.getActiveConnection();
  }

  createConnection({ filePath, label }) {
    const resolvedPath = resolveUserPath(filePath);
    ensureFileDoesNotExist(resolvedPath, "SQLite database");
    ensureParentDirectory(resolvedPath);

    const extension = path.extname(resolvedPath).toLowerCase();

    if (![".db", ".sqlite", ".sqlite3"].includes(extension)) {
      throw new ValidationError(
        "SQLite database must use one of: .db, .sqlite, .sqlite3"
      );
    }

    const db = this.openRawDatabase(resolvedPath, {
      fileMustExist: false,
      readOnly: false,
    });

    try {
      db.exec("VACUUM;");
    } catch (error) {
      db.close();
      throw mapSqliteError(error);
    }

    db.close();

    return this.openConnection({
      filePath: resolvedPath,
      label,
      makeActive: true,
      readOnly: false,
    });
  }

  selectActiveConnection(id) {
    const recent = this.appStateStore
      .getRecentConnections()
      .find((connection) => connection.id === id);

    if (!recent) {
      throw new NotFoundError(`Recent connection not found: ${id}`);
    }

    return this.openConnection({
      filePath: recent.path,
      label: recent.label,
      id: recent.id,
      makeActive: true,
      readOnly: recent.readOnly,
    });
  }

  removeRecentConnection(id) {
    const state = this.appStateStore.removeRecentConnection(id);

    if (this.current?.id === id) {
      this.closeCurrent();
    }

    return state.recentConnections;
  }

  updateRecentConnection(id, { filePath, label, readOnly = false }) {
    const recentConnections = this.appStateStore.getRecentConnections();
    const existing = recentConnections.find((connection) => connection.id === id);

    if (!existing) {
      throw new NotFoundError(`Recent connection not found: ${id}`);
    }

    const resolvedPath = validateSqlitePath(filePath, { mustExist: true });
    const duplicateConnection = recentConnections.find(
      (connection) => connection.id !== id && connection.path === resolvedPath
    );

    if (duplicateConnection) {
      throw new ConflictError(`A saved connection already targets: ${resolvedPath}`);
    }

    const normalizedLabel = label?.trim() || path.basename(resolvedPath);
    const normalizedReadOnly = Boolean(readOnly);

    if (this.current?.id === id) {
      return this.openConnection({
        filePath: resolvedPath,
        label: normalizedLabel,
        id,
        makeActive: true,
        readOnly: normalizedReadOnly,
      });
    }

    const db = this.openRawDatabase(resolvedPath, {
      fileMustExist: true,
      readOnly: normalizedReadOnly,
    });

    db.close();

    const metadata = getFileMetadata(resolvedPath);
    const nextConnection = {
      ...existing,
      label: normalizedLabel,
      path: resolvedPath,
      lastModifiedAt: metadata.lastModifiedAt,
      sizeBytes: metadata.sizeBytes,
      readOnly: normalizedReadOnly,
    };

    this.appStateStore.updateRecentConnection(id, () => nextConnection);

    return {
      ...nextConnection,
      isActive: false,
    };
  }

  getActiveConnection() {
    if (!this.current) {
      return null;
    }

    const { db, ...connection } = this.current;
    return {
      ...connection,
      isActive: true,
    };
  }

  getActiveDatabase() {
    if (!this.current?.db) {
      throw new DatabaseRequiredError();
    }

    return this.current.db;
  }

  assertWritable() {
    const connection = this.getActiveConnection();

    if (!connection) {
      throw new DatabaseRequiredError();
    }

    if (connection.readOnly) {
      throw new ReadOnlyError(
        `Database is opened in read-only mode: ${connection.path}`
      );
    }

    return connection;
  }

  listRecentConnections() {
    const activeId = this.current?.id ?? this.appStateStore.getActiveConnectionId();

    return this.appStateStore.getRecentConnections().map((connection) => ({
      ...connection,
      isActive: connection.id === activeId,
    }));
  }

  getStatus() {
    const active = this.getActiveConnection();

    if (!active) {
      return {
        connected: false,
        activeConnection: null,
      };
    }

    return {
      connected: true,
      activeConnection: active,
    };
  }
}

module.exports = {
  ConnectionManager,
};
