const path = require("node:path");
const { NotFoundError, ReadOnlyError, ValidationError } = require("../utils/errors");
const { ConnectionManager } = require("./sqlite/connectionManager");
const { BackupService } = require("./sqlite/backupService");
const { DataBrowserService } = require("./sqlite/dataBrowserService");
const { ExportService } = require("./sqlite/exportService");
const { getTableDetail, listSchema } = require("./sqlite/introspection");
const { OverviewService } = require("./sqlite/overviewService");
const { SqlExecutor, splitSqlStatements } = require("./sqlite/sqlExecutor");
const { TypeGenerationService } = require("./typeGenerationService");
const { detectQueryType } = require("./storage/queryHistoryUtils");

function normalizeLookupValue(value, label) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new ValidationError(`${label} is required.`);
  }

  return normalized;
}

function normalizeOptionalValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function getQueryTitle(item) {
  return item?.title || item?.displayTitle || item?.previewSql || item?.rawSql || "(untitled query)";
}

function getDocumentTitle(document) {
  return document?.filename || document?.title || document?.id || "(untitled document)";
}

function sanitizeFilenameBase(value, fallback = "export") {
  const sanitized = String(value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return (sanitized || fallback).slice(0, 120);
}

function normalizeMarkdownExportFilename(filename, fallback = "document.md") {
  let normalizedFilename = String(filename ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "");

  if (!normalizedFilename) {
    normalizedFilename = fallback;
  }

  if (!/\.md$/i.test(normalizedFilename)) {
    normalizedFilename = `${normalizedFilename}.md`;
  }

  if (normalizedFilename.length > 160) {
    normalizedFilename = `${normalizedFilename.slice(0, 157)}.md`;
  }

  return normalizedFilename;
}

function stripSqlTerminators(sql) {
  return String(sql ?? "").trim().replace(/;+\s*$/g, "").trim();
}

function removeLeadingSqlComments(sql) {
  let text = String(sql ?? "").trim();
  let changed = true;

  while (changed) {
    changed = false;
    const nextText = text
      .replace(/^--[^\n]*(?:\n|$)/, "")
      .replace(/^\/\*[\s\S]*?\*\//, "")
      .trim();

    if (nextText !== text) {
      changed = true;
      text = nextText;
    }
  }

  return text;
}

function explainInnerSql(statement) {
  return removeLeadingSqlComments(statement)
    .replace(/^EXPLAIN\s+QUERY\s+PLAN\s+/i, "")
    .replace(/^EXPLAIN\s+/i, "")
    .trim();
}

function isAllowedReadonlyStatement(statement) {
  const text = removeLeadingSqlComments(statement);
  const queryType = detectQueryType(text);

  if (queryType === "select" || queryType === "pragma") {
    return true;
  }

  if (/^EXPLAIN\b/i.test(text)) {
    const innerType = detectQueryType(explainInnerSql(text));
    return innerType === "select" || innerType === "pragma";
  }

  return false;
}

function assertReadOnlySql(db, sql) {
  const statements = splitSqlStatements(sql);

  if (!statements.length) {
    throw new ValidationError("No executable SQL statements were found.");
  }

  statements.forEach((statement, index) => {
    if (!isAllowedReadonlyStatement(statement)) {
      throw new ValidationError(
        `Statement ${index + 1} is not allowed for read-only MCP queries. Only SELECT, PRAGMA, and EXPLAIN statements are allowed.`,
        { code: "MCP_READONLY_SQL_REQUIRED" }
      );
    }

    const prepared = db.prepare(statement);

    if (!prepared.reader) {
      throw new ValidationError(
        `Statement ${index + 1} does not return rows and is blocked by the read-only query guard.`,
        { code: "MCP_READONLY_SQL_REQUIRED" }
      );
    }
  });

  return statements;
}

function buildExplainQueryPlanSql(sql) {
  const stripped = stripSqlTerminators(sql);

  if (/^EXPLAIN\s+QUERY\s+PLAN\b/i.test(removeLeadingSqlComments(stripped))) {
    return stripped;
  }

  return `EXPLAIN QUERY PLAN ${stripped}`;
}

function buildQueryPlanHints(rows = []) {
  return rows
    .map((row) => String(row.detail ?? row["QUERY PLAN"] ?? "").trim())
    .filter(Boolean)
    .filter((detail) => /\bSCAN\b/i.test(detail) && !/\bUSING\s+(?:COVERING\s+)?INDEX\b/i.test(detail))
    .map((detail) => `Review whether an index would help: ${detail}`);
}

function coerceIdentityValue(column, value) {
  const text = String(value ?? "");
  const affinity = String(column?.affinity ?? "").toUpperCase();

  if (["INTEGER", "REAL", "NUMERIC"].includes(affinity) && text.trim() !== "") {
    const numberValue = Number(text);

    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  return value;
}

function parseCompositePrimaryKeyValue(rawValue) {
  if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return rawValue;
  }

  try {
    const parsed = JSON.parse(rawValue);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    // Fall through to the validation error below.
  }

  throw new ValidationError(
    'Composite primary key export requires a JSON object, for example {"id":1,"locale":"en"}.'
  );
}

function buildIdentityFromExportTarget(tableDetail, exportTarget) {
  if (tableDetail.identityStrategy?.type === "rowid") {
    const numberValue = Number(exportTarget);

    return {
      kind: "rowid",
      values: {
        rowid: Number.isInteger(numberValue) ? numberValue : exportTarget,
      },
    };
  }

  if (tableDetail.identityStrategy?.type === "primaryKey") {
    const columns = tableDetail.identityStrategy.columns ?? [];

    if (columns.length === 1) {
      const columnName = columns[0];
      const column = tableDetail.columns.find((candidate) => candidate.name === columnName);

      return {
        kind: "primaryKey",
        columns,
        values: {
          [columnName]: coerceIdentityValue(column, exportTarget),
        },
      };
    }

    const parsed = parseCompositePrimaryKeyValue(exportTarget);

    return {
      kind: "primaryKey",
      columns,
      values: Object.fromEntries(
        columns.map((columnName) => {
          if (!Object.prototype.hasOwnProperty.call(parsed, columnName)) {
            throw new ValidationError(`Missing primary key value for ${columnName}.`);
          }

          const column = tableDetail.columns.find((candidate) => candidate.name === columnName);
          return [columnName, coerceIdentityValue(column, parsed[columnName])];
        })
      ),
    };
  }

  throw new ValidationError(`Table ${tableDetail.name} has no stable row identity.`);
}

function buildRowJsonObject({ row, columns = [] } = {}) {
  const names = columns
    .map((column) => String(typeof column === "object" ? column?.name : column ?? "").trim())
    .filter((name) => name && name !== "__identity");
  const sourceNames = names.length
    ? names
    : Object.keys(row ?? {}).filter((name) => name !== "__identity");

  return Object.fromEntries(
    sourceNames
      .map((name) => [name, Object.prototype.hasOwnProperty.call(row ?? {}, name) ? row[name] : undefined])
      .filter(([, value]) => value !== undefined)
  );
}

class DatabaseCommandService {
  constructor({ appStateStore, runtimeFactory } = {}) {
    this.appStateStore = appStateStore;
    this.runtimeFactory = runtimeFactory ?? ((connection, options) => this.createRuntime(connection, options));
    this.typeGenerationService = new TypeGenerationService();
  }

  listDatabases() {
    return this.appStateStore.getRecentConnections();
  }

  getDatabase(databaseReference) {
    const normalizedReference = normalizeLookupValue(databaseReference, "Database").toLowerCase();
    const connection = this.listDatabases().find(
      (candidate) =>
        String(candidate.label ?? "").toLowerCase() === normalizedReference ||
        String(candidate.id ?? "").toLowerCase() === normalizedReference
    );

    if (!connection) {
      throw new NotFoundError(`Database not found: ${databaseReference}`);
    }

    return connection;
  }

  createRuntime(connection, { readOnly = true } = {}) {
    const connectionManager = new ConnectionManager({ appStateStore: this.appStateStore });

    connectionManager.openConnection({
      filePath: connection.path,
      label: connection.label,
      id: connection.id,
      logoPath: connection.logoPath ?? null,
      makeActive: false,
      readOnly,
    });

    const sqlExecutor = new SqlExecutor({
      connectionManager,
      appStateStore: this.appStateStore,
    });

    return {
      connectionManager,
      dataBrowserService: new DataBrowserService({ connectionManager }),
      db: connectionManager.getActiveDatabase(),
      exportService: new ExportService({
        appStateStore: this.appStateStore,
        connectionManager,
        sqlExecutor,
      }),
      overviewService: new OverviewService({ connectionManager }),
      sqlExecutor,
      close() {
        connectionManager.closeCurrent();
      },
    };
  }

  createReadOnlyRuntime(connection) {
    return this.createRuntime(connection, { readOnly: true });
  }

  createWritableRuntime(connection) {
    return this.createRuntime(connection, { readOnly: false });
  }

  withDatabase(databaseReference, callback, options = {}) {
    const connection = this.getDatabase(databaseReference);
    const runtime = this.runtimeFactory(connection, options);

    try {
      return callback({ connection, runtime });
    } finally {
      runtime.close?.();
    }
  }

  async withDatabaseAsync(databaseReference, callback, options = {}) {
    const connection = this.getDatabase(databaseReference);
    const runtime = this.runtimeFactory(connection, options);

    try {
      return await callback({ connection, runtime });
    } finally {
      runtime.close?.();
    }
  }

  listTables(databaseReference) {
    return this.withDatabase(databaseReference, ({ runtime }) => runtime.dataBrowserService.listTables());
  }

  getDatabaseOverview(databaseReference) {
    return this.withDatabase(databaseReference, ({ runtime }) => runtime.overviewService.getOverview());
  }

  getTable(databaseReference, tableName) {
    const normalizedTableName = normalizeLookupValue(tableName, "Table name");
    return this.withDatabase(databaseReference, ({ runtime }) =>
      getTableDetail(runtime.db, normalizedTableName)
    );
  }

  getSchema(databaseReference) {
    return this.withDatabase(databaseReference, ({ runtime }) => listSchema(runtime.db));
  }

  getIndexes(databaseReference, tableName = null) {
    const normalizedTableName = normalizeOptionalValue(tableName);

    if (normalizedTableName) {
      return this.getTable(databaseReference, normalizedTableName).indexes ?? [];
    }

    return this.getSchema(databaseReference).indexes ?? [];
  }

  getForeignKeys(databaseReference, tableName = null) {
    const normalizedTableName = normalizeOptionalValue(tableName);

    if (normalizedTableName) {
      return this.getTable(databaseReference, normalizedTableName).foreignKeys ?? [];
    }

    return this.getSchema(databaseReference).tables.map((table) => ({
      tableName: table.name,
      foreignKeys: table.foreignKeys ?? [],
    }));
  }

  generateTableTypes(databaseReference, tableName, target, options = {}) {
    const normalizedTableName = normalizeLookupValue(tableName, "Table name");
    return this.withDatabase(databaseReference, ({ runtime }) =>
      this.typeGenerationService.generateTypesFromDatabase(
        runtime.db,
        normalizedTableName,
        target,
        options
      )
    );
  }

  generateTypes(databaseReference, { tableName = null, allTables = false, target, options = {} } = {}) {
    const normalizedTableName = normalizeOptionalValue(tableName);

    return this.withDatabase(databaseReference, ({ runtime }) => {
      const tables = allTables || !normalizedTableName
        ? runtime.dataBrowserService.listTables().map((table) => table.name)
        : [normalizedTableName];
      const files = tables.map((name) =>
        this.typeGenerationService.generateTypesFromDatabase(runtime.db, name, target, options)
      );

      return {
        target: files[0]?.target ?? target,
        files,
        warnings: files.flatMap((file) =>
          (file.warnings ?? []).map((warning) => `${file.tableName}: ${warning}`)
        ),
      };
    });
  }

  executeReadOnlyQuery(databaseReference, sql, options = {}) {
    return this.withDatabase(databaseReference, ({ runtime }) => {
      const statements = assertReadOnlySql(runtime.db, sql);
      const result = runtime.sqlExecutor.execute(sql, {
        executedBy: options.executedBy ?? "mcp",
        maxRows: options.maxRows ?? 500,
        persistHistory: options.persistHistory,
        requireReader: true,
      });

      return {
        statementsValidated: statements.length,
        result,
      };
    });
  }

  explainQueryPlan(databaseReference, sql) {
    return this.withDatabase(databaseReference, ({ runtime }) => {
      assertReadOnlySql(runtime.db, sql);
      const explainSql = buildExplainQueryPlanSql(sql);
      const rows = runtime.db.prepare(explainSql).all();

      return {
        sql: explainSql,
        rows,
        hints: buildQueryPlanHints(rows),
      };
    });
  }

  createChartFromQuery(databaseReference, { sql, name, chartType = "bar", config, resultColumns, tableVisible = true } = {}) {
    const normalizedSql = normalizeLookupValue(sql, "SQL");

    if (/^EXPLAIN\b/i.test(removeLeadingSqlComments(normalizedSql)) || detectQueryType(normalizedSql) !== "select") {
      throw new ValidationError("Charts can only be created from read-only SELECT queries.", {
        code: "CHART_SELECT_QUERY_REQUIRED",
      });
    }

    return this.withDatabase(databaseReference, ({ connection, runtime }) => {
      assertReadOnlySql(runtime.db, normalizedSql);
      const result = runtime.sqlExecutor.execute(normalizedSql, {
        executedBy: "mcp",
        maxRows: 500,
        requireReader: true,
      });
      const chart = this.appStateStore.createQueryHistoryChart({
        databaseKey: connection.id,
        queryHistoryId: result.historyId,
        name,
        chartType,
        config,
        resultColumns: resultColumns ?? result.columns.map((column) => ({
          name: column,
          type: "unknown",
        })),
        tableVisible,
      });

      return {
        chart,
        queryHistoryId: result.historyId,
        export: {
          png: false,
          message: "Charts are saved in SQLite Hub. PNG export is available from the Charts UI.",
        },
      };
    });
  }

  getTableRow(databaseReference, tableName, exportTarget) {
    const normalizedTableName = normalizeLookupValue(tableName, "Table name");
    normalizeLookupValue(exportTarget, "Row key");

    return this.withDatabase(databaseReference, ({ runtime }) => {
      const tableDetail = getTableDetail(runtime.db, normalizedTableName, {
        includeRowCount: false,
      });
      const identity = buildIdentityFromExportTarget(tableDetail, exportTarget);
      const { row } = runtime.dataBrowserService.getTableRow(normalizedTableName, { identity });
      const data = buildRowJsonObject({
        row,
        columns: tableDetail.columns.filter((column) => column.visible),
      });

      return {
        data,
        filename: `${sanitizeFilenameBase(
          `${normalizedTableName}-${typeof exportTarget === "object" ? JSON.stringify(exportTarget) : exportTarget}`,
          `${normalizedTableName}-row`
        )}.json`,
        identity,
        table: tableDetail,
      };
    });
  }

  findQuery(databaseReference, queryName) {
    const connection = this.getDatabase(databaseReference);
    const normalizedQueryName = normalizeLookupValue(queryName, "Query name").toLowerCase();
    const collection = this.appStateStore.buildQueryHistoryCollection({
      databaseKey: connection.id,
      search: queryName,
      onlySaved: true,
      limit: 100,
    });

    return (
      collection.items.find((item) =>
        [item.id, item.title, item.displayTitle]
          .filter(Boolean)
          .some((candidate) => String(candidate).toLowerCase() === normalizedQueryName)
      ) ??
      collection.items.find((item) =>
        String(item.rawSql ?? "").toLowerCase().includes(normalizedQueryName)
      ) ??
      null
    );
  }

  requireQuery(databaseReference, queryName) {
    const query = this.findQuery(databaseReference, queryName);

    if (!query) {
      const available = this.listSavedQueries(databaseReference).items.map(getQueryTitle);
      throw new NotFoundError(`Saved query not found: ${queryName}`, {
        details: { available },
      });
    }

    return query;
  }

  listSavedQueries(databaseReference, limit = 100) {
    const connection = this.getDatabase(databaseReference);
    return this.appStateStore.buildQueryHistoryCollection({
      databaseKey: connection.id,
      onlySaved: true,
      limit,
    });
  }

  getSavedQuery(databaseReference, queryName) {
    return this.requireQuery(databaseReference, queryName);
  }

  executeSavedQuery(databaseReference, queryName, options = {}) {
    const query = this.requireQuery(databaseReference, queryName);
    const { executedBy = "user" } = options;
    const result = this.withDatabase(databaseReference, ({ runtime }) =>
      runtime.sqlExecutor.execute(query.rawSql, { executedBy })
    );

    return { query, result };
  }

  executeRawQuery(databaseReference, sql, options = {}) {
    const connection = this.getDatabase(databaseReference);
    const { name = null, storeName = null, ...executeOptions } = options;
    const normalizedStoreName = normalizeOptionalValue(storeName ?? name);

    if (connection.readOnly) {
      throw new ReadOnlyError(`Cannot execute raw SQL against a read-only database: ${connection.label}`);
    }

    const result = this.withDatabase(
      connection.id,
      ({ runtime }) => runtime.sqlExecutor.execute(sql, executeOptions),
      { readOnly: false }
    );
    let storedQuery = null;

    if (normalizedStoreName && result.historyId) {
      this.appStateStore.renameQuery(result.historyId, normalizedStoreName, connection.id);
      storedQuery = this.appStateStore.toggleSaved(result.historyId, true, connection.id);
    }

    return {
      connection,
      result: {
        ...result,
        storedQuery,
      },
      storedQuery,
    };
  }

  async createBackup(databaseReference, options = {}) {
    const backupOptions = {
      name: normalizeOptionalValue(options.name),
      notes: normalizeOptionalValue(options.notes),
      type: normalizeOptionalValue(options.type) ?? "manual",
      context: normalizeOptionalValue(options.context) ?? "automation",
    };

    return this.withDatabaseAsync(
      databaseReference,
      async ({ runtime }) => {
        const backupService = new BackupService({
          appStateStore: this.appStateStore,
          connectionManager: runtime.connectionManager,
        });

        return backupService.createActiveBackup(backupOptions);
      },
      { readOnly: true }
    );
  }

  listBackups(databaseReference) {
    return this.withDatabase(databaseReference, ({ connection, runtime }) => {
      const backupService = new BackupService({
        appStateStore: this.appStateStore,
        connectionManager: runtime.connectionManager,
      });

      return backupService.listBackups({ connectionId: connection.id });
    });
  }

  exportSavedQuery(databaseReference, queryName, format = "csv") {
    const query = this.requireQuery(databaseReference, queryName);
    const result = this.withDatabase(databaseReference, ({ runtime }) =>
      runtime.exportService.exportQuery(query.rawSql, { format })
    );

    return { query, result };
  }

  listDocuments(databaseReference) {
    const connection = this.getDatabase(databaseReference);
    return this.appStateStore.listDatabaseDocuments(connection.id);
  }

  readDocuments(databaseReference, documentName = null) {
    const normalizedDocumentName = normalizeOptionalValue(documentName);

    if (normalizedDocumentName) {
      return {
        items: [this.getDocument(databaseReference, normalizedDocumentName)],
      };
    }

    return {
      items: this.listDocuments(databaseReference).map((document) =>
        this.appStateStore.getDatabaseDocument(this.getDatabase(databaseReference).id, document.id)
      ),
    };
  }

  findDocument(databaseReference, documentName) {
    const connection = this.getDatabase(databaseReference);
    const normalizedDocumentName = normalizeLookupValue(documentName, "Document name").toLowerCase();
    const documents = this.appStateStore.listDatabaseDocuments(connection.id);
    const exactMatch = documents.find((document) =>
      [document.id, document.filename, document.title]
        .filter(Boolean)
        .some((candidate) => String(candidate).toLowerCase() === normalizedDocumentName)
    );
    const partialMatch = exactMatch ?? documents.find((document) =>
      [document.filename, document.title]
        .filter(Boolean)
        .some((candidate) => String(candidate).toLowerCase().includes(normalizedDocumentName))
    );

    return partialMatch
      ? this.appStateStore.getDatabaseDocument(connection.id, partialMatch.id)
      : null;
  }

  requireDocument(databaseReference, documentName) {
    const document = this.findDocument(databaseReference, documentName);

    if (!document) {
      const available = this.listDocuments(databaseReference).map(getDocumentTitle);
      throw new NotFoundError(`Document not found: ${documentName}`, {
        details: { available },
      });
    }

    return document;
  }

  getDocument(databaseReference, documentName) {
    return this.requireDocument(databaseReference, documentName);
  }

  exportDocument(databaseReference, documentName) {
    const document = this.requireDocument(databaseReference, documentName);

    return {
      document,
      content: document.content ?? "",
      filename: normalizeMarkdownExportFilename(
        document.filename,
        `${document.title || path.basename(String(documentName)) || "document"}.md`
      ),
      mimeType: "text/markdown; charset=utf-8",
    };
  }
}

module.exports = {
  DatabaseCommandService,
  assertReadOnlySql,
  buildIdentityFromExportTarget,
  buildRowJsonObject,
  isAllowedReadonlyStatement,
  getDocumentTitle,
  getQueryTitle,
  normalizeMarkdownExportFilename,
  sanitizeFilenameBase,
};
