const { PassThrough } = require("node:stream");
const parquet = require("parquetjs-lite");
const { quoteIdentifier } = require("../../utils/identifier");
const { serializeRows } = require("../../utils/sqliteTypes");
const { ValidationError } = require("../../utils/errors");
const {
  rowsToCsv,
  rowsToDelimitedText,
  rowsToMarkdownTable,
} = require("../../utils/csv");
const { getTableDetail } = require("./introspection");
const { normalizeTableFilter } = require("./tableFilter");
const { buildTableOrderClause, normalizeTableSort } = require("./tableSort");
const {
  buildAutoTitle,
  detectQueryType,
  detectTables,
} = require("../storage/queryHistoryUtils");

function sanitizeFilenameBase(value, fallback = "query-results") {
  const sanitized = String(value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!sanitized) {
    return fallback;
  }

  return sanitized.slice(0, 120);
}

const EXPORT_FORMATS = {
  csv: {
    extension: "csv",
    mimeType: "text/csv; charset=utf-8",
  },
  tsv: {
    extension: "tsv",
    mimeType: "text/tab-separated-values; charset=utf-8",
  },
  md: {
    extension: "md",
    mimeType: "text/markdown; charset=utf-8",
  },
  json: {
    extension: "json",
    mimeType: "application/json; charset=utf-8",
  },
  parquet: {
    extension: "parquet",
    mimeType: "application/vnd.apache.parquet",
  },
};

function normalizeExportFormat(format) {
  const normalized = String(format ?? "csv").toLowerCase();

  if (!EXPORT_FORMATS[normalized]) {
    throw new Error(`Unsupported export format: ${format}`);
  }

  return normalized;
}

function renderExportContent({ columns, rows, format, csvDelimiter }) {
  if (format === "parquet") {
    throw new ValidationError("Parquet exports are binary and must use a download endpoint.");
  }

  if (format === "json") {
    return JSON.stringify(
      rows.map((row) =>
        Object.fromEntries(columns.map((column) => [column, row[column]]))
      ),
      null,
      2
    );
  }

  if (format === "tsv") {
    return rowsToDelimitedText({ columns, rows, delimiter: "\t" });
  }

  if (format === "md") {
    return rowsToMarkdownTable({ columns, rows });
  }

  return rowsToCsv({ columns, rows, delimiter: csvDelimiter });
}

function isSerializedBlob(value) {
  return (
    value &&
    typeof value === "object" &&
    value.__type === "blob" &&
    typeof value.data === "string"
  );
}

function getParquetValueKind(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array || isSerializedBlob(value)) {
    return "blob";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? "integer" : "number";
  }

  return "string";
}

function inferParquetColumnType(rows, column) {
  const kinds = new Set();

  for (const row of rows) {
    const kind = getParquetValueKind(row?.[column]);

    if (kind) {
      kinds.add(kind);
    }
  }

  if (kinds.size === 0) {
    return "UTF8";
  }

  if (kinds.size === 1 && kinds.has("blob")) {
    return "BYTE_ARRAY";
  }

  if (kinds.size === 1 && kinds.has("boolean")) {
    return "BOOLEAN";
  }

  if (kinds.size === 1 && kinds.has("integer")) {
    return "INT64";
  }

  if (
    (kinds.size === 1 && kinds.has("number")) ||
    (kinds.size === 2 && kinds.has("integer") && kinds.has("number"))
  ) {
    return "DOUBLE";
  }

  return "UTF8";
}

function stringifyParquetValue(value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function normalizeParquetBlob(value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  if (isSerializedBlob(value)) {
    return Buffer.from(value.data, value.encoding === "hex" ? "hex" : "base64");
  }

  return Buffer.from(stringifyParquetValue(value) ?? "", "utf8");
}

function normalizeParquetValue(value, type) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (type === "BYTE_ARRAY") {
    return normalizeParquetBlob(value);
  }

  if (type === "BOOLEAN") {
    return Boolean(value);
  }

  if (type === "INT64" || type === "DOUBLE") {
    return Number(value);
  }

  return stringifyParquetValue(value);
}

function createParquetSchema(columns, rows) {
  return new parquet.ParquetSchema(
    Object.fromEntries(
      columns.map((column) => [
        column,
        {
          type: inferParquetColumnType(rows, column),
          optional: true,
        },
      ])
    )
  );
}

async function rowsToParquetBuffer({ columns, rows }) {
  const schema = createParquetSchema(columns, rows);
  const output = new PassThrough();
  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    output.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    output.on("end", resolve);
    output.on("error", reject);
  });
  const writer = await parquet.ParquetWriter.openStream(schema, output, {
    useDataPageV2: false,
  });
  const columnTypes = Object.fromEntries(
    columns.map((column) => [column, schema.schema[column].type])
  );

  for (const row of rows) {
    const parquetRow = {};

    for (const column of columns) {
      const value = normalizeParquetValue(row?.[column], columnTypes[column]);

      if (value !== undefined) {
        parquetRow[column] = value;
      }
    }

    await writer.appendRow(parquetRow);
  }

  await writer.close();
  await finished;

  return Buffer.concat(chunks);
}

