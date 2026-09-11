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
  assert.equal(route.path, "/browse");
  assert.equal(route.params.tableName, null);
  assert.equal(route.params.rowPrimaryKey, "14a06a1ffa23e08ae86becec0c5d8b38");
});

test("data table route keeps table name and row primary key separate", async () => {
  const { parseHash } = await loadRouterModule();
  const route = parseHash("#/data/companies#abc%20123");

  assert.equal(route.name, "data");
  assert.equal(route.path, "/browse");
  assert.equal(route.params.tableName, "companies");
  assert.equal(route.params.rowPrimaryKey, "abc 123");
});

test("table advisor route supports an optional table name", async () => {
  const { parseHash } = await loadRouterModule();
  const route = parseHash("#/table-advisor/users");

  assert.equal(route.name, "tableAdvisor");
  assert.equal(route.path, "/table-advisor/users");
  assert.equal(route.params.tableName, "users");
});

test("text-to-struct route resolves to the workspace feature", async () => {
  const { parseHash } = await loadRouterModule();
  const route = parseHash("#/text-to-struct");

  assert.deepEqual(route, { name: "textToStruct", path: "/text-to-struct", params: {} });
});

test('Browse and Sheets use distinct top-level routes while legacy Data links remain readable', async () => {
  const { parseHash } = await loadRouterModule();
  const browse = parseHash('#/browse');
  const sheets = parseHash('#/sheets');
  assert.equal(browse.params.mode, 'browse');
  assert.equal(sheets.params.mode, 'sheets');
  assert.equal(browse.path, '/browse');
  assert.equal(sheets.path, '/sheets');
  assert.equal(browse.params.tableName, null);
  assert.equal(sheets.params.tableName, null);
  assert.equal(parseHash('#/data').params.mode, 'browse');
  assert.equal(parseHash('#/data/items#row%201').params.rowPrimaryKey, 'row 1');
});

test('the router replaces a legacy Data URL with the canonical Browse URL', async () => {
  const { createRouter } = await loadRouterModule();
  const originalWindow = global.window;
  const routes = [];
  let listener = null;
  global.window = {
    location: { hash: '#/data/companies' },
    history: {
      replaceState(_state, _title, hash) {
        global.window.location.hash = hash;
      },
    },
    addEventListener(event, callback) {
      if (event === 'hashchange') listener = callback;
    },
  };

  try {
    createRouter(route => routes.push(route)).start();
    assert.equal(typeof listener, 'function');
    assert.equal(global.window.location.hash, '#/browse');
    assert.equal(routes[0].path, '/browse');
    assert.equal(routes[0].params.tableName, 'companies');
  } finally {
    global.window = originalWindow;
  }
});
