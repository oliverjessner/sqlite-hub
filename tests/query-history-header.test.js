const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let queryHistoryHeaderModulePromise = null;

function loadQueryHistoryHeaderModule() {
  if (!queryHistoryHeaderModulePromise) {
    queryHistoryHeaderModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/components/queryHistoryHeader.js")).href
    );
  }

  return queryHistoryHeaderModulePromise;
}

test("query history search renders a magnifier icon", async () => {
  const { renderQueryHistorySearch } = await loadQueryHistoryHeaderModule();
  const markup = renderQueryHistorySearch({
    bind: "charts-history-search",
    value: "revenue",
  });

  assert.match(markup, /query-history-search/);
  assert.match(markup, /query-history-search__icon/);
  assert.match(markup, />search<\/span>/);
  assert.match(markup, /data-bind="charts-history-search"/);
  assert.match(markup, /value="revenue"/);
});