async function renderDownloadContent({ columns, rows, format, csvDelimiter }) {
  if (format === "parquet") {
    return rowsToParquetBuffer({ columns, rows });
  }

  return renderExportContent({ columns, rows, format, csvDelimiter });
}

function buildExportResult({ filenameBase, formatConfig, content, format, columns, rowCount }) {
  return {
    filename: `${filenameBase}.${formatConfig.extension}`,
    content,
    csv: format === "csv" ? content : undefined,
    format,
    mimeType: formatConfig.mimeType,
    columns,
    rowCount,
  };
}

class ExportService {
  constructor({ appStateStore, connectionManager, sqlExecutor }) {
    this.appStateStore = appStateStore;
    this.connectionManager = connectionManager;
    this.sqlExecutor = sqlExecutor;
  }

  getDelimiter() {
    return this.appStateStore.getSettings().csvDelimiter || ",";
  }

  buildQueryExportData(sql, options = {}) {
    const format = normalizeExportFormat(options.format);
    const formatConfig = EXPORT_FORMATS[format];
    const activeConnection = this.connectionManager.getActiveConnection();
    const historyItem = activeConnection
      ? this.appStateStore.findQueryHistoryItemBySql(activeConnection.id, sql)
      : null;
    const filenameBase = sanitizeFilenameBase(
      historyItem?.displayTitle ||
        buildAutoTitle(sql, {
          queryType: detectQueryType(sql),
          tablesDetected: detectTables(sql),
        })
    );
    const result = this.sqlExecutor.execute(sql, {
      blobMode: "full",
      maxRows: null,
      persistHistory: false,
      requireReader: true,
    });

    return {
      filenameBase,
      format,
      formatConfig,
      columns: result.columns,
      rows: result.rows,
    };
  }

  exportQuery(sql, options = {}) {
    const exportData = this.buildQueryExportData(sql, options);
    const content = renderExportContent({
      columns: exportData.columns,
      rows: exportData.rows,
      format: exportData.format,
      csvDelimiter: this.getDelimiter(),
    });

    return buildExportResult({
      filenameBase: exportData.filenameBase,
      formatConfig: exportData.formatConfig,
      content,
      format: exportData.format,
      columns: exportData.columns,
      rowCount: exportData.rows.length,
    });
  }

  async exportQueryDownload(sql, options = {}) {
    const exportData = this.buildQueryExportData(sql, options);
    const content = await renderDownloadContent({
      columns: exportData.columns,
      rows: exportData.rows,
      format: exportData.format,
      csvDelimiter: this.getDelimiter(),
    });

    return buildExportResult({
      filenameBase: exportData.filenameBase,
      formatConfig: exportData.formatConfig,
      content,
      format: exportData.format,
      columns: exportData.columns,
      rowCount: exportData.rows.length,
    });
  }

  buildTableExportData(tableName, options = {}) {
    const format = normalizeExportFormat(options.format);
    const formatConfig = EXPORT_FORMATS[format];
    const db = this.connectionManager.getActiveDatabase();
    const tableDetail = getTableDetail(db, tableName, { includeRowCount: false });
    const sort = normalizeTableSort(tableDetail, options);
    const filter = normalizeTableFilter(tableDetail, options);
    const orderClause = buildTableOrderClause(tableDetail, sort);
    const whereClause = filter ? `WHERE ${filter.clause}` : "";
    const statement = db.prepare(
      [
        "SELECT * FROM",
        quoteIdentifier(tableName),
        whereClause,
        orderClause ? "ORDER BY" : "",
        orderClause,
      ]
        .filter(Boolean)
        .join(" ")
    );
    const rows = serializeRows(statement.all(...(filter?.params ?? [])), {
      blobMode: "full",
    });
    const columns = statement.columns().map((column) => column.name);

    return {
      filenameBase: tableName,
      format,
      formatConfig,
      columns,
      rows,
    };
  }

  exportTable(tableName, options = {}) {
    const exportData = this.buildTableExportData(tableName, options);
    const content = renderExportContent({
      columns: exportData.columns,
      rows: exportData.rows,
      format: exportData.format,
      csvDelimiter: this.getDelimiter(),
    });

    return buildExportResult({
      filenameBase: exportData.filenameBase,
      formatConfig: exportData.formatConfig,
      content,
      format: exportData.format,
      columns: exportData.columns,
      rowCount: exportData.rows.length,
    });
  }

  async exportTableDownload(tableName, options = {}) {
    const exportData = this.buildTableExportData(tableName, options);
    const content = await renderDownloadContent({
      columns: exportData.columns,
      rows: exportData.rows,
      format: exportData.format,
      csvDelimiter: this.getDelimiter(),
    });

    return buildExportResult({
      filenameBase: exportData.filenameBase,
      formatConfig: exportData.formatConfig,
      content,
      format: exportData.format,
      columns: exportData.columns,
      rowCount: exportData.rows.length,
    });
  }
}

module.exports = {
  ExportService,
};
