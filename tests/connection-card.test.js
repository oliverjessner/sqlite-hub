const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

let connectionCardModulePromise = null;

function loadConnectionCardModule() {
  if (!connectionCardModulePromise) {
    connectionCardModulePromise = import(
      pathToFileURL(path.resolve(__dirname, "../frontend/js/components/connectionCard.js")).href
    );
  }

  return connectionCardModulePromise;
}

function createConnection(overrides = {}) {
  return {
    id: "conn_one",
    label: "Customers",
    path: "/tmp/customers.sqlite",
    sizeBytes: 1024,
    lastModifiedAt: "2026-06-28T10:00:00.000Z",
    lastOpenedAt: "2026-06-28T11:00:00.000Z",
    readOnly: false,
    ...overrides,
  };
}

test("connection card highlights read-only mode with the accent color", async () => {
  const { renderConnectionCard } = await loadConnectionCardModule();
  const readOnlyMarkup = renderConnectionCard(createConnection({ readOnly: true }), "conn_one");
  const readWriteMarkup = renderConnectionCard(createConnection({ readOnly: false }), "conn_one");

  assert.match(readOnlyMarkup, /text-primary-container">\s*Read only/);
  assert.match(readWriteMarkup, /text-on-surface">\s*Read \/ Write/);
});
