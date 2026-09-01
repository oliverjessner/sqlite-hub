const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const express = require("express");
const { createChartsRouter } = require("../server/routes/charts");
const { ChartImageService } = require("../server/services/chartImageService");
const { errorMiddleware } = require("../server/utils/errors");

const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3aUAAAAASUVORK5CYII=";

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
    server.on("error", reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("chart PNG API publishes the rendered image and chart deletion removes it", async (t) => {
  const publicRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-chart-route-"));
  const chartImageService = new ChartImageService(publicRoot);
  const chart = {
    id: 1844,
    name: "AI vs REAL",
    chartType: "pie",
    queryHistoryId: 22,
  };
  let chartDeleted = false;
  const appStateStore = {
    getQueryHistoryChartsForDatabase(databaseId) {
      assert.equal(databaseId, "conn_steam");
      return [{ ...chart, queryTitle: "AI vs REAL query" }];
    },
    getQueryHistoryChartForDatabase(chartId, databaseId) {
      assert.equal(Number(chartId), chart.id);
      assert.equal(databaseId, "conn_steam");
      return chart;
    },
    deleteQueryHistoryChart(chartId, databaseId) {
      assert.equal(Number(chartId), chart.id);
      assert.equal(databaseId, "conn_steam");
      chartDeleted = true;
    },
  };
  const connectionManager = {
    getActiveConnection() {
      return { id: "conn_steam", label: "Steam" };
    },
  };
  const app = express();

  app.use(express.json({ limit: "10mb" }));
  app.use(
    "/api/charts",
    createChartsRouter({
      appStateStore,
      chartImageService,
      connectionManager,
      sqlExecutor: {},
    })
  );
  app.use(errorMiddleware);

  const { server, port } = await listen(app);
  t.after(async () => {
    await close(server);
    fs.rmSync(publicRoot, { recursive: true, force: true });
  });

  const listResponse = await fetch(`http://127.0.0.1:${port}/api/charts`);
  const listPayload = await listResponse.json();

  assert.equal(listResponse.status, 200);
  assert.deepEqual(listPayload.data, [{ ...chart, queryTitle: "AI vs REAL query" }]);

  const publishResponse = await fetch(`http://127.0.0.1:${port}/api/charts/1844/png`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ png: ONE_PIXEL_PNG_DATA_URL }),
  });
  const publishPayload = await publishResponse.json();
  const imagePath = path.join(publicRoot, "conn_steam", "charts", "1844.png");

  assert.equal(publishResponse.status, 200);
  assert.equal(publishPayload.data.url, "/conn_steam/chart/1844.png");
  assert.equal(fs.existsSync(imagePath), true);

  const deleteResponse = await fetch(`http://127.0.0.1:${port}/api/charts/1844`, {
    method: "DELETE",
  });

  assert.equal(deleteResponse.status, 200);
  assert.equal(chartDeleted, true);
  assert.equal(fs.existsSync(imagePath), false);
});
