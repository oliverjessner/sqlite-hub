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

test("connection card shows two tag names and a remaining tag count", async () => {
  const { renderConnectionCard } = await loadConnectionCardModule();
  const markup = renderConnectionCard(
    createConnection({
      tags: [
        { id: 1, name: "Journalism" },
        { id: 2, name: "Stocks" },
        { id: 3, name: "Research" },
        { id: 4, name: "Client" },
      ],
    }),
    "conn_other"
  );

  assert.match(markup, /Journalism/);
  assert.match(markup, /Stocks/);
  assert.match(markup, /\+2/);
  assert.doesNotMatch(markup, /connection-user-tag">Research/);
});
