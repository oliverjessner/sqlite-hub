const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let formatModulePromise = null;

function loadFormatModule() {
  if (!formatModulePromise) {
    const source = readFileSync(
      path.resolve(__dirname, "../frontend/js/utils/format.js"),
      "utf8"
    );
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

    formatModulePromise = import(url);
  }

  return formatModulePromise;
}

test("SQL highlighting marks CASE and null-check keywords", async () => {
  const { highlightSql } = await loadFormatModule();
  const highlighted = highlightSql("CASE WHEN upload_date IS NULL THEN NULL ELSE 1 END");

  for (const keyword of ["CASE", "WHEN", "IS", "NULL", "THEN", "ELSE", "END"]) {
    assert.match(highlighted, new RegExp(`<span class="sql-keyword">${keyword}</span>`));
  }
});

test("SQL highlighting marks window function keywords", async () => {
  const { highlightSql } = await loadFormatModule();
  const highlighted = highlightSql("ROW_NUMBER() OVER (PARTITION BY window_label ORDER BY delta_return DESC)");

  for (const keyword of ["ROW_NUMBER", "OVER", "PARTITION", "ORDER", "BY", "DESC"]) {
    assert.match(highlighted, new RegExp(`<span class="sql-keyword">${keyword}</span>`));
  }
});
