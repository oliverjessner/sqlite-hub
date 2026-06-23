const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let routerModulePromise = null;

function loadRouterModule() {
  if (!routerModulePromise) {
    routerModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/router.js")).href
    );
  }

  return routerModulePromise;
}

test("data route reads a row primary key from the second hash", async () => {
  const { parseHash } = await loadRouterModule();
  const route = parseHash("#/data#14a06a1ffa23e08ae86becec0c5d8b38");

  assert.equal(route.name, "data");
  assert.equal(route.path, "/data");
  assert.equal(route.params.tableName, null);
  assert.equal(route.params.rowPrimaryKey, "14a06a1ffa23e08ae86becec0c5d8b38");
});

test("data table route keeps table name and row primary key separate", async () => {
  const { parseHash } = await loadRouterModule();
  const route = parseHash("#/data/companies#abc%20123");

  assert.equal(route.name, "data");
  assert.equal(route.path, "/data/companies");
  assert.equal(route.params.tableName, "companies");
  assert.equal(route.params.rowPrimaryKey, "abc 123");
});
