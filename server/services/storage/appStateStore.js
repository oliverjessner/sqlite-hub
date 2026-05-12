const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { ConflictError, NotFoundError, ValidationError } = require("../../utils/errors");
const {
  buildAutoTitle,
  buildSqlPreview,
  detectQueryType,
  detectTables,
  isDestructiveQuery,
  normalizeSql,
} = require("./queryHistoryUtils");
const {
  buildDefaultChartName,
  normalizeChartConfig,
  normalizeChartName,
  normalizeChartType,
  normalizeResultColumns,
} = require("./queryHistoryChartUtils");

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

const CONNECTION_LOGO_DIRECTORY = "db_logos";
const MAX_CONNECTION_LOGO_SIZE_BYTES = 5 * 1024 * 1024;
const CONNECTION_LOGO_EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const CONNECTION_LOGO_EXTENSION_BY_FILE_EXTENSION = {
  ".jpeg": "jpg",
  ".jpg": "jpg",
  ".png": "png",
  ".webp": "webp",
};
const QUERY_HISTORY_MIGRATION_KEY = "queryHistoryV1Migrated";
const MEDIA_TAGGING_CONFIG_FIELDS = [
  {
    column: "tag_table",
    property: "tagTable",
    definition: "tag_table TEXT NOT NULL DEFAULT ''",
  },
  {
    column: "media_table",
    property: "mediaTable",
    definition: "media_table TEXT NOT NULL DEFAULT ''",
  },
  {
    column: "path_column",
    property: "pathColumn",
    definition: "path_column TEXT NOT NULL DEFAULT ''",
  },
  {
    column: "tagged_column",
    property: "taggedColumn",
    definition: "tagged_column TEXT NOT NULL DEFAULT ''",
  },
  {
    column: "untagged_query",
    property: "untaggedQuery",
    definition: "untagged_query TEXT NOT NULL DEFAULT ''",
  },
  {
    column: "tagged_query",
    property: "taggedQuery",
    definition: "tagged_query TEXT NOT NULL DEFAULT ''",
  },
  {
    column: "mapping_table",
    property: "mappingTable",
    definition: "mapping_table TEXT NOT NULL DEFAULT ''",
  },
];

function normalizeMediaTaggingConfigValue(value) {
  return String(value ?? "").trim();
}

function normalizeMediaTaggingConfigRecord(config = {}) {
  return {
    tagTable: normalizeMediaTaggingConfigValue(config.tagTable),
    mediaTable: normalizeMediaTaggingConfigValue(config.mediaTable),
    pathColumn: normalizeMediaTaggingConfigValue(config.pathColumn),
    taggedColumn: normalizeMediaTaggingConfigValue(config.taggedColumn),
    untaggedQuery: String(config.untaggedQuery ?? "").trim(),
    taggedQuery: String(config.taggedQuery ?? "").trim(),
    mappingTable: normalizeMediaTaggingConfigValue(config.mappingTable),
  };
}

function isChartCompatibleQuery(queryType, rawSql = "") {
  return (
    String(queryType ?? "").trim().toLowerCase() === "select" ||
    detectQueryType(rawSql) === "select"
  );
}

class AppStateStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.logoDirectory = path.join(path.dirname(this.filePath), CONNECTION_LOGO_DIRECTORY);
    this.legacyFilePath = options.legacyFilePath ?? null;
    this.legacyDatabasePaths = Array.isArray(options.legacyDatabasePaths)
      ? options.legacyDatabasePaths
      : [];
    this.isFreshDatabase = !fs.existsSync(filePath);

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.mkdirSync(this.logoDirectory, { recursive: true });

    this.db = new Database(this.filePath);
    this.configureDatabase();
    this.ensureSchema();
    this.seedDefaultSettings();

    const importedLegacyDatabase = this.importFirstLegacyDatabase();

    if (!importedLegacyDatabase && this.shouldImportLegacyState()) {
      this.tryImportLegacyState();
    }

    this.migrateLegacySqlHistory();
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
        readOnly INTEGER NOT NULL DEFAULT 0,
        logoPath TEXT
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

      CREATE TABLE IF NOT EXISTS query_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        database_key TEXT NOT NULL,
        normalized_sql TEXT NOT NULL,
        raw_sql TEXT NOT NULL,
        title TEXT,
        notes TEXT,
        query_type TEXT NOT NULL DEFAULT 'other',
        tables_detected TEXT NOT NULL DEFAULT '[]',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_saved INTEGER NOT NULL DEFAULT 0,
        is_destructive INTEGER NOT NULL DEFAULT 0,
        use_count INTEGER NOT NULL DEFAULT 1,
        first_executed_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS query_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        history_id INTEGER NOT NULL,
        executed_at TEXT NOT NULL,
        duration_ms INTEGER,
        row_count INTEGER,
        status TEXT NOT NULL CHECK(status IN ('success', 'error')),
        error_message TEXT,
        affected_rows INTEGER,
        FOREIGN KEY (history_id) REFERENCES query_history(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS query_history_chart (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_history_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        chart_type TEXT NOT NULL CHECK (chart_type IN ('bar', 'line', 'pie', 'scatter')),
        config_json TEXT NOT NULL,
        result_columns_json TEXT NOT NULL DEFAULT '[]',
        table_visible INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (query_history_id) REFERENCES query_history(id) ON DELETE CASCADE,
        UNIQUE(query_history_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_query_history_database_key
      ON query_history(database_key);

      CREATE INDEX IF NOT EXISTS idx_query_history_last_used_at
      ON query_history(last_used_at DESC);

      CREATE INDEX IF NOT EXISTS idx_query_history_is_saved
      ON query_history(is_saved);

      CREATE INDEX IF NOT EXISTS idx_query_history_is_favorite
      ON query_history(is_favorite);

      CREATE INDEX IF NOT EXISTS idx_query_history_query_type
      ON query_history(query_type);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_query_history_database_normalized_sql
      ON query_history(database_key, normalized_sql);

      CREATE INDEX IF NOT EXISTS idx_query_runs_history_id
      ON query_runs(history_id);

      CREATE INDEX IF NOT EXISTS idx_query_runs_executed_at
      ON query_runs(executed_at DESC);

      CREATE INDEX IF NOT EXISTS idx_query_runs_status
      ON query_runs(status);

      CREATE INDEX IF NOT EXISTS idx_query_history_chart_query_history_id
      ON query_history_chart(query_history_id);

      CREATE INDEX IF NOT EXISTS idx_query_history_chart_query_history_updated_at
      ON query_history_chart(query_history_id, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_query_history_chart_chart_type
      ON query_history_chart(chart_type);

      CREATE TABLE IF NOT EXISTS media_tagging_config (
        database_key TEXT PRIMARY KEY,
        tag_table TEXT NOT NULL DEFAULT '',
        media_table TEXT NOT NULL DEFAULT '',
        path_column TEXT NOT NULL DEFAULT '',
        tagged_column TEXT NOT NULL DEFAULT '',
        untagged_query TEXT NOT NULL DEFAULT '',
        tagged_query TEXT NOT NULL DEFAULT '',
        mapping_table TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
    `);

    const recentConnectionColumns = new Set(
      this.db
        .prepare("PRAGMA table_info(recent_connections)")
        .all()
        .map((column) => column.name)
    );

    if (!recentConnectionColumns.has("logoPath")) {
      this.db.exec("ALTER TABLE recent_connections ADD COLUMN logoPath TEXT");
    }

    this.ensureMediaTaggingConfigSchema();
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
      const recentConnectionColumns = tables.has("recent_connections")
        ? new Set(
            legacyDb
              .prepare("PRAGMA table_info(recent_connections)")
              .all()
              .map((column) => column.name)
          )
        : new Set();

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
                  readOnly,
                  ${recentConnectionColumns.has("logoPath") ? "logoPath" : "NULL AS logoPath"}
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
        readOnly,
        logoPath
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        path = excluded.path,
        lastOpenedAt = excluded.lastOpenedAt,
        lastModifiedAt = excluded.lastModifiedAt,
        sizeBytes = excluded.sizeBytes,
        readOnly = excluded.readOnly,
        logoPath = excluded.logoPath
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
          connection.readOnly ? 1 : 0,
          this.normalizeLogoPath(connection.logoPath)
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

  ensureMediaTaggingConfigSchema() {
    const columns = this.db
      .prepare("PRAGMA table_info(media_tagging_config)")
      .all()
      .map((column) => column.name);
    const columnSet = new Set(columns);

    this.mediaTaggingConfigHasLegacyJsonColumn = columnSet.has("config_json");

    for (const field of MEDIA_TAGGING_CONFIG_FIELDS) {
      if (!columnSet.has(field.column)) {
        this.db.exec(`ALTER TABLE media_tagging_config ADD COLUMN ${field.definition}`);
      }
    }

    if (this.mediaTaggingConfigHasLegacyJsonColumn) {
      this.backfillMediaTaggingConfigColumnsFromLegacyJson();
    }
  }

  backfillMediaTaggingConfigColumnsFromLegacyJson() {
    const rows = this.db
      .prepare(
        `
          SELECT database_key, config_json
          FROM media_tagging_config
          WHERE config_json IS NOT NULL
        `
      )
      .all();

    if (!rows.length) {
      return;
    }

    const updateStatement = this.db.prepare(`
      UPDATE media_tagging_config
      SET
        tag_table = COALESCE(NULLIF(tag_table, ''), ?),
        media_table = COALESCE(NULLIF(media_table, ''), ?),
        path_column = COALESCE(NULLIF(path_column, ''), ?),
        tagged_column = COALESCE(NULLIF(tagged_column, ''), ?),
        untagged_query = COALESCE(NULLIF(untagged_query, ''), ?),
        tagged_query = COALESCE(NULLIF(tagged_query, ''), ?),
        mapping_table = COALESCE(NULLIF(mapping_table, ''), ?)
      WHERE database_key = ?
    `);

    this.db.transaction(() => {
      for (const row of rows) {
        const parsedConfig = this.parseStoredValue(row.config_json);
        const normalizedConfig = normalizeMediaTaggingConfigRecord(
          parsedConfig && typeof parsedConfig === "object" && !Array.isArray(parsedConfig)
            ? parsedConfig
            : {}
        );

        updateStatement.run(
          normalizedConfig.tagTable,
          normalizedConfig.mediaTable,
          normalizedConfig.pathColumn,
          normalizedConfig.taggedColumn,
          normalizedConfig.untaggedQuery,
          normalizedConfig.taggedQuery,
          normalizedConfig.mappingTable,
          row.database_key
        );
      }
    })();
  }

  buildMediaTaggingConfigRecord(row = {}) {
    return normalizeMediaTaggingConfigRecord(
      Object.fromEntries(
        MEDIA_TAGGING_CONFIG_FIELDS.map((field) => [field.property, row[field.column] ?? null])
      )
    );
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

  normalizeQueryHistoryText(value) {
    const text = String(value ?? "").trim();
    return text ? text : null;
  }

  normalizeQueryHistoryInteger(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.round(numericValue) : null;
  }

  parseTablesDetected(value) {
    if (Array.isArray(value)) {
      return Array.from(
        new Set(
          value
            .map((entry) => String(entry ?? "").trim())
            .filter(Boolean)
        )
      );
    }

    if (!value) {
      return [];
    }

    try {
      return this.parseTablesDetected(JSON.parse(value));
    } catch {
      return [];
    }
  }

  decorateQueryRun(row = {}) {
    return {
      id: Number(row.id),
      historyId: Number(row.history_id ?? row.historyId),
      executedAt: row.executed_at ?? row.executedAt ?? null,
      durationMs: this.normalizeQueryHistoryInteger(row.duration_ms ?? row.durationMs),
      rowCount: this.normalizeQueryHistoryInteger(row.row_count ?? row.rowCount),
      status: row.status ?? "success",
      errorMessage: this.normalizeQueryHistoryText(row.error_message ?? row.errorMessage),
      affectedRows: this.normalizeQueryHistoryInteger(row.affected_rows ?? row.affectedRows),
    };
  }

  decorateQueryHistoryRow(row = {}) {
    const tablesDetected = this.parseTablesDetected(row.tables_detected ?? row.tablesDetected);
    const queryType = row.query_type ?? row.queryType ?? "other";
    const title = this.normalizeQueryHistoryText(row.title);
    const notes = this.normalizeQueryHistoryText(row.notes);
    const chartTypes = String(row.chart_types ?? row.chartTypes ?? "")
      .split(",")
      .map((entry) => String(entry ?? "").trim().toLowerCase())
      .filter((entry, index, values) => entry && values.indexOf(entry) === index);
    const lastRun =
      row.last_run_id ?? row.lastRunId
        ? this.decorateQueryRun({
            id: row.last_run_id ?? row.lastRunId,
            history_id: row.id,
            executed_at: row.last_run_executed_at ?? row.lastRunExecutedAt,
            duration_ms: row.last_run_duration_ms ?? row.lastRunDurationMs,
            row_count: row.last_run_row_count ?? row.lastRunRowCount,
            status: row.last_run_status ?? row.lastRunStatus,
            error_message: row.last_run_error_message ?? row.lastRunErrorMessage,
            affected_rows: row.last_run_affected_rows ?? row.lastRunAffectedRows,
          })
        : null;

    return {
      id: Number(row.id),
      databaseKey: row.database_key ?? row.databaseKey,
      normalizedSql: row.normalized_sql ?? row.normalizedSql,
      rawSql: row.raw_sql ?? row.rawSql,
      title,
      notes,
      queryType,
      tablesDetected,
      isFavorite: Boolean(row.is_favorite ?? row.isFavorite),
      isSaved: Boolean(row.is_saved ?? row.isSaved),
      isDestructive: Boolean(row.is_destructive ?? row.isDestructive),
      useCount: Number(row.use_count ?? row.useCount ?? 0),
      firstExecutedAt: row.first_executed_at ?? row.firstExecutedAt ?? null,
      lastUsedAt: row.last_used_at ?? row.lastUsedAt ?? null,
      chartCount: Number(row.chart_count ?? row.chartCount ?? 0),
      chartTypes,
      displayTitle:
        title ||
        buildAutoTitle(row.raw_sql ?? row.rawSql, {
          queryType,
          tablesDetected,
        }),
      previewSql: buildSqlPreview(row.raw_sql ?? row.rawSql),
      lastRun,
      chartsEligible:
        isChartCompatibleQuery(queryType, row.raw_sql ?? row.rawSql) &&
        (!lastRun || String(lastRun.status ?? "").trim().toLowerCase() !== "error"),
    };
  }

  parseQueryHistoryChartConfig(value) {
    if (!value) {
      return {};
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      return value;
    }

    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  parseQueryHistoryChartResultColumns(value) {
    if (Array.isArray(value)) {
      return normalizeResultColumns(value);
    }

    if (!value) {
      return [];
    }

    try {
      return normalizeResultColumns(JSON.parse(value));
    } catch {
      return [];
    }
  }

  decorateQueryHistoryChartRow(row = {}) {
    return {
      id: Number(row.id),
      queryHistoryId: Number(row.query_history_id ?? row.queryHistoryId),
      name: String(row.name ?? ""),
      chartType: normalizeChartType(row.chart_type ?? row.chartType ?? "bar"),
      config: normalizeChartConfig(
        row.chart_type ?? row.chartType ?? "bar",
        this.parseQueryHistoryChartConfig(row.config_json ?? row.configJson)
      ),
      resultColumns: this.parseQueryHistoryChartResultColumns(
        row.result_columns_json ?? row.resultColumnsJson
      ),
      tableVisible: Boolean(row.table_visible ?? row.tableVisible),
      createdAt: row.created_at ?? row.createdAt ?? null,
      updatedAt: row.updated_at ?? row.updatedAt ?? null,
    };
  }

  buildQueryHistoryFilters({
    databaseKey,
    search,
    queryType,
    onlySaved = false,
    onlyUnsaved = false,
    onlyFavorites = false,
    latestStatus = null,
  } = {}) {
    const clauses = [];
    const params = [];
    const normalizedSearch = String(search ?? "").trim().toLowerCase();

    if (databaseKey) {
      clauses.push("q.database_key = ?");
      params.push(databaseKey);
    }

    if (normalizedSearch) {
      const searchPattern = `%${normalizedSearch}%`;
      clauses.push(`
        (
          LOWER(COALESCE(q.title, '')) LIKE ?
          OR LOWER(q.raw_sql) LIKE ?
          OR LOWER(COALESCE(q.notes, '')) LIKE ?
          OR LOWER(q.normalized_sql) LIKE ?
          OR LOWER(q.tables_detected) LIKE ?
        )
      `);
      params.push(
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern
      );
    }

    if (queryType) {
      clauses.push("q.query_type = ?");
      params.push(queryType);
    }

    if (onlySaved) {
      clauses.push("q.is_saved = 1");
    }

    if (onlyUnsaved) {
      clauses.push("q.is_saved = 0");
    }

    if (onlyFavorites) {
      clauses.push("q.is_favorite = 1");
    }

    if (latestStatus) {
      clauses.push("latest.status = ?");
      params.push(latestStatus);
    }

    return {
      whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
      params,
    };
  }

  getQueryHistoryOrderBy({ onlySaved = false, onlyFavorites = false, latestStatus = null } = {}) {
    if (onlySaved || onlyFavorites) {
      return "ORDER BY q.is_favorite DESC, q.last_used_at DESC, q.id DESC";
    }

    if (latestStatus === "error") {
      return "ORDER BY latest.executed_at DESC, q.id DESC";
    }

    return "ORDER BY q.last_used_at DESC, q.id DESC";
  }

  buildQueryHistoryCollection({
    databaseKey,
    limit = 30,
    offset = 0,
    search = "",
    queryType = null,
    onlySaved = false,
    onlyUnsaved = false,
    onlyFavorites = false,
    latestStatus = null,
  } = {}) {
    const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 30));
    const normalizedOffset = Math.max(0, Number(offset) || 0);

    if (!databaseKey) {
      return {
        items: [],
        total: 0,
        limit: normalizedLimit,
        offset: normalizedOffset,
        hasMore: false,
      };
    }

    const baseFromSql = `
      FROM query_history q
      LEFT JOIN query_runs latest
        ON latest.id = (
          SELECT runs.id
          FROM query_runs runs
          WHERE runs.history_id = q.id
          ORDER BY runs.executed_at DESC, runs.id DESC
          LIMIT 1
        )
    `;
    const { whereSql, params } = this.buildQueryHistoryFilters({
      databaseKey,
      search,
      queryType,
      onlySaved,
      onlyUnsaved,
      onlyFavorites,
      latestStatus,
    });
    const orderBySql = this.getQueryHistoryOrderBy({
      onlySaved,
      onlyFavorites,
      latestStatus,
    });
    const rows = this.db
      .prepare(`
        SELECT
          q.id,
          q.database_key,
          q.normalized_sql,
          q.raw_sql,
          q.title,
          q.notes,
          q.query_type,
          q.tables_detected,
          q.is_favorite,
          q.is_saved,
          q.is_destructive,
          q.use_count,
          q.first_executed_at,
          q.last_used_at,
          latest.id AS last_run_id,
          latest.executed_at AS last_run_executed_at,
          latest.duration_ms AS last_run_duration_ms,
          latest.row_count AS last_run_row_count,
          latest.status AS last_run_status,
          latest.error_message AS last_run_error_message,
          latest.affected_rows AS last_run_affected_rows
        ${baseFromSql}
        ${whereSql}
        ${orderBySql}
        LIMIT ?
        OFFSET ?
      `)
      .all(...params, normalizedLimit, normalizedOffset)
      .map((row) => this.decorateQueryHistoryRow(row));
    const countRow = this.db
      .prepare(`
        SELECT COUNT(*) AS count
        ${baseFromSql}
        ${whereSql}
      `)
      .get(...params);
    const total = Number(countRow?.count ?? 0);

    return {
      items: rows,
      total,
      limit: normalizedLimit,
      offset: normalizedOffset,
      hasMore: normalizedOffset + rows.length < total,
    };
  }

  migrateLegacySqlHistory() {
    if (this.getMetaValue(QUERY_HISTORY_MIGRATION_KEY) === "1") {
      return;
    }

    const hasLegacyTable = Boolean(
      this.db
        .prepare(
          "SELECT 1 AS exists_flag FROM sqlite_master WHERE type = 'table' AND name = 'sql_history'"
        )
        .get()
    );

    if (!hasLegacyTable) {
      this.setMetaValue(QUERY_HISTORY_MIGRATION_KEY, "1");
      return;
    }

    const legacyCount = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM sql_history").get()?.count ?? 0
    );

    if (!legacyCount) {
      this.setMetaValue(QUERY_HISTORY_MIGRATION_KEY, "1");
      return;
    }

    const currentHistoryCount = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM query_history").get()?.count ?? 0
    );
    const currentRunCount = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM query_runs").get()?.count ?? 0
    );

    if (currentHistoryCount > 0 || currentRunCount > 0) {
      this.setMetaValue(QUERY_HISTORY_MIGRATION_KEY, "1");
      return;
    }

    const legacyRows = this.db
      .prepare(`
        SELECT
          connectionId,
          connectionLabel,
          sql,
          timingMs,
          rowCount,
          affectedRowCount,
          executedAt
        FROM sql_history
        ORDER BY executedAt ASC, id ASC
      `)
      .all();

    this.db.transaction(() => {
      legacyRows.forEach((entry) => {
        const databaseKey =
          this.normalizeQueryHistoryText(entry.connectionId) ??
          this.normalizeQueryHistoryText(entry.connectionLabel) ??
          "legacy:default";
        const rawSql = String(entry.sql ?? "");

        if (!normalizeSql(rawSql)) {
          return;
        }

        this.recordQueryExecutionInTransaction({
          databaseKey,
          rawSql,
          status: "success",
          durationMs: entry.timingMs,
          rowCount: entry.rowCount,
          affectedRows: entry.affectedRowCount,
          executedAt: entry.executedAt ?? new Date().toISOString(),
        });
      });
    })();

    this.setMetaValue(QUERY_HISTORY_MIGRATION_KEY, "1");
  }

  recordQueryExecution(entry = {}) {
    return this.db.transaction(() => this.recordQueryExecutionInTransaction(entry))();
  }

  recordQueryExecutionInTransaction({
    databaseKey,
    rawSql,
    status,
    durationMs = null,
    rowCount = null,
    affectedRows = null,
    errorMessage = null,
    executedAt = null,
  } = {}) {
    const normalizedDatabaseKey = this.normalizeQueryHistoryText(databaseKey);
    const normalizedRawSql = String(rawSql ?? "");
    const normalizedSql = normalizeSql(normalizedRawSql);

    if (!normalizedDatabaseKey) {
      throw new ValidationError("Query history requires a database key.");
    }

    if (!normalizedSql) {
      throw new ValidationError("Query history requires executable SQL.");
    }

    if (!["success", "error"].includes(status)) {
      throw new ValidationError(`Unsupported query run status: ${status}`);
    }

    const queryType = detectQueryType(normalizedRawSql);
    const tablesDetected = detectTables(normalizedRawSql);
    const timestamp = this.normalizeQueryHistoryText(executedAt) ?? new Date().toISOString();
    const destructive = isDestructiveQuery(normalizedRawSql) ? 1 : 0;
    const serializedTables = JSON.stringify(tablesDetected);
    const existing = this.db
      .prepare(
        `
          SELECT id
          FROM query_history
          WHERE database_key = ? AND normalized_sql = ?
        `
      )
      .get(normalizedDatabaseKey, normalizedSql);
    let historyId = Number(existing?.id ?? 0);

    if (historyId) {
      this.db
        .prepare(`
          UPDATE query_history
          SET
            raw_sql = ?,
            query_type = ?,
            tables_detected = ?,
            is_destructive = ?,
            use_count = use_count + 1,
            last_used_at = ?
          WHERE id = ?
        `)
        .run(
          normalizedRawSql,
          queryType,
          serializedTables,
          destructive,
          timestamp,
          historyId
        );
    } else {
      const insertResult = this.db
        .prepare(`
          INSERT INTO query_history (
            database_key,
            normalized_sql,
            raw_sql,
            query_type,
            tables_detected,
            is_destructive,
            use_count,
            first_executed_at,
            last_used_at
          )
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `)
        .run(
          normalizedDatabaseKey,
          normalizedSql,
          normalizedRawSql,
          queryType,
          serializedTables,
          destructive,
          timestamp,
          timestamp
        );
      historyId = Number(insertResult.lastInsertRowid);
    }

    this.db
      .prepare(`
        INSERT INTO query_runs (
          history_id,
          executed_at,
          duration_ms,
          row_count,
          status,
          error_message,
          affected_rows
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        historyId,
        timestamp,
        this.normalizeQueryHistoryInteger(durationMs),
        this.normalizeQueryHistoryInteger(rowCount),
        status,
        this.normalizeQueryHistoryText(errorMessage),
        this.normalizeQueryHistoryInteger(affectedRows)
      );

    return historyId;
  }

  getRecentQueries(options = {}) {
    return this.buildQueryHistoryCollection(options);
  }

  getFailedQueries(options = {}) {
    return this.buildQueryHistoryCollection({
      ...options,
      latestStatus: "error",
    });
  }

  getChartQueryHistoryList(databaseKey) {
    const normalizedDatabaseKey = this.normalizeQueryHistoryText(databaseKey);

    if (!normalizedDatabaseKey) {
      return [];
    }

    return this.db
      .prepare(`
        SELECT
          q.id,
          q.database_key,
          q.normalized_sql,
          q.raw_sql,
          q.title,
          q.notes,
          q.query_type,
          q.tables_detected,
          q.is_favorite,
          q.is_saved,
          q.is_destructive,
          q.use_count,
          q.first_executed_at,
          q.last_used_at,
          charts.chart_count,
          charts.chart_types,
          latest.id AS last_run_id,
          latest.executed_at AS last_run_executed_at,
          latest.duration_ms AS last_run_duration_ms,
          latest.row_count AS last_run_row_count,
          latest.status AS last_run_status,
          latest.error_message AS last_run_error_message,
          latest.affected_rows AS last_run_affected_rows
        FROM query_history q
        LEFT JOIN (
          SELECT
            query_history_id,
            COUNT(*) AS chart_count,
            GROUP_CONCAT(DISTINCT chart_type) AS chart_types
          FROM query_history_chart
          GROUP BY query_history_id
        ) charts
          ON charts.query_history_id = q.id
        LEFT JOIN query_runs latest
          ON latest.id = (
            SELECT runs.id
            FROM query_runs runs
            WHERE runs.history_id = q.id
            ORDER BY runs.executed_at DESC, runs.id DESC
            LIMIT 1
          )
        WHERE q.database_key = ?
          AND COALESCE(latest.status, 'success') != 'error'
        ORDER BY q.last_used_at DESC, q.id DESC
      `)
      .all(normalizedDatabaseKey)
      .map((row) => this.decorateQueryHistoryRow(row))
      .filter((item) => item.chartsEligible);
  }

  getQueryHistoryItemById(historyId, databaseKey) {
    const normalizedDatabaseKey = this.normalizeQueryHistoryText(databaseKey);
    const tenantId = normalizedDatabaseKey;

    if (!tenantId) {
      throw new ValidationError("Query history lookup requires a database key.");
    }

    const row = this.db
      .prepare(`
        SELECT
          q.id,
          q.database_key,
          q.normalized_sql,
          q.raw_sql,
          q.title,
          q.notes,
          q.query_type,
          q.tables_detected,
          q.is_favorite,
          q.is_saved,
          q.is_destructive,
          q.use_count,
          q.first_executed_at,
          q.last_used_at,
          latest.id AS last_run_id,
          latest.executed_at AS last_run_executed_at,
          latest.duration_ms AS last_run_duration_ms,
          latest.row_count AS last_run_row_count,
          latest.status AS last_run_status,
          latest.error_message AS last_run_error_message,
          latest.affected_rows AS last_run_affected_rows
        FROM query_history q
        -- tenantId scope is enforced on q.database_key for direct id lookups.
        LEFT JOIN query_runs latest
          ON latest.id = (
            SELECT runs.id
            FROM query_runs runs
            WHERE runs.history_id = q.id
            ORDER BY runs.executed_at DESC, runs.id DESC
            LIMIT 1
          )
        WHERE q.id = ?
          AND q.database_key = ?
      `)
      .get(Number(historyId), tenantId);

    if (!row) {
      throw new NotFoundError(`Query history item not found: ${historyId}`);
    }

    return this.decorateQueryHistoryRow(row);
  }

  findQueryHistoryItemBySql(databaseKey, rawSql) {
    const normalizedDatabaseKey = this.normalizeQueryHistoryText(databaseKey);
    const normalizedSql = normalizeSql(rawSql);

    if (!normalizedDatabaseKey || !normalizedSql) {
      return null;
    }

    const row = this.db
      .prepare(`
        SELECT
          q.id,
          q.database_key,
          q.normalized_sql,
          q.raw_sql,
          q.title,
          q.notes,
          q.query_type,
          q.tables_detected,
          q.is_favorite,
          q.is_saved,
          q.is_destructive,
          q.use_count,
          q.first_executed_at,
          q.last_used_at,
          latest.id AS last_run_id,
          latest.executed_at AS last_run_executed_at,
          latest.duration_ms AS last_run_duration_ms,
          latest.row_count AS last_run_row_count,
          latest.status AS last_run_status,
          latest.error_message AS last_run_error_message,
          latest.affected_rows AS last_run_affected_rows
        FROM query_history q
        LEFT JOIN query_runs latest
          ON latest.id = (
            SELECT runs.id
            FROM query_runs runs
            WHERE runs.history_id = q.id
            ORDER BY runs.executed_at DESC, runs.id DESC
            LIMIT 1
          )
        WHERE q.database_key = ? AND q.normalized_sql = ?
      `)
      .get(normalizedDatabaseKey, normalizedSql);

    return row ? this.decorateQueryHistoryRow(row) : null;
  }

  getQueryHistoryItemForDatabase(historyId, databaseKey) {
    return this.getQueryHistoryItemById(historyId, databaseKey);
  }

  getChartQueryHistoryItemForDatabase(historyId, databaseKey) {
    const item = this.getQueryHistoryItemForDatabase(historyId, databaseKey);

    if (!isChartCompatibleQuery(item.queryType, item.rawSql)) {
      throw new ValidationError("Only SELECT queries can be opened in Charts.");
    }

    return item;
  }

  getQueryRunsByHistoryId(historyId, limit = 8, databaseKey) {
    const normalizedLimit = Math.max(1, Math.min(50, Number(limit) || 8));
    const item = this.getQueryHistoryItemById(historyId, databaseKey);

    return this.db
      .prepare(`
        SELECT
          id,
          history_id,
          executed_at,
          duration_ms,
          row_count,
          status,
          error_message,
          affected_rows
        FROM query_runs
        WHERE history_id = ?
        ORDER BY executed_at DESC, id DESC
        LIMIT ?
      `)
      .all(item.id, normalizedLimit)
      .map((row) => this.decorateQueryRun(row));
  }

  getQueryHistoryChartsByHistoryId(historyId) {
    return this.db
      .prepare(`
        SELECT
          id,
          query_history_id,
          name,
          chart_type,
          config_json,
          result_columns_json,
          table_visible,
          created_at,
          updated_at
        FROM query_history_chart
        WHERE query_history_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(Number(historyId))
      .map((row) => this.decorateQueryHistoryChartRow(row));
  }

  getQueryHistoryChartById(chartId) {
    const row = this.db
      .prepare(`
        SELECT
          c.id,
          c.query_history_id,
          c.name,
          c.chart_type,
          c.config_json,
          c.result_columns_json,
          c.table_visible,
          c.created_at,
          c.updated_at
        FROM query_history_chart c
        WHERE c.id = ?
      `)
      .get(Number(chartId));

    if (!row) {
      throw new NotFoundError(`Query history chart not found: ${chartId}`);
    }

    return this.decorateQueryHistoryChartRow(row);
  }

  getQueryHistoryChartForDatabase(chartId, databaseKey) {
    const row = this.db
      .prepare(`
        SELECT
          c.id,
          c.query_history_id,
          c.name,
          c.chart_type,
          c.config_json,
          c.result_columns_json,
          c.table_visible,
          c.created_at,
          c.updated_at,
          q.database_key
        FROM query_history_chart c
        INNER JOIN query_history q
          ON q.id = c.query_history_id
        WHERE c.id = ?
      `)
      .get(Number(chartId));

    if (!row) {
      throw new NotFoundError(`Query history chart not found: ${chartId}`);
    }

    const normalizedDatabaseKey = this.normalizeQueryHistoryText(databaseKey);

    if (normalizedDatabaseKey && row.database_key !== normalizedDatabaseKey) {
      throw new NotFoundError(`Query history chart not found: ${chartId}`);
    }

    return this.decorateQueryHistoryChartRow(row);
  }

  getQueryHistoryChartsDetail(historyId, databaseKey) {
    const item = this.getChartQueryHistoryItemForDatabase(historyId, databaseKey);

    return {
      item,
      charts: this.getQueryHistoryChartsByHistoryId(item.id),
    };
  }

  updateQueryHistoryField(historyId, fieldName, value, databaseKey) {
    const normalizedDatabaseKey = this.normalizeQueryHistoryText(databaseKey);

    if (!normalizedDatabaseKey) {
      throw new ValidationError("Query history update requires a database key.");
    }

    const statements = {
      is_favorite: this.db.prepare(
        "UPDATE query_history SET is_favorite = ? WHERE id = ? AND database_key = ?"
      ),
      is_saved: this.db.prepare(
        "UPDATE query_history SET is_saved = ? WHERE id = ? AND database_key = ?"
      ),
      title: this.db.prepare(
        "UPDATE query_history SET title = ? WHERE id = ? AND database_key = ?"
      ),
      notes: this.db.prepare(
        "UPDATE query_history SET notes = ? WHERE id = ? AND database_key = ?"
      ),
    };
    const statement = statements[fieldName];

    if (!statement) {
      throw new ValidationError(`Query history field cannot be updated: ${fieldName}`);
    }

    const result = statement.run(value, Number(historyId), normalizedDatabaseKey);

    if (!result.changes) {
      throw new NotFoundError(`Query history item not found: ${historyId}`);
    }

    return this.getQueryHistoryItemById(historyId, normalizedDatabaseKey);
  }

  resolveUniqueQueryHistoryChartName(queryHistoryId, candidateName, { excludeChartId = null } = {}) {
    const baseName = normalizeChartName(candidateName) || "Chart";
    let nextName = baseName;
    let suffix = 2;

    while (true) {
      const row = this.db
        .prepare(`
          SELECT id
          FROM query_history_chart
          WHERE query_history_id = ?
            AND name = ?
            ${excludeChartId ? "AND id != ?" : ""}
          LIMIT 1
        `)
        .get(
          Number(queryHistoryId),
          nextName,
          ...(excludeChartId ? [Number(excludeChartId)] : [])
        );

      if (!row) {
        return nextName;
      }

      nextName = `${baseName}_${suffix}`;
      suffix += 1;
    }
  }

  createQueryHistoryChart({
    queryHistoryId,
    name,
    chartType,
    config,
    resultColumns = [],
    tableVisible = true,
    databaseKey = null,
  } = {}) {
    const item = this.getChartQueryHistoryItemForDatabase(queryHistoryId, databaseKey);
    const normalizedChartType = normalizeChartType(chartType);
    const normalizedConfig = normalizeChartConfig(normalizedChartType, config);
    const normalizedResultColumns = normalizeResultColumns(resultColumns);
    const requestedName =
      normalizeChartName(name) || buildDefaultChartName(normalizedChartType, item.displayTitle);
    const uniqueName = this.resolveUniqueQueryHistoryChartName(item.id, requestedName);
    const timestamp = new Date().toISOString();
    const insertResult = this.db
      .prepare(`
        INSERT INTO query_history_chart (
          query_history_id,
          name,
          chart_type,
          config_json,
          result_columns_json,
          table_visible,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        item.id,
        uniqueName,
        normalizedChartType,
        JSON.stringify(normalizedConfig),
        JSON.stringify(normalizedResultColumns),
        tableVisible ? 1 : 0,
        timestamp,
        timestamp
      );

    return this.getQueryHistoryChartById(insertResult.lastInsertRowid);
  }

  updateQueryHistoryChart(
    chartId,
    { name, chartType, config, resultColumns, tableVisible, databaseKey = null } = {}
  ) {
    const existing = this.getQueryHistoryChartForDatabase(chartId, databaseKey);
    const nextChartType = chartType ? normalizeChartType(chartType) : existing.chartType;
    const nextName =
      name === undefined ? existing.name : normalizeChartName(name);

    if (!nextName) {
      throw new ValidationError("Chart name is required.");
    }

    const conflicting = this.db
      .prepare(`
        SELECT id
        FROM query_history_chart
        WHERE query_history_id = ?
          AND name = ?
          AND id != ?
        LIMIT 1
      `)
      .get(existing.queryHistoryId, nextName, existing.id);

    if (conflicting) {
      throw new ConflictError(`A chart named "${nextName}" already exists for this query.`);
    }

    const nextConfig = normalizeChartConfig(
      nextChartType,
      config === undefined ? existing.config : config
    );
    const nextResultColumns =
      resultColumns === undefined ? existing.resultColumns : normalizeResultColumns(resultColumns);
    const nextTableVisible =
      tableVisible === undefined ? existing.tableVisible : Boolean(tableVisible);
    const timestamp = new Date().toISOString();

    this.db
      .prepare(`
        UPDATE query_history_chart
        SET
          name = ?,
          chart_type = ?,
          config_json = ?,
          result_columns_json = ?,
          table_visible = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(
        nextName,
        nextChartType,
        JSON.stringify(nextConfig),
        JSON.stringify(nextResultColumns),
        nextTableVisible ? 1 : 0,
        timestamp,
        existing.id
      );

    return this.getQueryHistoryChartById(existing.id);
  }

  deleteQueryHistoryChart(chartId, databaseKey = null) {
    this.getQueryHistoryChartForDatabase(chartId, databaseKey);

    const result = this.db
      .prepare("DELETE FROM query_history_chart WHERE id = ?")
      .run(Number(chartId));

    if (!result.changes) {
      throw new NotFoundError(`Query history chart not found: ${chartId}`);
    }

    return true;
  }

  toggleFavorite(historyId, nextValue, databaseKey) {
    return this.updateQueryHistoryField(historyId, "is_favorite", nextValue ? 1 : 0, databaseKey);
  }

  toggleSaved(historyId, nextValue, databaseKey) {
    return this.updateQueryHistoryField(historyId, "is_saved", nextValue ? 1 : 0, databaseKey);
  }

  renameQuery(historyId, title, databaseKey) {
    return this.updateQueryHistoryField(
      historyId,
      "title",
      this.normalizeQueryHistoryText(title),
      databaseKey
    );
  }

  updateQueryNotes(historyId, notes, databaseKey) {
    return this.updateQueryHistoryField(
      historyId,
      "notes",
      this.normalizeQueryHistoryText(notes),
      databaseKey
    );
  }

  deleteQueryHistoryItem(historyId, databaseKey) {
    const normalizedDatabaseKey = this.normalizeQueryHistoryText(databaseKey);

    if (!normalizedDatabaseKey) {
      throw new ValidationError("Query history delete requires a database key.");
    }

    const result = this.db
      .prepare("DELETE FROM query_history WHERE id = ? AND database_key = ?")
      .run(Number(historyId), normalizedDatabaseKey);

    if (!result.changes) {
      throw new NotFoundError(`Query history item not found: ${historyId}`);
    }

    return true;
  }

  clearQueryHistoryForDatabase(databaseKey) {
    const normalizedDatabaseKey = this.normalizeQueryHistoryText(databaseKey);

    if (!normalizedDatabaseKey) {
      return 0;
    }

    return this.db
      .prepare("DELETE FROM query_history WHERE database_key = ?")
      .run(normalizedDatabaseKey).changes;
  }

  trimRecentConnections() {
    const maxRecentConnections = Number(
      this.getSettings().maxRecentConnections ?? DEFAULT_STATE.settings.maxRecentConnections
    );

    const staleRows = this.db
      .prepare(`
        SELECT id, logoPath
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

    staleRows.forEach((row) => {
      this.deleteConnectionLogo(row.logoPath);
    });
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
          readOnly,
          logoPath
        FROM recent_connections
        ORDER BY lastOpenedAt DESC, id ASC
      `)
      .all()
      .map((connection) => this.decorateConnection(connection));
  }

  upsertRecentConnection(connection, options = {}) {
    const makeActive = options.makeActive !== false;
    const existing = this.getRecentConnections().find((entry) => entry.id === connection.id);
    const nextLogoPath = this.normalizeLogoPath(connection.logoPath);

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
            readOnly,
            logoPath
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            label = excluded.label,
            path = excluded.path,
            lastOpenedAt = excluded.lastOpenedAt,
            lastModifiedAt = excluded.lastModifiedAt,
            sizeBytes = excluded.sizeBytes,
            readOnly = excluded.readOnly,
            logoPath = excluded.logoPath
        `)
        .run(
          connection.id,
          connection.label,
          connection.path,
          connection.lastOpenedAt,
          connection.lastModifiedAt ?? null,
          connection.sizeBytes ?? null,
          connection.readOnly ? 1 : 0,
          nextLogoPath
        );

      if (makeActive) {
        this.setMetaValue("activeConnectionId", connection.id);
      }

      this.trimRecentConnections();
    })();

    if (this.normalizeLogoPath(existing?.logoPath) !== nextLogoPath) {
      this.deleteConnectionLogo(existing?.logoPath);
    }

    return this.getRecentConnections();
  }

  removeRecentConnection(id) {
    const existing = this.getRecentConnections().find((connection) => connection.id === id);

    this.db.transaction(() => {
      this.db.prepare("DELETE FROM recent_connections WHERE id = ?").run(id);

      if (this.getActiveConnectionId() === id) {
        this.setMetaValue("activeConnectionId", null);
      }
    })();

    this.deleteConnectionLogo(existing?.logoPath);

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
          readOnly,
          logoPath
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          path = excluded.path,
          lastOpenedAt = excluded.lastOpenedAt,
          lastModifiedAt = excluded.lastModifiedAt,
          sizeBytes = excluded.sizeBytes,
          readOnly = excluded.readOnly,
          logoPath = excluded.logoPath
      `)
      .run(
        nextConnection.id,
        nextConnection.label,
        nextConnection.path,
        nextConnection.lastOpenedAt ?? existing.lastOpenedAt,
        nextConnection.lastModifiedAt ?? null,
        nextConnection.sizeBytes ?? null,
        nextConnection.readOnly ? 1 : 0,
        this.normalizeLogoPath(nextConnection.logoPath)
      );

    if (this.normalizeLogoPath(nextConnection.logoPath) !== this.normalizeLogoPath(existing.logoPath)) {
      this.deleteConnectionLogo(existing.logoPath);
    }

    return this.getRecentConnections();
  }

  getConnectionLogoUrl(logoPath) {
    const normalizedLogoPath = this.normalizeLogoPath(logoPath);

    if (!normalizedLogoPath) {
      return null;
    }

    return `/${CONNECTION_LOGO_DIRECTORY}/${encodeURIComponent(normalizedLogoPath)}`;
  }

  saveConnectionLogo(connectionId, logoUpload = {}) {
    const fileName = String(logoUpload.fileName ?? "").trim();
    const mimeType = String(logoUpload.mimeType ?? "").trim().toLowerCase();
    const base64 = String(logoUpload.base64 ?? "").trim();
    const extension =
      CONNECTION_LOGO_EXTENSION_BY_MIME_TYPE[mimeType] ??
      CONNECTION_LOGO_EXTENSION_BY_FILE_EXTENSION[path.extname(fileName).toLowerCase()] ??
      null;

    if (!extension) {
      throw new ValidationError("Connection logos must be one of: .png, .jpg, .jpeg, .webp");
    }

    if (!base64) {
      throw new ValidationError("Connection logo upload is empty.");
    }

    const buffer = Buffer.from(base64, "base64");

    if (!buffer.length) {
      throw new ValidationError("Connection logo upload is empty.");
    }

    if (buffer.length > MAX_CONNECTION_LOGO_SIZE_BYTES) {
      throw new ValidationError("Connection logo must be 5 MB or smaller.");
    }

    const safeConnectionId = String(connectionId ?? "connection").replace(/[^a-zA-Z0-9_-]/g, "_");
    const storedFileName = `${safeConnectionId}-${Date.now()}.${extension}`;

    fs.writeFileSync(path.join(this.logoDirectory, storedFileName), buffer);

    return storedFileName;
  }

  deleteConnectionLogo(logoPath) {
    const normalizedLogoPath = this.normalizeLogoPath(logoPath);

    if (!normalizedLogoPath) {
      return;
    }

    fs.rmSync(path.join(this.logoDirectory, normalizedLogoPath), { force: true });
  }

  decorateConnection(connection = {}) {
    const logoPath = this.normalizeLogoPath(connection.logoPath);

    return {
      ...connection,
      readOnly: Boolean(connection.readOnly),
      logoPath,
      logoUrl: this.getConnectionLogoUrl(logoPath),
    };
  }

  normalizeLogoPath(logoPath) {
    const trimmedLogoPath = String(logoPath ?? "").trim();

    if (!trimmedLogoPath) {
      return null;
    }

    return path.basename(trimmedLogoPath);
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

  getMediaTaggingConfig(databaseKey) {
    const normalizedDatabaseKey = String(databaseKey ?? "").trim();

    if (!normalizedDatabaseKey) {
      return null;
    }

    const row = this.db
      .prepare(
        `
          SELECT
            tag_table,
            media_table,
            path_column,
            tagged_column,
            untagged_query,
            tagged_query,
            mapping_table,
            updated_at
          FROM media_tagging_config
          WHERE database_key = ?
        `
      )
      .get(normalizedDatabaseKey);

    if (!row) {
      return null;
    }

    return {
      config: structuredClone(this.buildMediaTaggingConfigRecord(row)),
      updatedAt: row.updated_at ?? null,
    };
  }

  setMediaTaggingConfig(databaseKey, config) {
    const normalizedDatabaseKey = String(databaseKey ?? "").trim();

    if (!normalizedDatabaseKey) {
      throw new ValidationError("Media tagging configuration requires a database key.");
    }

    const updatedAt = new Date().toISOString();
    const normalizedConfig = normalizeMediaTaggingConfigRecord(config);
    const values = [
      normalizedDatabaseKey,
      normalizedConfig.tagTable,
      normalizedConfig.mediaTable,
      normalizedConfig.pathColumn,
      normalizedConfig.taggedColumn,
      normalizedConfig.untaggedQuery,
      normalizedConfig.taggedQuery,
      normalizedConfig.mappingTable,
    ];
    const explicitColumns = [
      "database_key",
      ...MEDIA_TAGGING_CONFIG_FIELDS.map((field) => field.column),
    ];
    const assignments = MEDIA_TAGGING_CONFIG_FIELDS.map(
      (field) => `${field.column} = excluded.${field.column}`
    );

    if (this.mediaTaggingConfigHasLegacyJsonColumn) {
      explicitColumns.push("config_json");
      assignments.push("config_json = excluded.config_json");
      values.push(JSON.stringify(normalizedConfig));
    }

    explicitColumns.push("updated_at");
    assignments.push("updated_at = excluded.updated_at");
    values.push(updatedAt);

    this.db
      .prepare(
        `
          INSERT INTO media_tagging_config (${explicitColumns.join(", ")})
          VALUES (${explicitColumns.map(() => "?").join(", ")})
          ON CONFLICT(database_key) DO UPDATE SET
            ${assignments.join(",\n            ")}
        `
      )
      .run(...values);

    return this.getMediaTaggingConfig(normalizedDatabaseKey);
  }

  clearMediaTaggingConfig(databaseKey) {
    const normalizedDatabaseKey = String(databaseKey ?? "").trim();

    if (!normalizedDatabaseKey) {
      return false;
    }

    const result = this.db
      .prepare("DELETE FROM media_tagging_config WHERE database_key = ?")
      .run(normalizedDatabaseKey);

    return result.changes > 0;
  }
}

module.exports = {
  AppStateStore,
  DEFAULT_STATE,
};
