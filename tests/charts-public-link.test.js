const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

test("chart cards show the public PNG URL and an open-in-browser action", async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, "../frontend/js/views/charts.js")).href;
  const { renderChartsDetail } = await import(`${moduleUrl}?public-chart-link=${Date.now()}`);
  const state = {
    connections: {
      active: { id: "conn_steam" },
    },
    charts: {
      selectedHistoryId: 22,
      historyPanelVisible: true,
      chartHeightPreset: "medium",
      detail: {
        item: { id: 22, displayTitle: "AI vs REAL" },
        charts: [
          {
            id: 1844,
            name: "Pie_AI vs REAL",
            chartType: "pie",
            config: {
              label_column: "category",
              value_column: "games",
              show_legend: true,
              show_labels: true,
              donut: false,
            },
          },
        ],
      },
      result: {
        columns: ["category", "games"],
        rows: [
          { category: "AI", games: 1168 },
          { category: "Non-AI", games: 1635 },
        ],
      },
      resultLoading: false,
      resultError: null,
    },
  };
  const html = renderChartsDetail(state);

  assert.match(html, /href="\/conn_steam\/chart\/1844\.png"/);
  assert.match(html, />\/conn_steam\/chart\/1844\.png<\/a>/);
  assert.match(html, /Open in Browser/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
