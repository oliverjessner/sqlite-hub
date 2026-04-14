const { quoteIdentifier } = require("../../utils/identifier");
const { serializeRows } = require("../../utils/sqliteTypes");
const { rowsToCsv } = require("../../utils/csv");
const { getTableDetail } = require("./introspection");
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

class ExportService {
  constructor({ appStateStore, connectionManager, sqlExecutor }) {
    this.appStateStore = appStateStore;
    this.connectionManager = connectionManager;
    this.sqlExecutor = sqlExecutor;
  }

  getDelimiter() {
    return this.appStateStore.getSettings().csvDelimiter || ",";
  }

  exportQuery(sql) {
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
      persistHistory: false,
      requireReader: true,
    });

    return {
      filename: `${filenameBase}.csv`,
      csv: rowsToCsv({
        columns: result.columns,
        rows: result.rows,
        delimiter: this.getDelimiter(),
      }),
      columns: result.columns,
      rowCount: result.rows.length,
    };
  }

  exportTable(tableName, options = {}) {
    const db = this.connectionManager.getActiveDatabase();
    const tableDetail = getTableDetail(db, tableName, { includeRowCount: false });
    const sort = normalizeTableSort(tableDetail, options);
    const orderClause = buildTableOrderClause(tableDetail, sort);
    const statement = db.prepare(
      [
        `SELECT * FROM ${quoteIdentifier(tableName)}`,
        orderClause ? `ORDER BY ${orderClause}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    );
    const rows = serializeRows(statement.all());
    const columns = statement.columns().map((column) => column.name);

    return {
      filename: `${tableName}.csv`,
      csv: rowsToCsv({
        columns,
        rows,
        delimiter: this.getDelimiter(),
      }),
      columns,
      rowCount: rows.length,
    };
  }
}

module.exports = {
  ExportService,
};
