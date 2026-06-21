const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let queryHistoryDetailModulePromise = null;

function loadQueryHistoryDetailModule() {
  if (!queryHistoryDetailModulePromise) {
    queryHistoryDetailModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/components/queryHistoryDetail.js")).href
    );
  }

  return queryHistoryDetailModulePromise;
}

test("query history detail delete button renders a trash icon", async () => {
  const { renderQueryHistoryDetail } = await loadQueryHistoryDetailModule();
  const html = renderQueryHistoryDetail({
    item: {
      id: 42,
      displayTitle: "Recent Query",
      rawSql: "select * from companies;",
      queryType: "select",
      isSaved: false,
      isDestructive: false,
      executionCount: 1,
      createdAt: "2026-06-21T10:00:00.000Z",
      updatedAt: "2026-06-21T10:00:00.000Z",
    },
    runs: [],
  });

  assert.match(html, /data-action="open-delete-query-history-modal"/);
  assert.match(html, /<span class="material-symbols-outlined text-sm">delete<\/span>Delete/);
});
