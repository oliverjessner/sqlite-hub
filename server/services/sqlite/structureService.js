const { getRawStructureEntries, getTableDetail } = require("./introspection");
const { quoteIdentifier } = require("../../utils/identifier");
const { serializeRows } = require("../../utils/sqliteTypes");

class StructureService {
  constructor({ connectionManager, appStateStore }) {
    this.connectionManager = connectionManager;
    this.appStateStore = appStateStore;
  }

  getStructureOverview() {
    const db = this.connectionManager.getActiveDatabase();
    const entries = getRawStructureEntries(db);

    return {
      entries,
      grouped: {
        tables: entries.filter((entry) => entry.type === "table"),
        views: entries.filter((entry) => entry.type === "view"),
        indexes: entries.filter((entry) => entry.type === "index"),
        triggers: entries.filter((entry) => entry.type === "trigger"),
      },
    };
  }

  getTableStructure(tableName) {
    const db = this.connectionManager.getActiveDatabase();
    const table = getTableDetail(db, tableName);
    const previewLimit = Math.max(1, this.appStateStore.getSettings().defaultPageSize ?? 50);
    const previewStatement = db.prepare(
      `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT ${previewLimit}`
    );
    const previewRows = serializeRows(previewStatement.all());
    const previewColumns = previewStatement.columns().map((column) => column.name);

    return {
      type: table.type,
      name: table.name,
      ddl: table.ddl,
      withoutRowId: table.withoutRowId,
      strict: table.strict,
      columns: table.columns,
      foreignKeys: table.foreignKeys,
      indexes: table.indexes,
      triggers: table.triggers,
      rowCount: table.rowCount,
      preview: {
        limit: previewLimit,
        columns: previewColumns,
        rows: previewRows,
      },
      identityStrategy: table.identityStrategy,
      notSafelyUpdatable: table.notSafelyUpdatable,
    };
  }
}

module.exports = {
  StructureService,
};
