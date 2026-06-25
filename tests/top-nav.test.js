const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let topNavModulePromise = null;

function loadTopNavModule() {
  if (!topNavModulePromise) {
    topNavModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/components/topNav.js")).href
    );
  }

  return topNavModulePromise;
}

test("top nav exposes logs from the upper-right action row", async () => {
  const { renderTopNav } = await loadTopNavModule();
  const markup = renderTopNav();

  assert.match(markup, /data-to="\/logs"/);
  assert.match(markup, /aria-label="Logs"/);
  assert.match(markup, />receipt_long<\/span>/);
  assert.doesNotMatch(markup, /aria-label="Open Database"/);
  assert.doesNotMatch(markup, /aria-label="SQL Editor"/);
  assert.doesNotMatch(markup, /aria-label="Settings"/);
});
