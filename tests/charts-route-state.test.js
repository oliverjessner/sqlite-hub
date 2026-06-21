const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

function jsonResponse(payload) {
  return new Response(JSON.stringify({ success: true, ...payload }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function createChartsFetchMock() {
  const activeConnection = {
    id: "db-one",
    label: "Database One",
    readOnly: false,
  };
  const chartableQuery = {
    id: 10,
    displayTitle: "Revenue Chart",
    previewSql: "select revenue from metrics",
    rawSql: "select revenue from metrics",
    queryType: "select",
    isSaved: false,
    isDestructive: false,
    chartTypes: ["bar"],
  };

  return async function fetchMock(input, options = {}) {
    const url = typeof input === "string" ? input : input.url;
    const method = String(options.method ?? "GET").toUpperCase();

    if (method === "GET" && url === "/api/connections/recent") {
      return jsonResponse({ data: [activeConnection] });
    }

    if (method === "GET" && url === "/api/connections/active") {
      return jsonResponse({ data: activeConnection });
    }

    if (method === "GET" && url === "/api/settings") {
      return jsonResponse({
        data: {},
        metadata: {
          activeDatabase: activeConnection,
          apiTokens: [],
          appVersion: "1.1.2",
          sqliteVersion: "3.50.0",
        },
      });
    }

    if (method === "GET" && url.startsWith("/api/sql/history")) {
      return jsonResponse({ data: { items: [], total: 0, hasMore: false } });
    }

    if (method === "GET" && url === "/api/db/overview") {
      return jsonResponse({ data: { tables: [] } });
    }

    if (method === "GET" && url === "/api/charts/query-history") {
      return jsonResponse({ data: [chartableQuery] });
    }

    if (method === "GET" && url === "/api/charts/query-history/10") {
      return jsonResponse({
        data: {
          item: chartableQuery,
          charts: [],
        },
      });
    }

    if (method === "POST" && url === "/api/charts/query-history/10/execute") {
      return jsonResponse({
        data: {
          columns: ["revenue"],
          rows: [{ revenue: 100 }],
          sql: chartableQuery.rawSql,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "UNEXPECTED_REQUEST", message: `${method} ${url}` },
      }),
      {
        headers: { "content-type": "application/json" },
        status: 500,
      },
    );
  };
}

async function importStoreWithFetch(fetchMock) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = fetchMock;

  const moduleUrl = pathToFileURL(path.resolve(__dirname, "../frontend/js/store.js")).href;
  const store = await import(`${moduleUrl}?charts-route-state=${Date.now()}`);

  return {
    restore() {
      globalThis.fetch = originalFetch;
    },
    store,
  };
}

test("charts route preserves the selected chart when returning from another menu", async () => {
  const { restore, store } = await importStoreWithFetch(createChartsFetchMock());

  try {
    await store.initializeApp();
    await store.setRoute({
      name: "charts",
      params: { historyId: "10" },
      path: "/charts/10",
    });

    assert.equal(store.getState().charts.selectedHistoryId, 10);
    assert.equal(store.getState().charts.detail?.item?.id, 10);

    await store.setRoute({
      name: "overview",
      params: {},
      path: "/overview",
    });
    await store.setRoute({
      name: "charts",
      params: { historyId: null },
      path: "/charts",
    });

    assert.equal(store.getState().charts.selectedHistoryId, 10);
    assert.equal(store.getState().charts.detail?.item?.id, 10);
  } finally {
    restore();
  }
});
