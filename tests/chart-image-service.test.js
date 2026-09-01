const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ChartImageService } = require("../server/services/chartImageService");

const ONE_PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3aUAAAAASUVORK5CYII=";

function createService() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-chart-images-"));

  return {
    root,
    service: new ChartImageService(root),
  };
}

test("chart images are stored under public/database/charts and expose the requested URL", (t) => {
  const { root, service } = createService();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = service.saveChartImage("conn_abc123", 1844, ONE_PIXEL_PNG_DATA_URL);
  const expectedPath = path.join(root, "conn_abc123", "charts", "1844.png");

  assert.equal(result.path, expectedPath);
  assert.equal(result.url, "/conn_abc123/chart/1844.png");
  assert.equal(result.updated, true);
  assert.equal(fs.existsSync(expectedPath), true);
  assert.equal(service.requireChartImage("conn_abc123", 1844), expectedPath);

  const unchanged = service.saveChartImage("conn_abc123", 1844, ONE_PIXEL_PNG_DATA_URL);
  assert.equal(unchanged.updated, false);
});

test("chart image storage rejects unsafe ids and invalid PNG payloads", (t) => {
  const { root, service } = createService();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.throws(
    () => service.saveChartImage("../outside", 1, ONE_PIXEL_PNG_DATA_URL),
    /unsupported characters/
  );
  assert.throws(
    () => service.saveChartImage("conn_safe", "1.png/../2", ONE_PIXEL_PNG_DATA_URL),
    /positive integer/
  );
  assert.throws(
    () => service.saveChartImage("conn_safe", 1, "data:image/png;base64,SGVsbG8="),
    /valid PNG signature/
  );
});

test("deleting a chart removes its published PNG", (t) => {
  const { root, service } = createService();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const published = service.saveChartImage("conn_delete", 7, ONE_PIXEL_PNG_DATA_URL);

  assert.equal(service.deleteChartImage("conn_delete", 7), true);
  assert.equal(fs.existsSync(published.path), false);
  assert.equal(service.deleteChartImage("conn_delete", 7), false);
});
