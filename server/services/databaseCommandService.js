const path = require("node:path");
const { NotFoundError, ValidationError } = require("../utils/errors");
const { ConnectionManager } = require("./sqlite/connectionManager");
const { DataBrowserService } = require("./sqlite/dataBrowserService");
const { ExportService } = require("./sqlite/exportService");
const { getTableDetail } = require("./sqlite/introspection");
const { SqlExecutor } = require("./sqlite/sqlExecutor");

function normalizeLookupValue(value, label) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new ValidationError(`${label} is required.`);
  }

  return normalized;
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
    this.runtimeFactory = runtimeFactory ?? ((connection) => this.createReadOnlyRuntime(connection));
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

  createReadOnlyRuntime(connection) {
    const connectionManager = new ConnectionManager({ appStateStore: this.appStateStore });

    connectionManager.openConnection({
      filePath: connection.path,
      label: connection.label,
      id: connection.id,
      logoPath: connection.logoPath ?? null,
      makeActive: false,
      readOnly: true,
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
      sqlExecutor,
      close() {
        connectionManager.closeCurrent();
      },
    };
  }

  withDatabase(databaseReference, callback) {
    const connection = this.getDatabase(databaseReference);
    const runtime = this.runtimeFactory(connection);

    try {
      return callback({ connection, runtime });
    } finally {
      runtime.close?.();
    }
  }

  listTables(databaseReference) {
    return this.withDatabase(databaseReference, ({ runtime }) => runtime.dataBrowserService.listTables());
  }

  getTable(databaseReference, tableName) {
    const normalizedTableName = normalizeLookupValue(tableName, "Table name");
    return this.withDatabase(databaseReference, ({ runtime }) =>
      getTableDetail(runtime.db, normalizedTableName)
    );
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
      onlySaved: false,
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

  executeSavedQuery(databaseReference, queryName) {
    const query = this.requireQuery(databaseReference, queryName);
    const result = this.withDatabase(databaseReference, ({ runtime }) =>
      runtime.sqlExecutor.execute(query.rawSql, { persistHistory: false })
    );

    return { query, result };
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
  buildIdentityFromExportTarget,
  buildRowJsonObject,
  getDocumentTitle,
  getQueryTitle,
  normalizeMarkdownExportFilename,
  sanitizeFilenameBase,
};
