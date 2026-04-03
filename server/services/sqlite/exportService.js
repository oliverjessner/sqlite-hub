const { rowsToCsv } = require("../../utils/csv");

class ExportService {
  constructor({ appStateStore, sqlExecutor }) {
    this.appStateStore = appStateStore;
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
}

module.exports = {
  ExportService,
};
