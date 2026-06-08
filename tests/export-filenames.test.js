const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let exportFilenamesModulePromise = null;

function loadExportFilenamesModule() {
  if (!exportFilenamesModulePromise) {
    const source = readFileSync(
      path.resolve(__dirname, "../frontend/js/utils/exportFilenames.js"),
      "utf8"
    );
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

    exportFilenamesModulePromise = import(url);
  }

  return exportFilenamesModulePromise;
}

test("text export filenames use the selected format extension", async () => {
  const { buildTextExportFilename } = await loadExportFilenamesModule();

  assert.equal(buildTextExportFilename("query-results.csv", { format: "tsv" }), "query-results.tsv");
  assert.equal(buildTextExportFilename("white_house_live_streams", { format: "md" }), "white_house_live_streams.md");
});

test("text export filenames sanitize unsafe names and fallback when empty", async () => {
  const { buildTextExportFilename } = await loadExportFilenamesModule();

  assert.equal(buildTextExportFilename("", { format: "csv", fallback: "table" }), "table.csv");
  assert.equal(buildTextExportFilename("../bad:name?.csv", { format: "csv", fallback: "table" }), "bad name.csv");
});
