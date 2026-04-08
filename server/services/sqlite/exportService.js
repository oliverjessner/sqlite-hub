const { quoteIdentifier } = require("../../utils/identifier");
const { serializeRows } = require("../../utils/sqliteTypes");
const { rowsToCsv } = require("../../utils/csv");
const { getTableDetail } = require("./introspection");

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
    const result = this.sqlExecutor.execute(sql, {
      persistHistory: false,
      requireReader: true,
    });

    return {
      filename: "query-results.csv",
      csv: rowsToCsv({
        columns: result.columns,
        rows: result.rows,
        delimiter: this.getDelimiter(),
      }),
      columns: result.columns,
      rowCount: result.rows.length,
    };
  }

  exportTable(tableName) {
    const db = this.connectionManager.getActiveDatabase();
    const tableDetail = getTableDetail(db, tableName, { includeRowCount: false });
    const orderClause = this.buildOrderClause(tableDetail);
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

  buildOrderClause(tableDetail) {
    if (tableDetail.identityStrategy?.type === "rowid") {
      return "rowid ASC";
    }

    if (tableDetail.identityStrategy?.type === "primaryKey") {
      return tableDetail.identityStrategy.columns
        .map((columnName) => `${quoteIdentifier(columnName)} ASC`)
        .join(", ");
    }

    return "";
  }
}

module.exports = {
  ExportService,
};
