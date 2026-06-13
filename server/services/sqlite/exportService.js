const { quoteIdentifier } = require("../../utils/identifier");
const { serializeRows } = require("../../utils/sqliteTypes");
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
};

function normalizeExportFormat(format) {
  const normalized = String(format ?? "csv").toLowerCase();

  if (!EXPORT_FORMATS[normalized]) {
    throw new Error(`Unsupported export format: ${format}`);
  }

  return normalized;
}

function renderExportContent({ columns, rows, format, csvDelimiter }) {
  if (format === "tsv") {
    return rowsToDelimitedText({ columns, rows, delimiter: "\t" });
  }

  if (format === "md") {
    return rowsToMarkdownTable({ columns, rows });
  }

  return rowsToCsv({ columns, rows, delimiter: csvDelimiter });
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

  exportQuery(sql, options = {}) {
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
    const content = renderExportContent({
      columns: result.columns,
      rows: result.rows,
      format,
      csvDelimiter: this.getDelimiter(),
    });

    return {
      filename: `${filenameBase}.${formatConfig.extension}`,
      content,
      csv: format === "csv" ? content : undefined,
      format,
      mimeType: formatConfig.mimeType,
      columns: result.columns,
      rowCount: result.rows.length,
    };
  }

  exportTable(tableName, options = {}) {
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
    const content = renderExportContent({
      columns,
      rows,
      format,
      csvDelimiter: this.getDelimiter(),
    });

    return {
      filename: `${tableName}.${formatConfig.extension}`,
      content,
      csv: format === "csv" ? content : undefined,
      format,
      mimeType: formatConfig.mimeType,
      columns,
      rowCount: rows.length,
    };
  }
}

module.exports = {
  ExportService,
};
