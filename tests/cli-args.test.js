const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeExportFormat,
  parseCliArguments,
} = require("../bin/sqlite-hub");

test("parses database execute command", () => {
  const options = parseCliArguments([
    "--database:trump live interviews",
    "--execute:Stock Winners",
  ]);

  assert.equal(options.databaseName, "trump live interviews");
  assert.equal(options.executeQuery, "Stock Winners");
  assert.equal(options.queries, false);
});

test("parses database table list command", () => {
  const options = parseCliArguments(["--database:trump live interviews", "--tables"]);

  assert.equal(options.databaseName, "trump live interviews");
  assert.equal(options.tables, true);
});

test("parses database info commands with the new schema", () => {
  assert.equal(parseCliArguments(["--database:db", "--path"]).pathInfo, true);
  assert.equal(parseCliArguments(["--database:db", "---path"]).pathInfo, true);
  assert.equal(parseCliArguments(["--database:db", "--size"]).sizeInfo, true);
  assert.equal(parseCliArguments(["--database:db", "--lastopened"]).lastOpenedInfo, true);
});

test("parses app info command and keeps config as a legacy alias", () => {
  assert.equal(parseCliArguments(["--info"]).info, true);
  assert.equal(parseCliArguments(["--config"]).info, true);
});

test("keeps old sqleditor aliases working", () => {
  const listOptions = parseCliArguments(["--database:Unit-00", "--sqleditor"]);
  const executeOptions = parseCliArguments(["--database:Unit-00", "--sqleditor:Saved Query"]);

  assert.equal(listOptions.queries, true);
  assert.equal(executeOptions.executeQuery, "Saved Query");
});

test("keeps old database detail aliases working", () => {
  const pathOptions = parseCliArguments(["--database-path:Billly", "--queries"]);
  const tableOptions = parseCliArguments(["--database-tables:Billly"]);

  assert.equal(pathOptions.databaseName, "Billly");
  assert.equal(pathOptions.pathInfo, true);
  assert.equal(pathOptions.queries, true);
  assert.equal(tableOptions.databaseName, "Billly");
  assert.equal(tableOptions.tables, true);
});

test("parses raw query, saved query display, and export commands", () => {
  const rawOptions = parseCliArguments(["--database:db", "--query:SELECT 1"]);
  const showOptions = parseCliArguments(["--database:db", "--saved-query:Stock Winners"]);
  const notesOptions = parseCliArguments(["--database:db", "--notes:Stock Winners"]);
  const exportOptions = parseCliArguments([
    "--database:db",
    "--export:Stock Winners",
    "--format:md",
  ]);

  assert.equal(rawOptions.rawQuery, "SELECT 1");
  assert.equal(showOptions.showQuery, "Stock Winners");
  assert.equal(notesOptions.showNotes, "Stock Winners");
  assert.equal(exportOptions.exportTarget, "Stock Winners");
  assert.equal(exportOptions.exportFormat, "md");
});

test("parses row json export command", () => {
  const options = parseCliArguments([
    "--database:db",
    "--table:companies",
    "--export:0a754aba373d34972998792a0be4333c",
  ]);

  assert.equal(options.tableName, "companies");
  assert.equal(options.exportTarget, "0a754aba373d34972998792a0be4333c");
});

test("parses document commands", () => {
  const listOptions = parseCliArguments(["--database:db", "--documents"]);
  const showOptions = parseCliArguments(["--database:db", "--documents:Research Note"]);
  const exportOptions = parseCliArguments(["--database:db", "--documents:Research Note", "--export"]);
  const compactExportOptions = parseCliArguments(["--database:db", "--documents:Research Note--export"]);

  assert.equal(listOptions.documents, true);
  assert.equal(listOptions.documentName, null);
  assert.equal(showOptions.documents, true);
  assert.equal(showOptions.documentName, "Research Note");
  assert.equal(showOptions.documentExport, false);
  assert.equal(exportOptions.documentName, "Research Note");
  assert.equal(exportOptions.documentExport, true);
  assert.equal(compactExportOptions.documentName, "Research Note");
  assert.equal(compactExportOptions.documentExport, true);
});

test("validates export formats", () => {
  assert.equal(normalizeExportFormat("csv"), "csv");
  assert.equal(normalizeExportFormat("TSV"), "tsv");
  assert.equal(normalizeExportFormat("json"), "json");
  assert.throws(() => normalizeExportFormat("xlsx"), /Unsupported export format/);
});
