const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

test("query results render an explicit truncation notice", async () => {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, "../frontend/js/components/queryResults.js")
  ).href;
  const { renderQueryResultsPane } = await import(moduleUrl);
  const html = renderQueryResultsPane({
    columns: ["id"],
    rows: [{ id: 1 }, { id: 2 }],
    truncated: true,
    rowLimit: 2,
  });

  assert.match(html, /Showing the first 2 rows/);
  assert.match(html, /export it to process the complete result set/);
});
