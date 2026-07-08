const { getRawStructureEntries, getTableDetail } = require("./introspection");
const { quoteIdentifier } = require("../../utils/identifier");
const { serializeRows } = require("../../utils/sqliteTypes");
const { TypeGenerationService } = require("../typeGenerationService");

function resolveShadowOwnerTableName(shadowTable, tables) {
  if (!shadowTable?.isShadow) {
    return null;
  }

  return (
    tables
      .filter((table) => table.isVirtual && shadowTable.name.startsWith(`${table.name}_`))
      .sort((left, right) => right.name.length - left.name.length)[0]?.name ?? null
  );
}

function unquoteSqlIdentifier(identifier) {
  const value = String(identifier ?? "").trim();

  if (value.length >= 2 && value[0] === '"' && value.at(-1) === '"') {
    return value.slice(1, -1).replace(/""/g, '"');
  }

  if (value.length >= 2 && value[0] === "`" && value.at(-1) === "`") {
    return value.slice(1, -1).replace(/``/g, "`");
  }

  if (value.length >= 2 && value[0] === "[" && value.at(-1) === "]") {
    return value.slice(1, -1);
  }

  return value;
}

function extractVirtualTableModule(ddl = "") {
  const match = String(ddl ?? "").match(
    /\bUSING\s+("[^"]+(?:""[^"]*)*"|`[^`]+(?:``[^`]*)*`|\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_]*)/i
  );

  return match ? unquoteSqlIdentifier(match[1]) : null;
}

function serializeGraphTable(table, shadowOwnerTableName = null) {
  const isVirtual = Boolean(table.isVirtual);

  return {
    type: table.type,
    name: table.name,
    ddl: table.ddl,
    tableKind: table.tableKind,
    isVirtual,
    isShadow: Boolean(table.isShadow),
    virtualModule: isVirtual ? extractVirtualTableModule(table.ddl) : null,
    shadowOwnerTable: shadowOwnerTableName,
    withoutRowId: table.withoutRowId,
    strict: table.strict,
    columns: table.columns,
    foreignKeys: table.foreignKeys,
    identityStrategy: table.identityStrategy,
    notSafelyUpdatable: table.notSafelyUpdatable,
  };
}

class StructureService {
  constructor({ connectionManager, appStateStore }) {
    this.connectionManager = connectionManager;
    this.appStateStore = appStateStore;
    this.typeGenerationService = new TypeGenerationService();
  }

  getStructureOverview() {
    const db = this.connectionManager.getActiveDatabase();
    const entries = getRawStructureEntries(db);
    const tables = entries
      .filter((entry) => entry.type === "table")
      .map((entry) => getTableDetail(db, entry.name, { includeRowCount: false }));
    const relationshipCount = tables.reduce(
      (count, table) =>
        count +
        table.foreignKeys.reduce(
          (tableCount, foreignKey) => tableCount + foreignKey.mappings.length,
          0
        ),
      0
    );

    return {
      entries,
      grouped: {
        tables: entries.filter((entry) => entry.type === "table"),
        views: entries.filter((entry) => entry.type === "view"),
        indexes: entries.filter((entry) => entry.type === "index"),
        triggers: entries.filter((entry) => entry.type === "trigger"),
      },
      graph: {
        tables: tables.map((table) =>
          serializeGraphTable(table, resolveShadowOwnerTableName(table, tables))
        ),
        relationshipCount,
      },
    };
  }

  getTableStructure(tableName) {
    const db = this.connectionManager.getActiveDatabase();
    const table = getTableDetail(db, tableName);
    const previewLimit = Math.max(1, this.appStateStore.getSettings().defaultPageSize ?? 50);
    const previewStatement = db.prepare(
      ["SELECT * FROM", quoteIdentifier(tableName), "LIMIT ?"].join(" ")
    );
    const previewRows = serializeRows(previewStatement.all(previewLimit));
    const previewColumns = previewStatement.columns().map((column) => column.name);

    return {
      type: table.type,
      name: table.name,
      ddl: table.ddl,
      tableKind: table.tableKind,
      isVirtual: Boolean(table.isVirtual),
      isShadow: Boolean(table.isShadow),
      virtualModule: table.isVirtual ? extractVirtualTableModule(table.ddl) : null,
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

  generateTableTypes(tableName, target, options = {}) {
    const db = this.connectionManager.getActiveDatabase();
    return this.typeGenerationService.generateTypesFromDatabase(db, tableName, target, options);
  }
}

module.exports = {
  StructureService,
};
