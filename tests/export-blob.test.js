const Database = require("better-sqlite3");
const assert = require("node:assert/strict");
const parquet = require("parquetjs-lite");
const test = require("node:test");
const { ExportService } = require("../server/services/sqlite/exportService");
const { SqlExecutor } = require("../server/services/sqlite/sqlExecutor");

async function readParquetRows(buffer) {
  const reader = await parquet.ParquetReader.openBuffer(buffer);
  const cursor = reader.getCursor();
  const rows = [];

  try {
    let row;

    while ((row = await cursor.next())) {
      rows.push(row);
    }
  } finally {
    await reader.close();
  }

  return rows;
}

test("query and table exports include complete BLOB data", async () => {
  const db = new Database(":memory:");
  const blob = Buffer.from(Array.from({ length: 100 }, (_, index) => index));

  try {
    db.exec("CREATE TABLE files (id INTEGER PRIMARY KEY, payload BLOB)");
    db.prepare("INSERT INTO files (payload) VALUES (?)").run(blob);

    const connection = { id: "blob-export-test", label: "Blob export" };
    const connectionManager = {
      getActiveConnection: () => connection,
      getActiveDatabase: () => db,
    };
    const appStateStore = {
      findQueryHistoryItemBySql: () => null,
      getSettings: () => ({ csvDelimiter: "," }),
      recordQueryExecution: () => 1,
    };
    const sqlExecutor = new SqlExecutor({ connectionManager, appStateStore });
    const exportService = new ExportService({
      appStateStore,
      connectionManager,
      sqlExecutor,
    });
    const expectedBase64 = blob.toString("base64");
    const queryExport = exportService.exportQuery(
      "SELECT payload FROM files ORDER BY id",
      { format: "csv" }
    );
    const queryJsonExport = exportService.exportQuery(
      "SELECT payload FROM files ORDER BY id",
      { format: "json" }
    );
    const tableExport = exportService.exportTable("files", { format: "tsv" });
    const jsonExport = exportService.exportTable("files", { format: "json" });
    const queryParquetExport = await exportService.exportQueryDownload(
      "SELECT id, payload FROM files ORDER BY id",
      { format: "parquet" }
    );
    const tableParquetExport = await exportService.exportTableDownload("files", { format: "parquet" });

    for (const content of [queryExport.content, tableExport.content]) {
      assert.equal(content.includes(expectedBase64), true);
      assert.match(content, /""encoding"":""base64""/);
      assert.doesNotMatch(content, /base64Preview|hexPreview/);
    }

    assert.equal(jsonExport.mimeType, "application/json; charset=utf-8");
    assert.equal(jsonExport.filename, "files.json");

    const [queryJsonRow] = JSON.parse(queryJsonExport.content);
    const [jsonRow] = JSON.parse(jsonExport.content);
    assert.equal(queryJsonExport.mimeType, "application/json; charset=utf-8");
    assert.equal(queryJsonRow.payload.encoding, "base64");
    assert.equal(queryJsonRow.payload.data, expectedBase64);
    assert.equal(jsonRow.payload.encoding, "base64");
    assert.equal(jsonRow.payload.data, expectedBase64);
    assert.equal(jsonRow.payload.sizeBytes, blob.length);
    assert.equal(jsonExport.content.includes("base64Preview"), false);
    assert.equal(jsonExport.content.includes("hexPreview"), false);

    assert.equal(queryParquetExport.mimeType, "application/vnd.apache.parquet");
    assert.equal(queryParquetExport.filename.endsWith(".parquet"), true);
    assert.equal(Buffer.isBuffer(queryParquetExport.content), true);
    assert.equal(tableParquetExport.filename, "files.parquet");

    const [queryParquetRow] = await readParquetRows(queryParquetExport.content);
    const [tableParquetRow] = await readParquetRows(tableParquetExport.content);
    assert.equal(queryParquetRow.payload.equals(blob), true);
    assert.equal(tableParquetRow.payload.equals(blob), true);
  } finally {
    db.close();
  }
});
