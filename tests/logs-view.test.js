const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let logsViewModulePromise = null;

function loadLogsViewModule() {
  if (!logsViewModulePromise) {
    logsViewModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/views/logs.js")).href
    );
  }

  return logsViewModulePromise;
}

test("logs view renders top-right route content with useful filters", async () => {
  const { renderLogsView } = await loadLogsViewModule();
  const rendered = renderLogsView({
    logs: {
      loading: false,
      error: null,
      total: 1,
      hasMore: false,
      filters: {
        kind: "all",
        actor: "cli",
        status: "all",
        queryType: "all",
        destructive: "all",
        searchInput: "companies",
      },
      metadata: {
        activeDatabase: {
          label: "Database One",
        },
      },
      items: [
        {
          id: "query:1",
          kind: "query",
          source: "query_history",
          action: "query.execute",
          databaseKey: "db-one",
          targetType: "query",
          targetName: "Company List",
          status: "success",
          occurredAt: "2026-06-25T09:00:00.000Z",
          durationMs: 5,
          executedBy: "cli",
          queryType: "select",
          destructive: false,
          rowCount: 2,
          affectedRows: 0,
          rawSql: "SELECT * FROM companies",
          preview: "SELECT * FROM companies",
          metadata: {},
        },
      ],
    },
  });

  assert.doesNotMatch(rendered.main, /System \/\/ Query and access history/);
  assert.doesNotMatch(rendered.main, /Query history plus CLI\/API access log/);
  assert.match(rendered.main, /data-logs-view/);
  assert.match(rendered.main, /data-logs-active-database-id=""/);
  assert.match(rendered.main, /data-logs-table/);
  assert.match(rendered.main, /data-logs-table-scroll/);
  assert.match(rendered.main, /shell-section flex min-h-0 flex-1 flex-col overflow-hidden/);
  assert.match(rendered.main, /custom-scrollbar min-h-0 flex-1 overflow-auto/);
  assert.match(rendered.main, /data-logs-meta="visible"/);
  assert.match(rendered.main, /data-form="logs-search"/);
  assert.match(rendered.main, /data-bind="logs-search"/);
  assert.match(rendered.main, /charts-height-toggle/);
  assert.match(rendered.main, /standard-button charts-height-toggle__button/);
  assert.match(rendered.main, /data-action="set-log-filter"/);
  assert.match(rendered.main, /data-field="actor"/);
  assert.match(rendered.main, /data-value="mcp"/);
  assert.match(rendered.main, /Executed By/);
  assert.match(rendered.main, /min-w-0 xl:col-span-2/);
  assert.match(rendered.main, /data-field="queryType"/);
  assert.doesNotMatch(rendered.main, /data-field="destructive"/);
  assert.doesNotMatch(rendered.main, /data-field="databaseScope"/);
  assert.doesNotMatch(rendered.main, /All DBs/);
  assert.match(rendered.main, /query-history-badge-row query-history-badge-row--compact logs-detail-badge-row/);
  assert.doesNotMatch(rendered.main, /status-badge[^<]*>query</i);
  assert.doesNotMatch(rendered.main, /status-badge[^<]*>cli</i);
  assert.doesNotMatch(rendered.main, /status-badge[^<]*>success</i);
  assert.match(rendered.main, /text-primary-container">\s*cli\s*<\/td>/i);
  assert.match(rendered.main, /Company List/);
  assert.match(rendered.main, /SELECT \* FROM companies/);
  assert.equal(rendered.panel, "");
});
