const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const Database = require("better-sqlite3");
const { ConflictError, NotFoundError, ValidationError } = require("../../utils/errors");
const {
  resolvePathInsideDirectory,
  resolveUserPath,
} = require("../../utils/fileValidation");
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
  settings: {
    defaultPageSize: 50,
    maxPageSize: 200,
    maxRecentConnections: 12,
    busyTimeoutMs: 5000,
    csvDelimiter: ",",
  },
};

const CONNECTION_LOGO_DIRECTORY = "db_logos";
const LEGACY_STATE_FILENAME = "app-state.json";
const STATE_DATABASE_FILENAME = "sqlite-hub-state.db";
const MAX_CONNECTION_LOGO_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_CONNECTION_TAG_NAME_LENGTH = 40;
const MAX_DOCUMENT_CONTENT_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_FILENAME_LENGTH = 160;
const QUERY_EXECUTION_SOURCES = new Set(["api", "cli", "user", "mcp"]);
const ACCESS_LOG_SOURCES = new Set(["api", "cli"]);
const ACCESS_LOG_STATUSES = new Set(["success", "error"]);
const MAX_ACCESS_LOG_TEXT_LENGTH = 500;
const MAX_ACCESS_LOG_METADATA_BYTES = 16 * 1024;
const ACTIVITY_LOG_KINDS = new Set(["all", "query", "access"]);
const ACTIVITY_LOG_ACTORS = new Set(["user", "cli", "api", "mcp"]);
const ACTIVITY_LOG_DESTRUCTIVE_FILTERS = new Set(["all", "yes", "no"]);
const REMOVED_SETTING_KEYS = new Set(["maxSqlHistory"]);
const CONNECTION_LOGO_EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function normalizeDocumentDatabaseKey(databaseKey) {
  const normalizedDatabaseKey = String(databaseKey ?? "").trim();

  if (!normalizedDatabaseKey) {
    throw new ValidationError("Database key is required.");
  }

  return normalizedDatabaseKey;
}

function normalizeDocumentId(documentId) {
  const normalizedDocumentId = String(documentId ?? "").trim();

  if (!normalizedDocumentId) {
    throw new ValidationError("Document id is required.");
  }

  return normalizedDocumentId;
}

function splitMarkdownFilename(filename) {
  const normalizedFilename = String(filename ?? "");
  const extensionMatch = normalizedFilename.match(/\.md$/i);

  if (!extensionMatch) {
    return {
      baseName: normalizedFilename,
      extension: ".md",
    };
  }

  return {
    baseName: normalizedFilename.slice(0, -extensionMatch[0].length),
    extension: normalizedFilename.slice(-extensionMatch[0].length),
  };
}

function normalizeDocumentFilename(value, fallback = "Untitled.md") {
  let filename = String(value ?? "").trim();

  if (!filename) {
    filename = fallback;
  }

  filename = filename
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .trim();

  if (!filename) {
    filename = fallback;
  }

  if (!/\.md$/i.test(filename)) {
    filename = `${filename}.md`;
  }

  if (filename.length > MAX_DOCUMENT_FILENAME_LENGTH) {
    const { baseName, extension } = splitMarkdownFilename(filename);
    filename = `${baseName.slice(0, MAX_DOCUMENT_FILENAME_LENGTH - extension.length)}${extension}`;
  }

  return filename;
}

function buildDocumentTitleFromFilename(filename) {
  const { baseName } = splitMarkdownFilename(filename);
  const title = baseName.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  return title || "Untitled";
}

function normalizeQueryExecutionSource(value, fallback = "user") {
  const normalized = String(value ?? fallback)
    .trim()
    .toLowerCase();

  return QUERY_EXECUTION_SOURCES.has(normalized) ? normalized : fallback;
}

function requireQueryExecutionSource(value) {
  const normalized = normalizeQueryExecutionSource(value, null);

  if (!normalized) {
    throw new ValidationError(`Unsupported query execution source: ${value}`);
  }

  return normalized;
}

function normalizeAccessLogText(value, fallback = null) {
  const normalized = String(value ?? fallback ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized.slice(0, MAX_ACCESS_LOG_TEXT_LENGTH) : null;
}

function requireAccessLogText(value, label) {
  const normalized = normalizeAccessLogText(value);

  if (!normalized) {
    throw new ValidationError(`${label} is required.`);
  }

  return normalized;
}

function normalizeAccessLogSource(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!ACCESS_LOG_SOURCES.has(normalized)) {
    throw new ValidationError(`Unsupported access log source: ${value}`);
  }

  return normalized;
}

function normalizeAccessLogStatus(value) {
  const normalized = String(value ?? "success").trim().toLowerCase();

  if (!ACCESS_LOG_STATUSES.has(normalized)) {
    throw new ValidationError(`Unsupported access log status: ${value}`);
  }

  return normalized;
}

function normalizeAccessLogInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : null;
}

function normalizeAccessLogMetadata(metadata = {}) {
  const safeMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};

  let serialized = "{}";

  try {
    serialized = JSON.stringify(safeMetadata, (_key, value) =>
      typeof value === "bigint" ? String(value) : value
    );
  } catch {
    serialized = JSON.stringify({ serializationError: true });
  }

  if (Buffer.byteLength(serialized, "utf8") <= MAX_ACCESS_LOG_METADATA_BYTES) {
    return serialized;
  }

  return JSON.stringify({
    truncated: true,
    originalBytes: Buffer.byteLength(serialized, "utf8"),
  });
}

function normalizeDocumentTitle(value, filename) {
  const title = String(value ?? "").trim();

  return title || buildDocumentTitleFromFilename(filename);
}

function normalizeDocumentContent(value) {
  const content = String(value ?? "");
  const byteLength = Buffer.byteLength(content, "utf8");

  if (byteLength > MAX_DOCUMENT_CONTENT_BYTES) {
    throw new ValidationError("Document content is too large.", {
      details: {
        maxBytes: MAX_DOCUMENT_CONTENT_BYTES,
        actualBytes: byteLength,
      },
    });
  }

  return content;
}
const CONNECTION_LOGO_EXTENSION_BY_FILE_EXTENSION = {
  ".jpeg": "jpg",
  ".jpg": "jpg",
  ".png": "png",
  ".webp": "webp",
};

function normalizeConnectionTagName(value) {
  const normalizedName = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();

  if (!normalizedName) {
    throw new ValidationError("Tag name is required.");
  }

  if (normalizedName.length > MAX_CONNECTION_TAG_NAME_LENGTH) {
    throw new ValidationError(
      `Tag name must be ${MAX_CONNECTION_TAG_NAME_LENGTH} characters or fewer.`
    );
  }

  return normalizedName;
}

function normalizeConnectionTagNames(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  const namesByKey = new Map();

  for (const value of values) {
    const name = normalizeConnectionTagName(value);
    const key = name.toLowerCase();

    if (!namesByKey.has(key)) {
      namesByKey.set(key, name);
    }
  }

  return [...namesByKey.values()];
}

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

function normalizeStateStorePath(filePath, label) {
  return resolveUserPath(filePath, { label });
}

function normalizeLegacyFilePath(filePath, { currentFilePath, expectedFileName, label }) {
  if (!filePath) {
    return null;
  }

  const resolvedPath = normalizeStateStorePath(filePath, label);

  if (resolvedPath === currentFilePath || path.basename(resolvedPath) !== expectedFileName) {
    return null;
  }

  return resolvedPath;
}

