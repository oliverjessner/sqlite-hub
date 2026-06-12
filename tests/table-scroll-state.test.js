const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let tableScrollStateModulePromise = null;

function loadTableScrollStateModule() {
  if (!tableScrollStateModulePromise) {
    const source = readFileSync(
      path.resolve(__dirname, "../frontend/js/utils/tableScrollState.js"),
      "utf8"
    );
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

    tableScrollStateModulePromise = import(url);
  }

  return tableScrollStateModulePromise;
}

test("table scroll state restores horizontal position for the matching grid", async () => {
  const { captureTableHorizontalScrollState, restoreTableHorizontalScrollState } =
    await loadTableScrollStateModule();
  const key = 'data:events "archive"';
  const previousGrid = { dataset: { tableScrollKey: key }, scrollLeft: 640 };
  const nextGrid = { dataset: { tableScrollKey: key }, scrollLeft: 0 };
  const snapshot = captureTableHorizontalScrollState({
    routeName: "data",
    scrollNodes: [previousGrid],
  });

  assert.equal(
    restoreTableHorizontalScrollState({
      snapshot,
      routeName: "data",
      scrollNodes: [nextGrid],
    }),
    true
  );
  assert.equal(nextGrid.scrollLeft, 640);
});

test("table scroll state is not restored across routes or different grids", async () => {
  const { captureTableHorizontalScrollState, restoreTableHorizontalScrollState } =
    await loadTableScrollStateModule();
  const snapshot = captureTableHorizontalScrollState({
    routeName: "editorResults",
    scrollNodes: [{ dataset: { tableScrollKey: "editor:12" }, scrollLeft: 320 }],
  });
  const nextGrid = { dataset: { tableScrollKey: "editor:13" }, scrollLeft: 0 };

  assert.equal(
    restoreTableHorizontalScrollState({
      snapshot,
      routeName: "data",
      scrollNodes: [nextGrid],
    }),
    false
  );
  assert.equal(
    restoreTableHorizontalScrollState({
      snapshot,
      routeName: "editorResults",
      scrollNodes: [nextGrid],
    }),
    false
  );
  assert.equal(nextGrid.scrollLeft, 0);
});
