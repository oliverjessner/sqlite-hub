const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

async function importChartModules() {
  const chartsUrl = pathToFileURL(path.resolve(__dirname, "../frontend/js/lib/queryCharts.js")).href;
  const optionsUrl = pathToFileURL(
    path.resolve(__dirname, "../frontend/js/lib/queryChartOptions.js")
  ).href;

  return {
    charts: await import(`${chartsUrl}?wide-pie=${Date.now()}`),
    options: await import(`${optionsUrl}?wide-pie=${Date.now()}`),
  };
}

function createPieChart(config = {}) {
  return {
    name: "Totals",
    config: {
      label_column: "ai_games",
      value_column: "none_ai_games",
      show_legend: true,
      show_labels: true,
      donut: false,
      ...config,
    },
  };
}

test("single-row numeric results render one pie slice per column", async () => {
  const { charts, options } = await importChartModules();
  const result = {
    columns: ["ai_games", "none_ai_games", "unknown_games"],
    rows: [{ ai_games: 1168, none_ai_games: 1635, unknown_games: 12 }],
  };
  const analysis = charts.analyzeQueryChartResult(result);
  const option = options.buildPieChartOption(createPieChart(), result.rows, analysis);

  assert.equal(charts.isWidePieChartResult(analysis), true);
  assert.equal(charts.suggestQueryChartType(analysis), "pie");
  assert.deepEqual(option.series[0].data, [
    { name: "ai_games", value: 1168 },
    { name: "none_ai_games", value: 1635 },
    { name: "unknown_games", value: 12 },
  ]);
});

test("wide pies generate a distinct color for every slice", async () => {
  const { charts, options } = await importChartModules();
  const columns = Array.from({ length: 9 }, (_, index) => `value_${index + 1}`);
  const row = Object.fromEntries(columns.map((column, index) => [column, index + 1]));
  const result = { columns, rows: [row] };
  const analysis = charts.analyzeQueryChartResult(result);
  const option = options.buildPieChartOption(createPieChart(), result.rows, analysis);

  assert.equal(option.series[0].data.length, columns.length);
  assert.equal(new Set(option.color).size, columns.length);
});

test("multi-row label/value pies retain their existing mapping", async () => {
  const { charts, options } = await importChartModules();
  const result = {
    columns: ["category", "games"],
    rows: [
      { category: "AI", games: 1168 },
      { category: "Non-AI", games: 1635 },
    ],
  };
  const analysis = charts.analyzeQueryChartResult(result);
  const option = options.buildPieChartOption(
    createPieChart({ label_column: "category", value_column: "games" }),
    result.rows,
    analysis
  );

  assert.equal(charts.isWidePieChartResult(analysis), false);
  assert.deepEqual(option.series[0].data, [
    { name: "AI", value: 1168 },
    { name: "Non-AI", value: 1635 },
  ]);
});