function normalizeLegacyDatabasePaths(legacyDatabasePaths, currentFilePath) {
  if (!Array.isArray(legacyDatabasePaths)) {
    return [];
  }

  const normalizedPaths = legacyDatabasePaths
    .map((legacyPath) =>
      normalizeLegacyFilePath(legacyPath, {
        currentFilePath,
        expectedFileName: STATE_DATABASE_FILENAME,
        label: "Legacy app state database path",
      })
    )
    .filter(Boolean);

  return normalizedPaths.filter(
    (legacyPath, index, legacyPaths) => legacyPaths.indexOf(legacyPath) === index
  );
}

function readUtf8File(fileUrl) {
  const fileHandle = fs.openSync(fileUrl, "r");

  try {
    const fileSize = fs.fstatSync(fileHandle).size;
    const buffer = Buffer.alloc(fileSize);
    fs.readSync(fileHandle, buffer, 0, buffer.length, 0);
    return buffer.toString("utf8");
  } finally {
    fs.closeSync(fileHandle);
  }
}

function pickLatestTimestamp(...timestamps) {
  return timestamps.reduce((latest, timestamp) => {
    const normalizedTimestamp = String(timestamp ?? "").trim();

    if (!normalizedTimestamp) {
      return latest;
    }

    const timestampMs = Date.parse(normalizedTimestamp);

    if (!Number.isFinite(timestampMs)) {
      return latest ?? normalizedTimestamp;
    }

    const latestMs = Date.parse(latest ?? "");

    if (!latest || !Number.isFinite(latestMs) || timestampMs > latestMs) {
      return normalizedTimestamp;
    }

    return latest;
  }, null);
}

class AppStateStore {
  constructor(filePath, options = {}) {
    this.filePath = normalizeStateStorePath(filePath, "App state database path");
    this.stateDirectory = path.dirname(this.filePath);
    this.logoDirectory = resolvePathInsideDirectory(
      this.stateDirectory,
      CONNECTION_LOGO_DIRECTORY,
      "Connection logo directory"
    );
    this.legacyFilePath = normalizeLegacyFilePath(options.legacyFilePath, {
      currentFilePath: this.filePath,
      expectedFileName: LEGACY_STATE_FILENAME,
      label: "Legacy app state path",
    });
    this.legacyFileUrl = this.legacyFilePath
      ? pathToFileURL(this.legacyFilePath)
      : null;
    this.legacyDatabasePaths = normalizeLegacyDatabasePaths(
      options.legacyDatabasePaths,
      this.filePath
    );
    this.isFreshDatabase = !fs.existsSync(this.filePath);

    fs.mkdirSync(this.stateDirectory, { recursive: true });
    fs.mkdirSync(this.logoDirectory, { recursive: true });

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
        readOnly INTEGER NOT NULL DEFAULT 0,
        logoPath TEXT
      );

      DROP INDEX IF EXISTS idx_sql_history_executed_at;

      DROP TABLE IF EXISTS sql_history;

      DELETE FROM settings
      WHERE key = 'maxSqlHistory';

