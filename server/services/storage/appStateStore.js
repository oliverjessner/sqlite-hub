const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const DEFAULT_STATE = {
  recentConnections: [],
  activeConnectionId: null,
  sqlHistory: [],
  settings: {
    defaultPageSize: 50,
    maxPageSize: 200,
    maxRecentConnections: 12,
    maxSqlHistory: 100,
    busyTimeoutMs: 5000,
    csvDelimiter: ",",
  },
};

class AppStateStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.legacyFilePath = options.legacyFilePath ?? null;
    this.legacyDatabasePaths = Array.isArray(options.legacyDatabasePaths)
      ? options.legacyDatabasePaths
      : [];
    this.isFreshDatabase = !fs.existsSync(filePath);

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    this.db = new Database(this.filePath);
    this.configureDatabase();
    this.ensureSchema();
    this.seedDefaultSettings();

    const importedLegacyDatabase = this.importFirstLegacyDatabase();

    if (!importedLegacyDatabase && this.shouldImportLegacyState()) {
      this.tryImportLegacyState();
    }
  }

  configureDatabase() {
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
  }

  ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recent_connections (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        path TEXT NOT NULL,
        lastOpenedAt TEXT NOT NULL,
        lastModifiedAt TEXT,
        sizeBytes INTEGER,
        readOnly INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sql_history (
        id TEXT PRIMARY KEY,
        connectionId TEXT,
        connectionLabel TEXT,
        sql TEXT NOT NULL,
        statementCount INTEGER NOT NULL DEFAULT 0,
        resultKind TEXT,
        affectedRowCount INTEGER NOT NULL DEFAULT 0,
        rowCount INTEGER NOT NULL DEFAULT 0,
        timingMs INTEGER NOT NULL DEFAULT 0,
        executedAt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_recent_connections_last_opened
      ON recent_connections(lastOpenedAt DESC, id ASC);

      CREATE INDEX IF NOT EXISTS idx_sql_history_executed_at
      ON sql_history(executedAt DESC, id ASC);
    `);
  }

  seedDefaultSettings() {
    const insertSetting = this.db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO NOTHING
    `);

    for (const [key, value] of Object.entries(DEFAULT_STATE.settings)) {
      insertSetting.run(key, JSON.stringify(value));
    }
  }

  shouldImportLegacyState() {
    if (!this.isFreshDatabase) {
      return false;
    }

    if (!this.legacyFilePath || this.legacyFilePath === this.filePath) {
      return false;
    }

    return fs.existsSync(this.legacyFilePath);
  }

  readLegacyState() {
    const raw = fs.readFileSync(this.legacyFilePath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      ...DEFAULT_STATE,
      ...parsed,
      settings: {
        ...DEFAULT_STATE.settings,
        ...(parsed.settings ?? {}),
      },
    };
  }

  getExistingLegacyDatabasePaths() {
    return this.legacyDatabasePaths
      .filter(Boolean)
      .map((legacyPath) => path.resolve(legacyPath))
      .filter(
        (legacyPath, index, legacyPaths) =>
          legacyPath !== path.resolve(this.filePath) &&
          legacyPaths.indexOf(legacyPath) === index &&
          fs.existsSync(legacyPath)
      );
  }

  readLegacyDatabase(legacyDatabasePath) {
    const legacyDb = new Database(legacyDatabasePath, {
      readonly: true,
      fileMustExist: true,
    });

    try {
      legacyDb.pragma("query_only = ON");

      const tables = new Set(
        legacyDb
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => row.name)
      );

      return {
        settings: tables.has("settings")
          ? Object.fromEntries(
              legacyDb
                .prepare("SELECT key, value FROM settings")
                .all()
                .map((row) => [row.key, row.value])
            )
          : {},
        recentConnections: tables.has("recent_connections")
          ? legacyDb
              .prepare(`
                SELECT
                  id,
                  label,
                  path,
                  lastOpenedAt,
                  lastModifiedAt,
                  sizeBytes,
                  readOnly
                FROM recent_connections
                ORDER BY lastOpenedAt DESC, id ASC
              `)
              .all()
          : [],
        sqlHistory: tables.has("sql_history")
          ? legacyDb
              .prepare(`
                SELECT
                  id,
                  connectionId,
                  connectionLabel,
                  sql,
                  statementCount,
                  resultKind,
                  affectedRowCount,
                  rowCount,
                  timingMs,
                  executedAt
                FROM sql_history
                ORDER BY executedAt DESC, id ASC
              `)
              .all()
          : [],
        activeConnectionId: tables.has("app_meta")
          ? legacyDb
              .prepare("SELECT value FROM app_meta WHERE key = ?")
              .get("activeConnectionId")?.value ?? null
          : null,
      };
    } finally {
      legacyDb.close();
    }
  }

  importStateSnapshot(legacyState, sourcePath) {
    const insertSetting = this.db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const insertConnection = this.db.prepare(`
      INSERT INTO recent_connections (
        id,
        label,
        path,
        lastOpenedAt,
        lastModifiedAt,
        sizeBytes,
        readOnly
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        path = excluded.path,
        lastOpenedAt = excluded.lastOpenedAt,
        lastModifiedAt = excluded.lastModifiedAt,
        sizeBytes = excluded.sizeBytes,
        readOnly = excluded.readOnly
    `);
    const insertHistory = this.db.prepare(`
      INSERT INTO sql_history (
        id,
        connectionId,
        connectionLabel,
        sql,
        statementCount,
        resultKind,
        affectedRowCount,
        rowCount,
        timingMs,
        executedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        connectionId = excluded.connectionId,
        connectionLabel = excluded.connectionLabel,
        sql = excluded.sql,
        statementCount = excluded.statementCount,
        resultKind = excluded.resultKind,
        affectedRowCount = excluded.affectedRowCount,
        rowCount = excluded.rowCount,
        timingMs = excluded.timingMs,
        executedAt = excluded.executedAt
    `);

    this.db.transaction(() => {
      for (const [key, value] of Object.entries(legacyState.settings ?? {})) {
        const normalizedValue =
          typeof value === "string" ? this.parseStoredValue(value) : value;

        insertSetting.run(key, JSON.stringify(normalizedValue));
      }

      for (const connection of legacyState.recentConnections ?? []) {
        insertConnection.run(
          connection.id,
          connection.label ?? path.basename(connection.path ?? connection.id),
          connection.path ?? "",
          connection.lastOpenedAt ?? new Date().toISOString(),
          connection.lastModifiedAt ?? null,
          connection.sizeBytes ?? null,
          connection.readOnly ? 1 : 0
        );
      }

      for (const entry of legacyState.sqlHistory ?? []) {
        insertHistory.run(
          entry.id,
          entry.connectionId ?? null,
          entry.connectionLabel ?? null,
          entry.sql ?? "",
          Number(entry.statementCount ?? 0),
          entry.resultKind ?? null,
          Number(entry.affectedRowCount ?? 0),
          Number(entry.rowCount ?? 0),
          Number(entry.timingMs ?? 0),
          entry.executedAt ?? new Date().toISOString()
        );
      }

      this.setMetaValue("activeConnectionId", legacyState.activeConnectionId ?? null);
      this.setMetaValue(
        "legacyImportSource",
        path.relative(path.dirname(this.filePath), sourcePath)
      );
    })();
  }

  importFirstLegacyDatabase() {
    if (!this.isFreshDatabase) {
      return false;
    }

    for (const legacyDatabasePath of this.getExistingLegacyDatabasePaths()) {
      try {
        this.importStateSnapshot(
          this.readLegacyDatabase(legacyDatabasePath),
          legacyDatabasePath
        );
        return true;
      } catch (error) {
        console.warn(
          `Could not import legacy app state database from ${legacyDatabasePath}: ${error.message}`
        );
      }
    }

    return false;
  }

  tryImportLegacyState() {
    try {
      this.importStateSnapshot(this.readLegacyState(), this.legacyFilePath);
    } catch (error) {
      console.warn(
        `Could not import legacy app state from ${this.legacyFilePath}: ${error.message}`
      );
    }
  }

  parseStoredValue(value) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  getMetaValue(key) {
    const row = this.db
      .prepare("SELECT value FROM app_meta WHERE key = ?")
      .get(key);

    return row ? row.value : null;
  }

  setMetaValue(key, value) {
    if (value === null || value === undefined || value === "") {
      this.db.prepare("DELETE FROM app_meta WHERE key = ?").run(key);
      return;
    }

    this.db
      .prepare(`
        INSERT INTO app_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `)
      .run(key, String(value));
  }

  trimRecentConnections() {
    const maxRecentConnections = Number(
      this.getSettings().maxRecentConnections ?? DEFAULT_STATE.settings.maxRecentConnections
    );

    const staleRows = this.db
      .prepare(`
        SELECT id
        FROM recent_connections
        ORDER BY lastOpenedAt DESC, id ASC
        LIMIT -1 OFFSET ?
      `)
      .all(maxRecentConnections);

    if (!staleRows.length) {
      return;
    }

    const activeConnectionId = this.getActiveConnectionId();

    for (const row of staleRows) {
      this.db.prepare("DELETE FROM recent_connections WHERE id = ?").run(row.id);
    }

    if (activeConnectionId && staleRows.some((row) => row.id === activeConnectionId)) {
      this.setMetaValue("activeConnectionId", null);
    }
  }

  trimSqlHistory() {
    const maxSqlHistory = Number(
      this.getSettings().maxSqlHistory ?? DEFAULT_STATE.settings.maxSqlHistory
    );

    const staleRows = this.db
      .prepare(`
        SELECT id
        FROM sql_history
        ORDER BY executedAt DESC, id ASC
        LIMIT -1 OFFSET ?
      `)
      .all(maxSqlHistory);

    for (const row of staleRows) {
      this.db.prepare("DELETE FROM sql_history WHERE id = ?").run(row.id);
    }
  }

  getState() {
    return structuredClone({
      recentConnections: this.getRecentConnections(),
      activeConnectionId: this.getActiveConnectionId(),
      sqlHistory: this.getSqlHistory(),
      settings: this.getSettings(),
    });
  }

  getRecentConnections() {
    return this.db
      .prepare(`
        SELECT
          id,
          label,
          path,
          lastOpenedAt,
          lastModifiedAt,
          sizeBytes,
          readOnly
        FROM recent_connections
        ORDER BY lastOpenedAt DESC, id ASC
      `)
      .all()
      .map((connection) => ({
        ...connection,
        readOnly: Boolean(connection.readOnly),
      }));
  }

  upsertRecentConnection(connection, options = {}) {
    const makeActive = options.makeActive !== false;

    this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO recent_connections (
            id,
            label,
            path,
            lastOpenedAt,
            lastModifiedAt,
            sizeBytes,
            readOnly
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            label = excluded.label,
            path = excluded.path,
            lastOpenedAt = excluded.lastOpenedAt,
            lastModifiedAt = excluded.lastModifiedAt,
            sizeBytes = excluded.sizeBytes,
            readOnly = excluded.readOnly
        `)
        .run(
          connection.id,
          connection.label,
          connection.path,
          connection.lastOpenedAt,
          connection.lastModifiedAt ?? null,
          connection.sizeBytes ?? null,
          connection.readOnly ? 1 : 0
        );

      if (makeActive) {
        this.setMetaValue("activeConnectionId", connection.id);
      }

      this.trimRecentConnections();
    })();

    return this.getRecentConnections();
  }

  removeRecentConnection(id) {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM recent_connections WHERE id = ?").run(id);

      if (this.getActiveConnectionId() === id) {
        this.setMetaValue("activeConnectionId", null);
      }
    })();

    return this.getState();
  }

  updateRecentConnection(id, updater) {
    const existing = this.getRecentConnections().find((connection) => connection.id === id);

    if (!existing) {
      return this.getRecentConnections();
    }

    const nextConnection = updater(structuredClone(existing)) ?? existing;

    this.db
      .prepare(`
        INSERT INTO recent_connections (
          id,
          label,
          path,
          lastOpenedAt,
          lastModifiedAt,
          sizeBytes,
          readOnly
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          path = excluded.path,
          lastOpenedAt = excluded.lastOpenedAt,
          lastModifiedAt = excluded.lastModifiedAt,
          sizeBytes = excluded.sizeBytes,
          readOnly = excluded.readOnly
      `)
      .run(
        nextConnection.id,
        nextConnection.label,
        nextConnection.path,
        nextConnection.lastOpenedAt ?? existing.lastOpenedAt,
        nextConnection.lastModifiedAt ?? null,
        nextConnection.sizeBytes ?? null,
        nextConnection.readOnly ? 1 : 0
      );

    return this.getRecentConnections();
  }

  setActiveConnectionId(id) {
    this.setMetaValue("activeConnectionId", id ?? null);
    return this.getActiveConnectionId();
  }

  getActiveConnectionId() {
    return this.getMetaValue("activeConnectionId");
  }

  addSqlHistory(entry) {
    this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO sql_history (
            id,
            connectionId,
            connectionLabel,
            sql,
            statementCount,
            resultKind,
            affectedRowCount,
            rowCount,
            timingMs,
            executedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          entry.id,
          entry.connectionId ?? null,
          entry.connectionLabel ?? null,
          entry.sql,
          Number(entry.statementCount ?? 0),
          entry.resultKind ?? null,
          Number(entry.affectedRowCount ?? 0),
          Number(entry.rowCount ?? 0),
          Number(entry.timingMs ?? 0),
          entry.executedAt
        );

      this.trimSqlHistory();
    })();

    return this.getSqlHistory();
  }

  clearSqlHistory() {
    this.db.prepare("DELETE FROM sql_history").run();
    return [];
  }

  getSqlHistory() {
    return this.db
      .prepare(`
        SELECT
          id,
          connectionId,
          connectionLabel,
          sql,
          statementCount,
          resultKind,
          affectedRowCount,
          rowCount,
          timingMs,
          executedAt
        FROM sql_history
        ORDER BY executedAt DESC, id ASC
      `)
      .all()
      .map((entry) => ({
        ...entry,
        statementCount: Number(entry.statementCount ?? 0),
        affectedRowCount: Number(entry.affectedRowCount ?? 0),
        rowCount: Number(entry.rowCount ?? 0),
        timingMs: Number(entry.timingMs ?? 0),
      }));
  }

  getSettings() {
    const rows = this.db.prepare("SELECT key, value FROM settings").all();
    const parsedSettings = Object.fromEntries(
      rows.map((row) => [row.key, this.parseStoredValue(row.value)])
    );

    return {
      ...DEFAULT_STATE.settings,
      ...parsedSettings,
    };
  }

  patchSettings(partialSettings) {
    const entries = Object.entries(partialSettings ?? {});

    this.db.transaction(() => {
      for (const [key, value] of entries) {
        this.db
          .prepare(`
            INSERT INTO settings (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `)
          .run(key, JSON.stringify(value));
      }
    })();

    return this.getSettings();
  }
}

module.exports = {
  AppStateStore,
  DEFAULT_STATE,
};
