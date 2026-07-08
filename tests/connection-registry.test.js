const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let registryModulePromise = null;

function loadRegistryModule() {
  if (!registryModulePromise) {
    registryModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/utils/connectionRegistry.js")).href
    );
  }

  return registryModulePromise;
}

function createConnections() {
  return [
    {
      id: "conn_trump",
      label: "TRUMP LIVE INTERVIEWS",
      path: "/Users/oli/database/project_trump/trump.sqlite",
      tags: [
        { id: 1, name: "Journalism" },
        { id: 2, name: "Research" },
      ],
    },
    {
      id: "conn_client",
      label: "Client Ledger",
      path: "/Users/oli/database/client.sqlite",
      tags: [{ id: 3, name: "Client" }],
    },
    {
      id: "conn_stocks",
      label: "Market Notes",
      path: "/Users/oli/database/stocks.sqlite",
      tags: [{ id: 4, name: "Stocks" }],
    },
  ];
}

test("connection registry search matches name, filename, path, and tags", async () => {
  const { filterConnections } = await loadRegistryModule();
  const connections = createConnections();

  assert.deepEqual(
    filterConnections(connections, { searchQuery: "trump" }).map(connection => connection.id),
    ["conn_trump"]
  );
  assert.deepEqual(
    filterConnections(connections, { searchQuery: "CLIENT.SQLITE" }).map(connection => connection.id),
    ["conn_client"]
  );
  assert.deepEqual(
    filterConnections(connections, { searchQuery: "project_trump" }).map(connection => connection.id),
    ["conn_trump"]
  );
  assert.deepEqual(
    filterConnections(connections, { searchQuery: "journalism" }).map(connection => connection.id),
    ["conn_trump"]
  );
  assert.equal(filterConnections(connections, { searchQuery: "   " }).length, 3);
});

test("connection registry tag filters use OR and combine with search by AND", async () => {
  const { filterConnections } = await loadRegistryModule();
  const connections = createConnections();

  assert.deepEqual(
    filterConnections(connections, { selectedTagIds: [1] }).map(connection => connection.id),
    ["conn_trump"]
  );
  assert.deepEqual(
    filterConnections(connections, { selectedTagIds: [1, 3] }).map(connection => connection.id),
    ["conn_trump", "conn_client"]
  );
  assert.deepEqual(
    filterConnections(connections, { searchQuery: "trump", selectedTagIds: [3, 4] }).map(
      connection => connection.id
    ),
    []
  );
  assert.deepEqual(
    filterConnections(connections, { searchQuery: "trump", selectedTagIds: [1, 3] }).map(
      connection => connection.id
    ),
    ["conn_trump"]
  );
});
