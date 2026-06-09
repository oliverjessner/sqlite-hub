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

test("parses query display and export commands", () => {
  const showOptions = parseCliArguments(["--database:db", "--query:Stock Winners"]);
  const notesOptions = parseCliArguments(["--database:db", "--notes:Stock Winners"]);
  const exportOptions = parseCliArguments([
    "--database:db",
    "--export:Stock Winners",
    "--format:md",
  ]);

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

test("validates export formats", () => {
  assert.equal(normalizeExportFormat("csv"), "csv");
  assert.equal(normalizeExportFormat("TSV"), "tsv");
  assert.throws(() => normalizeExportFormat("json"), /Unsupported export format/);
});
