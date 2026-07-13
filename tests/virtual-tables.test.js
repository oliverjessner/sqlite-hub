const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const test = require("node:test");

const { DataBrowserService } = require("../server/services/sqlite/dataBrowserService");
const { getTableDetail } = require("../server/services/sqlite/introspection");
const { StructureService } = require("../server/services/sqlite/structureService");
const { analyzeTable } = require("../server/services/sqlite/tableAdvisor");
const { listDesignerTables } = require("../server/services/sqlite/tableDesigner/schemaMapping");

function createFtsDatabase(t) {
  const db = new Database(":memory:");

  try {
    db.exec(`
      CREATE VIRTUAL TABLE docs USING fts5(title, body);
      INSERT INTO docs (title, body) VALUES ('One', 'Virtual table row');
    `);
  } catch (error) {
    db.close();
    t.skip(`FTS5 virtual tables are not available: ${error.message}`);
    return null;
  }

  t.after(() => db.close());
  return db;
}

test("sqlite metadata marks virtual tables across data, designer, advisor, and structure", (t) => {
  const db = createFtsDatabase(t);

  if (!db) {
    return;
  }

  const connectionManager = {
    assertWritable() {},
    getActiveDatabase: () => db,
  };
  const dataBrowserService = new DataBrowserService({ connectionManager });
  const structureService = new StructureService({
    connectionManager,
    appStateStore: {
      getSettings: () => ({ defaultPageSize: 50 }),
    },
  });

  const detail = getTableDetail(db, "docs", { includeRowCount: false });
  const dataListEntry = dataBrowserService.listTables().find((table) => table.name === "docs");
  const dataTable = dataBrowserService.getTableData("docs", { limit: 10, offset: 0 });
  const designerListEntry = listDesignerTables(db).find((table) => table.name === "docs");
  const advisorResult = analyzeTable(db, "docs");
  const structure = structureService.getStructureOverview();
  const structureListEntry = structure.grouped.tables.find((table) => table.name === "docs");
  const graphTable = structure.graph.tables.find((table) => table.name === "docs");
  const shadowTableNames = ["docs_config", "docs_content", "docs_data", "docs_docsize", "docs_idx"];
  const dataShadowNames = new Set(
    dataBrowserService
      .listTables()
      .filter((table) => table.isShadow)
      .map((table) => table.name)
  );
  const designerTableNames = new Set(listDesignerTables(db).map((table) => table.name));
  const structureShadowNames = new Set(
    structure.grouped.tables.filter((table) => table.isShadow).map((table) => table.name)
  );
  const shadowDetail = getTableDetail(db, "docs_data", { includeRowCount: false });
  const shadowDataTable = dataBrowserService.getTableData("docs_data", { limit: 10, offset: 0 });
  const shadowAdvisorResult = analyzeTable(db, "docs_data");
  const shadowGraphTable = structure.graph.tables.find((table) => table.name === "docs_data");

  assert.equal(detail.tableKind, "virtual");
  assert.equal(detail.isVirtual, true);
  assert.equal(dataListEntry.isVirtual, true);
  assert.equal(dataListEntry.tableKind, "virtual");
  assert.equal(dataTable.isVirtual, true);
  assert.equal(designerListEntry.isVirtual, true);
  assert.equal(advisorResult.isVirtual, true);
  assert.equal(advisorResult.table.isVirtual, true);
  assert.equal(advisorResult.issues.length, 1);
  assert.equal(advisorResult.issues[0].fixAvailable, false);
  assert.match(advisorResult.issues[0].fixUnavailableReason, /module/i);
  assert.equal(structureListEntry.isVirtual, true);
  assert.equal(graphTable.isVirtual, true);
  assert.equal(graphTable.virtualModule, "fts5");
  assert.equal(shadowDetail.tableKind, "shadow");
  assert.equal(shadowDetail.isShadow, true);
  assert.equal(shadowDataTable.isShadow, true);
  assert.equal(shadowDataTable.readOnly, true);
  assert.equal(shadowAdvisorResult.isShadow, true);
  assert.equal(shadowAdvisorResult.table.isShadow, true);
  assert.equal(shadowAdvisorResult.issues.length, 1);
  assert.equal(shadowAdvisorResult.issues[0].fixAvailable, false);
  assert.match(shadowAdvisorResult.issues[0].fixUnavailableReason, /shadow table/i);
  assert.equal(shadowGraphTable.isShadow, true);
  assert.equal(shadowGraphTable.shadowOwnerTable, "docs");
  shadowTableNames.forEach((tableName) => {
    assert.equal(dataShadowNames.has(tableName), true);
    assert.equal(designerTableNames.has(tableName), false);
    assert.equal(structureShadowNames.has(tableName), true);
  });
  assert.throws(
    () => dataBrowserService.previewTableRowUpdate("docs_data", { values: { block: "x" } }),
    /read-only in Data/
  );
  assert.throws(
    () => dataBrowserService.updateTableRow("docs_data", { values: { block: "x" } }),
    /read-only in Data/
  );
  assert.throws(
    () => dataBrowserService.deleteTableRow("docs_data", {}),
    /read-only in Data/
  );
  assert.throws(
    () => dataBrowserService.insertSyntheticRows("docs_data", { rowCount: 1 }),
    /read-only in Data/
  );
});