      CREATE INDEX IF NOT EXISTS idx_recent_connections_last_opened
      ON recent_connections(lastOpenedAt DESC, id ASC);

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS connection_tags (
        connectionId TEXT NOT NULL,
        tagId INTEGER NOT NULL,
        PRIMARY KEY (connectionId, tagId),
        FOREIGN KEY (connectionId)
          REFERENCES recent_connections(id)
          ON UPDATE CASCADE
          ON DELETE CASCADE,
        FOREIGN KEY (tagId)
          REFERENCES tags(id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_connection_tags_tag
      ON connection_tags(tagId, connectionId);

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
        executed_by TEXT NOT NULL DEFAULT 'user' CHECK(executed_by IN ('api', 'cli', 'user', 'mcp')),
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

      CREATE TABLE IF NOT EXISTS database_documents (
        id TEXT PRIMARY KEY,
        database_key TEXT NOT NULL,
        title TEXT NOT NULL,
        filename TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(database_key, filename)
      );

      CREATE INDEX IF NOT EXISTS idx_database_documents_database_updated
      ON database_documents(database_key, updated_at DESC, id ASC);

      CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        database_key TEXT NOT NULL,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        token_prefix TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_api_tokens_database_created
      ON api_tokens(database_key, created_at DESC, id ASC);

      CREATE TABLE IF NOT EXISTS access_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL CHECK(source IN ('api', 'cli')),
        action TEXT NOT NULL,
        database_key TEXT,
        target_type TEXT,
        target_name TEXT,
        status TEXT NOT NULL CHECK(status IN ('success', 'error')),
        started_at TEXT NOT NULL,
        duration_ms INTEGER,
        error_message TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_access_log_started
      ON access_log(started_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_access_log_source_started
      ON access_log(source, started_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_access_log_database_started
      ON access_log(database_key, started_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        connectionId TEXT,
        name TEXT NOT NULL,
        notes TEXT,
        path TEXT NOT NULL,
        sizeBytes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'creating'
          CHECK(status IN ('creating', 'verifying', 'verified', 'failed', 'restoring')),
        type TEXT NOT NULL DEFAULT 'manual'
          CHECK(type IN (
            'manual',
            'automatic',
            'pre_restore',
            'pre_migration',
            'pre_import',
            'pre_schema_change'
          )),
        sourcePath TEXT NOT NULL,
        sourceLabel TEXT,
        sqliteHubVersion TEXT,
        sqliteVersion TEXT,
        journalMode TEXT,
        schemaVersion INTEGER,
        tableCount INTEGER,
        rowCount INTEGER,
        checksumSha256 TEXT,
        createdAt TEXT NOT NULL,
        verifiedAt TEXT,
        lastRestoredAt TEXT,
        errorMessage TEXT,
        FOREIGN KEY (connectionId)
          REFERENCES recent_connections(id)
          ON UPDATE CASCADE
          ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_backups_connection_created
      ON backups(connectionId, createdAt DESC);

      CREATE INDEX IF NOT EXISTS idx_backups_status
      ON backups(status);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_backups_path
      ON backups(path);
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

    this.ensureQueryRunsSchema();
    this.ensureMediaTaggingConfigSchema();
  }

  ensureQueryRunsSchema() {
    const queryRunColumns = new Set(
      this.db
        .prepare("PRAGMA table_info(query_runs)")
        .all()
        .map((column) => column.name)
    );

    if (!queryRunColumns.has("executed_by")) {
      this.db.exec(`
        ALTER TABLE query_runs
        ADD COLUMN executed_by TEXT NOT NULL DEFAULT 'user'
        CHECK(executed_by IN ('api', 'cli', 'user', 'mcp'))
      `);
    }
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
    const raw = readUtf8File(this.legacyFileUrl);
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
      .filter(
        (legacyPath, index, legacyPaths) =>
          legacyPath !== this.filePath &&
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
      const logoPathSelection = recentConnectionColumns.has("logoPath")
        ? "logoPath"
        : "NULL AS logoPath";

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
              .prepare(
                [
                  "SELECT",
                  [
                    "id",
                    "label",
                    "path",
                    "lastOpenedAt",
                    "lastModifiedAt",
                    "sizeBytes",
                    "readOnly",
                    logoPathSelection,
                  ].join(", "),
                  "FROM recent_connections",
                  "ORDER BY lastOpenedAt DESC, id ASC",
                ].join(" ")
              )
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

    this.db.transaction(() => {
      for (const [key, value] of Object.entries(legacyState.settings ?? {})) {
        if (REMOVED_SETTING_KEYS.has(key)) {
          continue;
        }

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

  getJsonMetaValue(key, fallback = null) {
    const value = this.getMetaValue(key);

    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  setJsonMetaValue(key, value) {
    this.setMetaValue(key, JSON.stringify(value ?? null));
  }

  getMcpStatus(defaultStatus = {}) {
    const storedStatus = this.getJsonMetaValue("mcpStatus", {});
    return {
      ...defaultStatus,
      ...(storedStatus && typeof storedStatus === "object" && !Array.isArray(storedStatus)
        ? storedStatus
        : {}),
    };
  }

  setMcpStatus(status, defaultStatus = {}) {
    const nextStatus = {
      ...defaultStatus,
      ...(status && typeof status === "object" && !Array.isArray(status) ? status : {}),
    };

    this.setJsonMetaValue("mcpStatus", nextStatus);
    return nextStatus;
  }

  patchMcpStatus(patch, defaultStatus = {}) {
    return this.setMcpStatus(
      {
        ...this.getMcpStatus(defaultStatus),
        ...(patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {}),
      },
      defaultStatus
    );
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
      executedBy: normalizeQueryExecutionSource(row.executed_by ?? row.executedBy),
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
            executed_by: row.last_run_executed_by ?? row.lastRunExecutedBy,
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
    const queryHistoryRowsSql = [
      `
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
          latest.executed_by AS last_run_executed_by,
          latest.duration_ms AS last_run_duration_ms,
          latest.row_count AS last_run_row_count,
          latest.status AS last_run_status,
          latest.error_message AS last_run_error_message,
          latest.affected_rows AS last_run_affected_rows
      `,
      baseFromSql,
      whereSql,
      orderBySql,
      "LIMIT ?",
      "OFFSET ?",
    ].join("\n");
    const rows = this.db
      .prepare(queryHistoryRowsSql)
      .all(...params, normalizedLimit, normalizedOffset)
      .map((row) => this.decorateQueryHistoryRow(row));
    const queryHistoryCountSql = [
      "SELECT COUNT(*) AS count",
      baseFromSql,
      whereSql,
    ].join("\n");
    const countRow = this.db
      .prepare(queryHistoryCountSql)
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
    executedBy = "user",
  } = {}) {
    const normalizedDatabaseKey = this.normalizeQueryHistoryText(databaseKey);
    const normalizedRawSql = String(rawSql ?? "");
    const normalizedSql = normalizeSql(normalizedRawSql);
    const normalizedExecutedBy = requireQueryExecutionSource(executedBy);

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
          affected_rows,
          executed_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        historyId,
        timestamp,
        this.normalizeQueryHistoryInteger(durationMs),
        this.normalizeQueryHistoryInteger(rowCount),
        status,
        this.normalizeQueryHistoryText(errorMessage),
        this.normalizeQueryHistoryInteger(affectedRows),
        normalizedExecutedBy
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
          latest.executed_by AS last_run_executed_by,
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
          latest.executed_by AS last_run_executed_by,
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
          latest.executed_by AS last_run_executed_by,
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
          executed_by,
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

  decorateAccessLogRow(row = {}) {
    let metadata = {};

    try {
      metadata = JSON.parse(row.metadata_json ?? row.metadataJson ?? "{}");
    } catch {
      metadata = {};
    }

    return {
      id: Number(row.id ?? 0),
      source: String(row.source ?? ""),
      action: String(row.action ?? ""),
      databaseKey: row.database_key ?? row.databaseKey ?? null,
      targetType: row.target_type ?? row.targetType ?? null,
      targetName: row.target_name ?? row.targetName ?? null,
      status: String(row.status ?? ""),
      startedAt: row.started_at ?? row.startedAt ?? null,
      durationMs:
        row.duration_ms === null || row.duration_ms === undefined
          ? null
          : Number(row.duration_ms),
      errorMessage: row.error_message ?? row.errorMessage ?? null,
      metadata,
    };
  }

  recordAccessLog(entry = {}) {
    const source = normalizeAccessLogSource(entry.source);
    const action = requireAccessLogText(entry.action, "Access log action");
    const databaseKey = normalizeAccessLogText(entry.databaseKey);
    const targetType = normalizeAccessLogText(entry.targetType);
    const targetName = normalizeAccessLogText(entry.targetName);
    const status = normalizeAccessLogStatus(entry.status);
    const startedAt = normalizeAccessLogText(entry.startedAt) ?? new Date().toISOString();
    const durationMs = normalizeAccessLogInteger(entry.durationMs);
    const errorMessage = normalizeAccessLogText(entry.errorMessage);
    const metadataJson = normalizeAccessLogMetadata(entry.metadata);

    const result = this.db
      .prepare(`
        INSERT INTO access_log (
          source,
          action,
          database_key,
          target_type,
          target_name,
          status,
          started_at,
          duration_ms,
          error_message,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        source,
        action,
        databaseKey,
        targetType,
        targetName,
        status,
        startedAt,
        durationMs,
        errorMessage,
        metadataJson
      );

    return this.getAccessLogEntry(result.lastInsertRowid);
  }

  getAccessLogEntry(logId) {
    const row = this.db
      .prepare(`
        SELECT
          id,
          source,
          action,
          database_key,
          target_type,
          target_name,
          status,
          started_at,
          duration_ms,
          error_message,
          metadata_json
        FROM access_log
        WHERE id = ?
      `)
      .get(Number(logId));

    if (!row) {
      throw new NotFoundError(`Access log entry not found: ${logId}`);
    }

    return this.decorateAccessLogRow(row);
  }

  listAccessLogs(options = {}) {
    const filters = [];
    const params = [];
    const source = options.source ? normalizeAccessLogSource(options.source) : null;
    const status = options.status ? normalizeAccessLogStatus(options.status) : null;
    const databaseKey = normalizeAccessLogText(options.databaseKey);
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 100));
    const offset = Math.max(0, Number(options.offset) || 0);

    if (source) {
      filters.push("source = ?");
      params.push(source);
    }

    if (status) {
      filters.push("status = ?");
      params.push(status);
    }

    if (databaseKey) {
      filters.push("database_key = ?");
      params.push(databaseKey);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`
        SELECT
          id,
          source,
          action,
          database_key,
          target_type,
          target_name,
          status,
          started_at,
          duration_ms,
          error_message,
          metadata_json
        FROM access_log
        ${whereClause}
        ORDER BY started_at DESC, id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset)
      .map((row) => this.decorateAccessLogRow(row));
    const total = Number(
      this.db
        .prepare(`SELECT COUNT(*) AS count FROM access_log ${whereClause}`)
        .get(...params)?.count ?? 0
    );

    return {
      items: rows,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  normalizeActivityLogKind(value) {
    const normalized = String(value ?? "all").trim().toLowerCase();
    return ACTIVITY_LOG_KINDS.has(normalized) ? normalized : "all";
  }

  normalizeActivityLogActor(value) {
    const normalized = String(value ?? "all").trim().toLowerCase();
    return ACTIVITY_LOG_ACTORS.has(normalized) ? normalized : null;
  }

  normalizeActivityLogDestructive(value) {
    const normalized = String(value ?? "all").trim().toLowerCase();
    return ACTIVITY_LOG_DESTRUCTIVE_FILTERS.has(normalized) ? normalized : "all";
  }

  normalizeActivityLogTimestamp(value) {
    const normalized = normalizeAccessLogText(value);

    if (!normalized) {
      return null;
    }

    const timestamp = new Date(normalized).getTime();
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }

  decorateQueryRunLogRow(row = {}) {
    let tablesDetected = [];

    try {
      tablesDetected = JSON.parse(row.tables_detected ?? "[]");
    } catch {
      tablesDetected = [];
    }

    return {
      id: `query:${Number(row.run_id ?? 0)}`,
      kind: "query",
      source: "query_history",
      action: "query.execute",
      databaseKey: row.database_key ?? null,
      targetType: "query",
      targetName: row.title || buildAutoTitle(row.raw_sql ?? "", {
        queryType: row.query_type ?? "other",
        tablesDetected,
      }),
      status: String(row.status ?? ""),
      occurredAt: row.executed_at ?? null,
      durationMs:
        row.duration_ms === null || row.duration_ms === undefined
          ? null
          : Number(row.duration_ms),
      errorMessage: row.error_message ?? null,
      executedBy: normalizeQueryExecutionSource(row.executed_by ?? "user"),
      queryType: row.query_type ?? "other",
      destructive: Boolean(row.is_destructive),
      historyId: Number(row.history_id ?? 0),
      runId: Number(row.run_id ?? 0),
      rowCount:
        row.row_count === null || row.row_count === undefined
          ? null
          : Number(row.row_count),
      affectedRows:
        row.affected_rows === null || row.affected_rows === undefined
          ? null
          : Number(row.affected_rows),
      preview: buildSqlPreview(row.raw_sql ?? ""),
      rawSql: row.raw_sql ?? "",
      metadata: {
        tablesDetected,
        saved: Boolean(row.is_saved),
        favorite: Boolean(row.is_favorite),
      },
    };
  }

  decorateAccessLogForActivity(row = {}) {
    const entry = this.decorateAccessLogRow(row);

    return {
      id: `access:${entry.id}`,
      kind: "access",
      source: entry.source,
      action: entry.action,
      databaseKey: entry.databaseKey,
      targetType: entry.targetType,
      targetName: entry.targetName,
      status: entry.status,
      occurredAt: entry.startedAt,
      durationMs: entry.durationMs,
      errorMessage: entry.errorMessage,
      executedBy: null,
      queryType: null,
      destructive: null,
      historyId: null,
      runId: null,
      rowCount: null,
      affectedRows: null,
      preview: entry.action,
      rawSql: "",
      metadata: entry.metadata,
    };
  }

  buildActivityQueryFilters(options = {}) {
    const filters = [];
    const params = [];
    const databaseKey = normalizeAccessLogText(options.databaseKey);
    const status = options.status ? normalizeAccessLogStatus(options.status) : null;
    const actor = this.normalizeActivityLogActor(options.actor);
    const queryType = normalizeAccessLogText(options.queryType);
    const destructive = this.normalizeActivityLogDestructive(options.destructive);
    const from = this.normalizeActivityLogTimestamp(options.from);
    const to = this.normalizeActivityLogTimestamp(options.to);
    const search = normalizeAccessLogText(options.search);

    if (databaseKey) {
      filters.push("q.database_key = ?");
      params.push(databaseKey);
    }

    if (status) {
      filters.push("runs.status = ?");
      params.push(status);
    }

    if (actor) {
      filters.push("runs.executed_by = ?");
      params.push(actor);
    }

    if (queryType) {
      filters.push("q.query_type = ?");
      params.push(queryType);
    }

    if (destructive === "yes") {
      filters.push("q.is_destructive = 1");
    } else if (destructive === "no") {
      filters.push("q.is_destructive = 0");
    }

    if (from) {
      filters.push("runs.executed_at >= ?");
      params.push(from);
    }

    if (to) {
      filters.push("runs.executed_at <= ?");
      params.push(to);
    }

    if (search) {
      const searchPattern = `%${search.toLowerCase()}%`;
      filters.push(`
        (
          LOWER(COALESCE(q.title, '')) LIKE ?
          OR LOWER(q.raw_sql) LIKE ?
          OR LOWER(COALESCE(q.notes, '')) LIKE ?
          OR LOWER(q.tables_detected) LIKE ?
          OR LOWER(COALESCE(runs.error_message, '')) LIKE ?
        )
      `);
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    return {
      whereSql: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
      params,
    };
  }

  buildActivityAccessFilters(options = {}) {
    const filters = [];
    const params = [];
    const databaseKey = normalizeAccessLogText(options.databaseKey);
    const status = options.status ? normalizeAccessLogStatus(options.status) : null;
    const actor = this.normalizeActivityLogActor(options.actor);
    const queryType = normalizeAccessLogText(options.queryType);
    const destructive = this.normalizeActivityLogDestructive(options.destructive);
    const from = this.normalizeActivityLogTimestamp(options.from);
    const to = this.normalizeActivityLogTimestamp(options.to);
    const search = normalizeAccessLogText(options.search);

    if (queryType || destructive !== "all") {
      return {
        whereSql: "WHERE 1 = 0",
        params: [],
      };
    }

    if (databaseKey) {
      filters.push("database_key = ?");
      params.push(databaseKey);
    }

    if (status) {
      filters.push("status = ?");
      params.push(status);
    }

    if (actor) {
      if (actor !== "api" && actor !== "cli") {
        return {
          whereSql: "WHERE 1 = 0",
          params: [],
        };
      }

      filters.push("source = ?");
      params.push(actor);
    }

    if (from) {
      filters.push("started_at >= ?");
      params.push(from);
    }

    if (to) {
      filters.push("started_at <= ?");
      params.push(to);
    }

    if (search) {
      const searchPattern = `%${search.toLowerCase()}%`;
      filters.push(`
        (
          LOWER(action) LIKE ?
          OR LOWER(COALESCE(target_type, '')) LIKE ?
          OR LOWER(COALESCE(target_name, '')) LIKE ?
          OR LOWER(COALESCE(error_message, '')) LIKE ?
          OR LOWER(metadata_json) LIKE ?
        )
      `);
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    return {
      whereSql: filters.length ? `WHERE ${filters.join(" AND ")}` : "",
      params,
    };
  }

  listQueryRunLogs(options = {}) {
    const { whereSql, params } = this.buildActivityQueryFilters(options);

    return {
      items: this.db
        .prepare(`
          SELECT
            runs.id AS run_id,
            runs.history_id,
            runs.executed_at,
            runs.executed_by,
            runs.duration_ms,
            runs.row_count,
            runs.status,
            runs.error_message,
            runs.affected_rows,
            q.database_key,
            q.raw_sql,
            q.title,
            q.notes,
            q.query_type,
            q.tables_detected,
            q.is_favorite,
            q.is_saved,
            q.is_destructive
          FROM query_runs runs
          INNER JOIN query_history q
            ON q.id = runs.history_id
          ${whereSql}
          ORDER BY runs.executed_at DESC, runs.id DESC
        `)
        .all(...params)
        .map((row) => this.decorateQueryRunLogRow(row)),
      total: Number(
        this.db
          .prepare(`
            SELECT COUNT(*) AS count
            FROM query_runs runs
            INNER JOIN query_history q
              ON q.id = runs.history_id
            ${whereSql}
          `)
          .get(...params)?.count ?? 0
      ),
    };
  }

  listAccessActivityLogs(options = {}) {
    const { whereSql, params } = this.buildActivityAccessFilters(options);

    return {
      items: this.db
        .prepare(`
          SELECT
            id,
            source,
            action,
            database_key,
            target_type,
            target_name,
            status,
            started_at,
            duration_ms,
            error_message,
            metadata_json
          FROM access_log
          ${whereSql}
          ORDER BY started_at DESC, id DESC
        `)
        .all(...params)
        .map((row) => this.decorateAccessLogForActivity(row)),
      total: Number(
        this.db
          .prepare(`SELECT COUNT(*) AS count FROM access_log ${whereSql}`)
          .get(...params)?.count ?? 0
      ),
    };
  }

  listActivityLogs(options = {}) {
    const kind = this.normalizeActivityLogKind(options.kind);
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 100));
    const offset = Math.max(0, Number(options.offset) || 0);
    const queryLogs =
      kind === "access"
        ? { items: [], total: 0 }
        : this.listQueryRunLogs(options);
    const accessLogs =
      kind === "query"
        ? { items: [], total: 0 }
        : this.listAccessActivityLogs(options);
    const allItems = [...queryLogs.items, ...accessLogs.items].sort((left, right) => {
      const leftTime = Date.parse(left.occurredAt ?? "") || 0;
      const rightTime = Date.parse(right.occurredAt ?? "") || 0;

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return String(right.id).localeCompare(String(left.id));
    });
    const items = allItems.slice(offset, offset + limit);
    const total = queryLogs.total + accessLogs.total;

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
      filters: {
        kind,
        actor: this.normalizeActivityLogActor(options.actor) ?? "all",
        status: options.status ? normalizeAccessLogStatus(options.status) : "all",
        databaseKey: normalizeAccessLogText(options.databaseKey),
        queryType: normalizeAccessLogText(options.queryType) ?? "all",
        destructive: this.normalizeActivityLogDestructive(options.destructive),
        from: this.normalizeActivityLogTimestamp(options.from),
        to: this.normalizeActivityLogTimestamp(options.to),
        search: normalizeAccessLogText(options.search) ?? "",
      },
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
      const excludeChartClause = excludeChartId ? "AND id != ?" : "";
      const row = this.db
        .prepare(
          [
            "SELECT id",
            "FROM query_history_chart",
            "WHERE query_history_id = ?",
            "AND name = ?",
            excludeChartClause,
            "LIMIT 1",
          ]
            .filter(Boolean)
            .join(" ")
        )
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

  decorateBackupRow(row = {}) {
    return {
      id: String(row.id ?? ""),
      connectionId: this.normalizeQueryHistoryText(row.connectionId),
      name: String(row.name ?? ""),
      notes: this.normalizeQueryHistoryText(row.notes),
      path: String(row.path ?? ""),
      sizeBytes: Number(row.sizeBytes ?? 0),
      status: String(row.status ?? "creating"),
      type: String(row.type ?? "manual"),
      sourcePath: String(row.sourcePath ?? ""),
      sourceLabel: this.normalizeQueryHistoryText(row.sourceLabel),
      sqliteHubVersion: this.normalizeQueryHistoryText(row.sqliteHubVersion),
      sqliteVersion: this.normalizeQueryHistoryText(row.sqliteVersion),
      journalMode: this.normalizeQueryHistoryText(row.journalMode),
      schemaVersion: this.normalizeQueryHistoryInteger(row.schemaVersion),
      tableCount: this.normalizeQueryHistoryInteger(row.tableCount),
      rowCount: this.normalizeQueryHistoryInteger(row.rowCount),
      checksumSha256: this.normalizeQueryHistoryText(row.checksumSha256),
      createdAt: row.createdAt ?? null,
      verifiedAt: row.verifiedAt ?? null,
      lastRestoredAt: row.lastRestoredAt ?? null,
      errorMessage: this.normalizeQueryHistoryText(row.errorMessage),
    };
  }

  listBackups({ connectionId = null, includeAll = false } = {}) {
    const normalizedConnectionId = this.normalizeQueryHistoryText(connectionId);
    const whereSql = includeAll || !normalizedConnectionId ? "" : "WHERE connectionId = ?";
    const params = includeAll || !normalizedConnectionId ? [] : [normalizedConnectionId];

    return this.db
      .prepare(
        `
          SELECT
            id,
            connectionId,
            name,
            notes,
            path,
            sizeBytes,
            status,
            type,
            sourcePath,
            sourceLabel,
            sqliteHubVersion,
            sqliteVersion,
            journalMode,
            schemaVersion,
            tableCount,
            rowCount,
            checksumSha256,
            createdAt,
            verifiedAt,
            lastRestoredAt,
            errorMessage
          FROM backups
          ${whereSql}
          ORDER BY createdAt DESC, id ASC
        `
      )
      .all(...params)
      .map((row) => this.decorateBackupRow(row));
  }

  listBackupsByDirectory(directoryPath) {
    const normalizedDirectory = String(directoryPath ?? "").trim();

    if (!normalizedDirectory) {
      return [];
    }

    return this.db
      .prepare(
        `
          SELECT
            id,
            connectionId,
            name,
            notes,
            path,
            sizeBytes,
            status,
            type,
            sourcePath,
            sourceLabel,
            sqliteHubVersion,
            sqliteVersion,
            journalMode,
            schemaVersion,
            tableCount,
            rowCount,
            checksumSha256,
            createdAt,
            verifiedAt,
            lastRestoredAt,
            errorMessage
          FROM backups
          WHERE path LIKE ?
          ORDER BY createdAt DESC, id ASC
        `
      )
      .all(`${normalizedDirectory}%`)
      .map((row) => this.decorateBackupRow(row));
  }

  getBackup(backupId) {
    const id = String(backupId ?? "").trim();

    if (!id) {
      return null;
    }

    const row = this.db
      .prepare(
        `
          SELECT
            id,
            connectionId,
            name,
            notes,
            path,
            sizeBytes,
            status,
            type,
            sourcePath,
            sourceLabel,
            sqliteHubVersion,
            sqliteVersion,
            journalMode,
            schemaVersion,
            tableCount,
            rowCount,
            checksumSha256,
            createdAt,
            verifiedAt,
            lastRestoredAt,
            errorMessage
          FROM backups
          WHERE id = ?
        `
      )
      .get(id);

    return row ? this.decorateBackupRow(row) : null;
  }

  createBackupRecord(record = {}) {
    this.db
      .prepare(
        `
          INSERT INTO backups (
            id,
            connectionId,
            name,
            notes,
            path,
            sizeBytes,
            status,
            type,
            sourcePath,
            sourceLabel,
            sqliteHubVersion,
            sqliteVersion,
            journalMode,
            schemaVersion,
            tableCount,
            rowCount,
            checksumSha256,
            createdAt,
            verifiedAt,
            lastRestoredAt,
            errorMessage
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.id,
        this.normalizeQueryHistoryText(record.connectionId),
        String(record.name ?? "Backup").trim() || "Backup",
        this.normalizeQueryHistoryText(record.notes),
        String(record.path ?? "").trim(),
        Number(record.sizeBytes ?? 0),
        record.status ?? "creating",
        record.type ?? "manual",
        String(record.sourcePath ?? "").trim(),
        this.normalizeQueryHistoryText(record.sourceLabel),
        this.normalizeQueryHistoryText(record.sqliteHubVersion),
        this.normalizeQueryHistoryText(record.sqliteVersion),
        this.normalizeQueryHistoryText(record.journalMode),
        this.normalizeQueryHistoryInteger(record.schemaVersion),
        this.normalizeQueryHistoryInteger(record.tableCount),
        this.normalizeQueryHistoryInteger(record.rowCount),
        this.normalizeQueryHistoryText(record.checksumSha256),
        record.createdAt ?? new Date().toISOString(),
        record.verifiedAt ?? null,
        record.lastRestoredAt ?? null,
        this.normalizeQueryHistoryText(record.errorMessage)
      );

    return this.getBackup(record.id);
  }

  updateBackupRecord(backupId, changes = {}) {
    const backup = this.getBackup(backupId);

    if (!backup) {
      throw new NotFoundError(`Backup not found: ${backupId}`);
    }

    const next = {
      ...backup,
      ...changes,
    };

    this.db
      .prepare(
        `
          UPDATE backups
          SET
            connectionId = ?,
            name = ?,
            notes = ?,
            path = ?,
            sizeBytes = ?,
            status = ?,
            type = ?,
            sourcePath = ?,
            sourceLabel = ?,
            sqliteHubVersion = ?,
            sqliteVersion = ?,
            journalMode = ?,
            schemaVersion = ?,
            tableCount = ?,
            rowCount = ?,
            checksumSha256 = ?,
            verifiedAt = ?,
            lastRestoredAt = ?,
            errorMessage = ?
          WHERE id = ?
        `
      )
      .run(
        this.normalizeQueryHistoryText(next.connectionId),
        String(next.name ?? "Backup").trim() || "Backup",
        this.normalizeQueryHistoryText(next.notes),
        String(next.path ?? "").trim(),
        Number(next.sizeBytes ?? 0),
        next.status ?? "creating",
        next.type ?? "manual",
        String(next.sourcePath ?? "").trim(),
        this.normalizeQueryHistoryText(next.sourceLabel),
        this.normalizeQueryHistoryText(next.sqliteHubVersion),
        this.normalizeQueryHistoryText(next.sqliteVersion),
        this.normalizeQueryHistoryText(next.journalMode),
        this.normalizeQueryHistoryInteger(next.schemaVersion),
        this.normalizeQueryHistoryInteger(next.tableCount),
        this.normalizeQueryHistoryInteger(next.rowCount),
        this.normalizeQueryHistoryText(next.checksumSha256),
        next.verifiedAt ?? null,
        next.lastRestoredAt ?? null,
        this.normalizeQueryHistoryText(next.errorMessage),
        backup.id
      );

    return this.getBackup(backup.id);
  }

  deleteBackupRecord(backupId) {
    const backup = this.getBackup(backupId);

    if (!backup) {
      throw new NotFoundError(`Backup not found: ${backupId}`);
    }

    this.db.prepare("DELETE FROM backups WHERE id = ?").run(backup.id);
    return backup;
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

  getState() {
    return structuredClone({
      recentConnections: this.getRecentConnections(),
      activeConnectionId: this.getActiveConnectionId(),
      settings: this.getSettings(),
    });
  }

  decorateConnectionTag(row = {}) {
    return {
      id: Number(row.id),
      name: String(row.name ?? ""),
      createdAt: row.createdAt ?? null,
      updatedAt: row.updatedAt ?? null,
      ...(row.connectionCount === undefined
        ? {}
        : { connectionCount: Number(row.connectionCount ?? 0) }),
    };
  }

  getConnectionTagsByConnectionIds(connectionIds = []) {
    const ids = connectionIds
      .map((id) => String(id ?? "").trim())
      .filter(Boolean)
      .filter((id, index, values) => values.indexOf(id) === index);

    if (!ids.length) {
      return new Map();
    }

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
          SELECT
            ct.connectionId,
            t.id,
            t.name,
            t.createdAt,
            t.updatedAt
          FROM connection_tags ct
          INNER JOIN tags t
            ON t.id = ct.tagId
          WHERE ct.connectionId IN (${placeholders})
          ORDER BY t.name COLLATE NOCASE ASC, t.id ASC
        `
      )
      .all(...ids);
    const tagsByConnectionId = new Map(ids.map((id) => [id, []]));

    for (const row of rows) {
      tagsByConnectionId
        .get(row.connectionId)
        ?.push(this.decorateConnectionTag(row));
    }

    return tagsByConnectionId;
  }

  getConnectionTags(connectionId) {
    const normalizedConnectionId = String(connectionId ?? "").trim();

    if (!normalizedConnectionId) {
      return [];
    }

    return this.getConnectionTagsByConnectionIds([normalizedConnectionId]).get(
      normalizedConnectionId
    ) ?? [];
  }

  listConnectionTags() {
    return this.db
      .prepare(
        `
          SELECT
            t.id,
            t.name,
            t.createdAt,
            t.updatedAt,
            COUNT(ct.connectionId) AS connectionCount
          FROM tags t
          LEFT JOIN connection_tags ct
            ON ct.tagId = t.id
          GROUP BY t.id
          ORDER BY t.name COLLATE NOCASE ASC, t.id ASC
        `
      )
      .all()
      .map((row) => this.decorateConnectionTag(row));
  }

  getConnectionTagById(tagId) {
    const row = this.db
      .prepare(
        `
          SELECT id, name, createdAt, updatedAt
          FROM tags
          WHERE id = ?
        `
      )
      .get(Number(tagId));

    return row ? this.decorateConnectionTag(row) : null;
  }

  getConnectionTagByName(name) {
    const normalizedName = normalizeConnectionTagName(name);
    const row = this.db
      .prepare(
        `
          SELECT id, name, createdAt, updatedAt
          FROM tags
          WHERE name = ? COLLATE NOCASE
        `
      )
      .get(normalizedName);

    return row ? this.decorateConnectionTag(row) : null;
  }

  getOrCreateConnectionTag(name) {
    const normalizedName = normalizeConnectionTagName(name);
    const existingTag = this.getConnectionTagByName(normalizedName);

    if (existingTag) {
      return existingTag;
    }

    const timestamp = new Date().toISOString();
    const result = this.db
      .prepare(
        `
          INSERT INTO tags (name, createdAt, updatedAt)
          VALUES (?, ?, ?)
        `
      )
      .run(normalizedName, timestamp, timestamp);

    return this.getConnectionTagById(result.lastInsertRowid);
  }

  getRecentConnections() {
    const rows = this.db
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
      .all();
    const tagsByConnectionId = this.getConnectionTagsByConnectionIds(
      rows.map((connection) => connection.id)
    );

    return rows.map((connection) =>
      this.decorateConnection(
        connection,
        tagsByConnectionId.get(connection.id) ?? []
      )
    );
  }

  getRecentConnection(id) {
    return (
      this.getRecentConnections().find(
        (connection) => connection.id === String(id ?? "").trim()
      ) ?? null
    );
  }

  assertRecentConnectionExists(id) {
    const normalizedConnectionId = String(id ?? "").trim();

    if (!normalizedConnectionId) {
      throw new ValidationError("Connection id is required.");
    }

    const row = this.db
      .prepare("SELECT id FROM recent_connections WHERE id = ?")
      .get(normalizedConnectionId);

    if (!row) {
      throw new NotFoundError(`Recent connection not found: ${normalizedConnectionId}`);
    }

    return normalizedConnectionId;
  }

  setConnectionTags(connectionId, tagNames = []) {
    const normalizedConnectionId = this.assertRecentConnectionExists(connectionId);
    const normalizedTagNames = normalizeConnectionTagNames(tagNames);

    this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM connection_tags WHERE connectionId = ?")
        .run(normalizedConnectionId);

      for (const tagName of normalizedTagNames) {
        const tag = this.getOrCreateConnectionTag(tagName);

        this.db
          .prepare(
            `
              INSERT OR IGNORE INTO connection_tags (connectionId, tagId)
              VALUES (?, ?)
            `
          )
          .run(normalizedConnectionId, tag.id);
      }
    })();

    return this.getConnectionTags(normalizedConnectionId);
  }

  addConnectionTag(connectionId, tagName) {
    const normalizedConnectionId = this.assertRecentConnectionExists(connectionId);
    const tag = this.getOrCreateConnectionTag(tagName);

    this.db
      .prepare(
        `
          INSERT OR IGNORE INTO connection_tags (connectionId, tagId)
          VALUES (?, ?)
        `
      )
      .run(normalizedConnectionId, tag.id);

    return this.getConnectionTags(normalizedConnectionId);
  }

  removeConnectionTag(connectionId, tagId) {
    const normalizedConnectionId = this.assertRecentConnectionExists(connectionId);

    this.db
      .prepare(
        `
          DELETE FROM connection_tags
          WHERE connectionId = ? AND tagId = ?
        `
      )
      .run(normalizedConnectionId, Number(tagId));

    return this.getConnectionTags(normalizedConnectionId);
  }

  deleteConnectionTag(tagId) {
    const result = this.db
      .prepare("DELETE FROM tags WHERE id = ?")
      .run(Number(tagId));

    return result.changes > 0;
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

    return this.getRecentConnections();
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
    const logoFilePath = resolvePathInsideDirectory(
      this.logoDirectory,
      storedFileName,
      "Connection logo path"
    );

    fs.writeFileSync(logoFilePath, buffer);

    return storedFileName;
  }

  deleteConnectionLogo(logoPath) {
    const normalizedLogoPath = this.normalizeLogoPath(logoPath);

    if (!normalizedLogoPath) {
      return;
    }

    fs.rmSync(
      resolvePathInsideDirectory(
        this.logoDirectory,
        normalizedLogoPath,
        "Connection logo path"
      ),
      { force: true }
    );
  }

  decorateConnection(connection = {}, tags = []) {
    const logoPath = this.normalizeLogoPath(connection.logoPath);

    return {
      ...connection,
      readOnly: Boolean(connection.readOnly),
      logoPath,
      logoUrl: this.getConnectionLogoUrl(logoPath),
      tags: Array.isArray(tags) ? tags : [],
    };
  }

  normalizeLogoPath(logoPath) {
    const trimmedLogoPath = String(logoPath ?? "").trim();

    if (!trimmedLogoPath) {
      return null;
    }

    const baseName = path.basename(trimmedLogoPath);

    if (baseName !== trimmedLogoPath || baseName === "." || baseName === "..") {
      return null;
    }

    return baseName;
  }

  setActiveConnectionId(id) {
    this.setMetaValue("activeConnectionId", id ?? null);
    return this.getActiveConnectionId();
  }

  getActiveConnectionId() {
    return this.getMetaValue("activeConnectionId");
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

  decorateApiTokenRow(row = {}) {
    return {
      id: String(row.id ?? ""),
      databaseKey: String(row.database_key ?? row.databaseKey ?? ""),
      name: String(row.name ?? ""),
      tokenPrefix: String(row.token_prefix ?? row.tokenPrefix ?? ""),
      createdAt: row.created_at ?? row.createdAt ?? null,
      lastUsedAt: row.last_used_at ?? row.lastUsedAt ?? null,
      callCount: Number(row.callCount ?? 0),
      lastCallAt: row.lastCallAt ?? null,
    };
  }

  listApiTokenUsageStats(databaseKey) {
    const normalizedDatabaseKey = normalizeDocumentDatabaseKey(databaseKey);
    const statsByTokenId = new Map();
    const rows = this.db
      .prepare(
        `
          SELECT started_at, metadata_json
          FROM access_log
          WHERE source = 'api'
            AND database_key = ?
          ORDER BY started_at DESC, id DESC
        `
      )
      .all(normalizedDatabaseKey);

    rows.forEach((row) => {
      let metadata = {};

      try {
        metadata = JSON.parse(row.metadata_json ?? "{}");
      } catch {
        metadata = {};
      }

      const tokenId = String(metadata.apiTokenId ?? "").trim();

      if (!tokenId) {
        return;
      }

      const current = statsByTokenId.get(tokenId) ?? {
        callCount: 0,
        lastCallAt: null,
      };
      const startedAt = row.started_at ?? null;

      current.callCount += 1;

      if (
        startedAt &&
        (!current.lastCallAt || Date.parse(startedAt) > Date.parse(current.lastCallAt))
      ) {
        current.lastCallAt = startedAt;
      }

      statsByTokenId.set(tokenId, current);
    });

    return statsByTokenId;
  }

  getDatabaseApiQueryRunUsageStats(databaseKey) {
    const normalizedDatabaseKey = normalizeDocumentDatabaseKey(databaseKey);
    const row = this.db
      .prepare(
        `
          SELECT COUNT(*) AS call_count, MAX(runs.executed_at) AS last_call_at
          FROM query_runs runs
          INNER JOIN query_history q
            ON q.id = runs.history_id
          WHERE runs.executed_by = 'api'
            AND q.database_key = ?
        `
      )
      .get(normalizedDatabaseKey);

    return {
      callCount: Number(row?.call_count ?? 0),
      lastCallAt: row?.last_call_at ?? null,
    };
  }

  listApiTokens(databaseKey) {
    const normalizedDatabaseKey = normalizeDocumentDatabaseKey(databaseKey);
    const usageStatsByTokenId = this.listApiTokenUsageStats(normalizedDatabaseKey);
    const rows = this.db
      .prepare(
        `
          SELECT id, database_key, name, token_prefix, created_at, last_used_at
          FROM api_tokens
          WHERE database_key = ?
          ORDER BY created_at DESC, id ASC
        `
      )
      .all(normalizedDatabaseKey);
    const accessLogCallCount = Array.from(usageStatsByTokenId.values()).reduce(
      (total, stats) => total + Number(stats.callCount ?? 0),
      0
    );
    const apiQueryRunUsageStats = this.getDatabaseApiQueryRunUsageStats(normalizedDatabaseKey);
    const useSingleTokenQueryRunFallback =
      rows.length === 1 &&
      accessLogCallCount === 0 &&
      apiQueryRunUsageStats.callCount > 0;

    return rows.map((row) => {
      const tokenId = String(row.id ?? "");
      const usageStats = usageStatsByTokenId.get(tokenId) ?? {};
      let callCount = Number(usageStats.callCount ?? 0);
      let lastCallAt = pickLatestTimestamp(usageStats.lastCallAt, row.last_used_at);

      if (!callCount && row.last_used_at) {
        callCount = 1;
      }

      if (useSingleTokenQueryRunFallback) {
        callCount = Math.max(callCount, apiQueryRunUsageStats.callCount);
        lastCallAt = pickLatestTimestamp(lastCallAt, apiQueryRunUsageStats.lastCallAt);
      }

      return this.decorateApiTokenRow({
        ...row,
        callCount,
        lastCallAt,
      });
    });
  }

  createApiToken({ databaseKey, name, tokenHash, tokenPrefix }) {
    const normalizedDatabaseKey = normalizeDocumentDatabaseKey(databaseKey);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `
          INSERT INTO api_tokens (
            id,
            database_key,
            name,
            token_hash,
            token_prefix,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(id, normalizedDatabaseKey, name, tokenHash, tokenPrefix, createdAt);

    return this.listApiTokens(normalizedDatabaseKey).find((token) => token.id === id);
  }

  findApiTokenByHash(tokenHash) {
    const normalizedTokenHash = String(tokenHash ?? "").trim();

    if (!normalizedTokenHash) {
      return null;
    }

    const row = this.db
      .prepare(
        `
          SELECT id, database_key, name, token_prefix, created_at, last_used_at
          FROM api_tokens
          WHERE token_hash = ?
          LIMIT 1
        `
      )
      .get(normalizedTokenHash);

    return row ? this.decorateApiTokenRow(row) : null;
  }

  touchApiToken(tokenId) {
    this.db
      .prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
      .run(new Date().toISOString(), String(tokenId ?? "").trim());
  }

  deleteApiToken(databaseKey, tokenId) {
    const normalizedDatabaseKey = normalizeDocumentDatabaseKey(databaseKey);
    const normalizedTokenId = String(tokenId ?? "").trim();

    if (!normalizedTokenId) {
      throw new ValidationError("Token id is required.");
    }

    const result = this.db
      .prepare("DELETE FROM api_tokens WHERE database_key = ? AND id = ?")
      .run(normalizedDatabaseKey, normalizedTokenId);

    if (result.changes < 1) {
      throw new NotFoundError("API token was not found.");
    }

    return {
      id: normalizedTokenId,
      deleted: true,
    };
  }

  decorateDatabaseDocumentRow(row = {}) {
    return {
      id: String(row.id ?? ""),
      databaseKey: row.database_key ?? row.databaseKey ?? "",
      title: String(row.title ?? ""),
      filename: String(row.filename ?? ""),
      content: row.content === undefined ? undefined : String(row.content ?? ""),
      contentLength: Number(row.content_length ?? row.contentLength ?? 0),
      createdAt: row.created_at ?? row.createdAt ?? null,
      updatedAt: row.updated_at ?? row.updatedAt ?? null,
    };
  }

  documentFilenameExists(databaseKey, filename, ignoredDocumentId = null) {
    const row = this.db
      .prepare(
        `
          SELECT id
          FROM database_documents
          WHERE database_key = ?
            AND filename = ?
            AND (? IS NULL OR id != ?)
          LIMIT 1
        `
      )
      .get(databaseKey, filename, ignoredDocumentId, ignoredDocumentId);

    return Boolean(row);
  }

  resolveUniqueDocumentFilename(databaseKey, desiredFilename, ignoredDocumentId = null) {
    const normalizedFilename = normalizeDocumentFilename(desiredFilename);

    if (!this.documentFilenameExists(databaseKey, normalizedFilename, ignoredDocumentId)) {
      return normalizedFilename;
    }

    const { baseName, extension } = splitMarkdownFilename(normalizedFilename);

    for (let index = 2; index < 1000; index += 1) {
      const suffix = ` ${index}`;
      const maxBaseLength = MAX_DOCUMENT_FILENAME_LENGTH - extension.length - suffix.length;
      const candidate = `${baseName.slice(0, Math.max(1, maxBaseLength))}${suffix}${extension}`;

      if (!this.documentFilenameExists(databaseKey, candidate, ignoredDocumentId)) {
        return candidate;
      }
    }

    throw new ConflictError("Could not create a unique document filename.");
  }

  listDatabaseDocuments(databaseKey) {
    const normalizedDatabaseKey = normalizeDocumentDatabaseKey(databaseKey);

    return this.db
      .prepare(
        `
          SELECT
            id,
            database_key,
            title,
            filename,
            LENGTH(content) AS content_length,
            created_at,
            updated_at
          FROM database_documents
          WHERE database_key = ?
          ORDER BY updated_at DESC, id ASC
        `
      )
      .all(normalizedDatabaseKey)
      .map((row) => this.decorateDatabaseDocumentRow(row));
  }

  getDatabaseDocument(databaseKey, documentId) {
    const normalizedDatabaseKey = normalizeDocumentDatabaseKey(databaseKey);
    const normalizedDocumentId = normalizeDocumentId(documentId);
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            database_key,
            title,
            filename,
            content,
            LENGTH(content) AS content_length,
            created_at,
            updated_at
          FROM database_documents
          WHERE database_key = ?
            AND id = ?
        `
      )
      .get(normalizedDatabaseKey, normalizedDocumentId);

    if (!row) {
      throw new NotFoundError("Document was not found.");
    }

    return this.decorateDatabaseDocumentRow(row);
  }

  createDatabaseDocument(databaseKey, document = {}) {
    const normalizedDatabaseKey = normalizeDocumentDatabaseKey(databaseKey);
    const filename = this.resolveUniqueDocumentFilename(
      normalizedDatabaseKey,
      normalizeDocumentFilename(document.filename)
    );
    const title = normalizeDocumentTitle(document.title, filename);
    const content = normalizeDocumentContent(document.content);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    this.db
      .prepare(
        `
          INSERT INTO database_documents (
            id,
            database_key,
            title,
            filename,
            content,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(id, normalizedDatabaseKey, title, filename, content, now, now);

    return this.getDatabaseDocument(normalizedDatabaseKey, id);
  }

  updateDatabaseDocument(databaseKey, documentId, patch = {}) {
    const normalizedDatabaseKey = normalizeDocumentDatabaseKey(databaseKey);
    const existingDocument = this.getDatabaseDocument(normalizedDatabaseKey, documentId);
    const hasFilename = Object.prototype.hasOwnProperty.call(patch, "filename");
    const hasTitle = Object.prototype.hasOwnProperty.call(patch, "title");
    const hasContent = Object.prototype.hasOwnProperty.call(patch, "content");
    const filename = hasFilename
      ? this.resolveUniqueDocumentFilename(
          normalizedDatabaseKey,
          normalizeDocumentFilename(patch.filename, existingDocument.filename),
          existingDocument.id
        )
      : existingDocument.filename;
    const title = hasTitle
      ? normalizeDocumentTitle(patch.title, filename)
      : hasFilename
        ? buildDocumentTitleFromFilename(filename)
        : existingDocument.title;
    const content = hasContent
      ? normalizeDocumentContent(patch.content)
      : existingDocument.content;
    const updatedAt = new Date().toISOString();

    this.db
      .prepare(
        `
          UPDATE database_documents
          SET
            title = ?,
            filename = ?,
            content = ?,
            updated_at = ?
          WHERE database_key = ?
            AND id = ?
        `
      )
      .run(title, filename, content, updatedAt, normalizedDatabaseKey, existingDocument.id);

    return this.getDatabaseDocument(normalizedDatabaseKey, existingDocument.id);
  }

  deleteDatabaseDocument(databaseKey, documentId) {
    const normalizedDatabaseKey = normalizeDocumentDatabaseKey(databaseKey);
    const normalizedDocumentId = normalizeDocumentId(documentId);
    const result = this.db
      .prepare(
        `
          DELETE FROM database_documents
          WHERE database_key = ?
            AND id = ?
        `
      )
      .run(normalizedDatabaseKey, normalizedDocumentId);

    if (result.changes < 1) {
      throw new NotFoundError("Document was not found.");
    }

    return {
      id: normalizedDocumentId,
      deleted: true,
    };
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
      (field) => field.column + " = excluded." + field.column
    );

    if (this.mediaTaggingConfigHasLegacyJsonColumn) {
      explicitColumns.push("config_json");
      assignments.push("config_json = excluded.config_json");
      values.push(JSON.stringify(normalizedConfig));
    }

    explicitColumns.push("updated_at");
    assignments.push("updated_at = excluded.updated_at");
    values.push(updatedAt);

    const upsertSql = [
      "INSERT INTO media_tagging_config",
      "(" + explicitColumns.join(", ") + ")",
      "VALUES",
      "(" + explicitColumns.map(() => "?").join(", ") + ")",
      "ON CONFLICT(database_key) DO UPDATE SET",
      assignments.join(", "),
    ].join(" ");

    this.db
      .prepare(upsertSql)
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
  MAX_CONNECTION_TAG_NAME_LENGTH,
  normalizeConnectionTagName,
};
