const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

test("chart Markdown uses the published PNG URL and escapes its alt text", async () => {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, "../frontend/js/lib/chartPublicUrl.js")
  ).href;
  const { buildChartMarkdownImage, buildChartPublicPath } = await import(
    `${moduleUrl}?chart-document-insert=${Date.now()}`
  );
  const chart = { id: 1844, name: "AI [vs] REAL" };

  assert.equal(
    buildChartPublicPath(chart, "conn steam"),
    "/conn%20steam/chart/1844.png"
  );
  assert.equal(
    buildChartMarkdownImage(chart, "conn steam", "http://127.0.0.1:4173/"),
    "![AI \\[vs\\] REAL](http://127.0.0.1:4173/conn%20steam/chart/1844.png)"
  );
});

test("invalid chart identifiers do not produce a public image URL", async () => {
  const moduleUrl = pathToFileURL(
    path.resolve(__dirname, "../frontend/js/lib/chartPublicUrl.js")
  ).href;
  const { buildChartMarkdownImage } = await import(
    `${moduleUrl}?invalid-chart-document-insert=${Date.now()}`
  );

  assert.equal(buildChartMarkdownImage({ id: 0, name: "Invalid" }, "db-one", "https://hub.test"), "");
  assert.equal(buildChartMarkdownImage({ id: 1, name: "Missing DB" }, "", "https://hub.test"), "");
});
