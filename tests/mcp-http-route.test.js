const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");

const { createMcpHttpRouter } = require("../server/mcp/httpRouter");
const { DatabaseCommandService } = require("../server/services/databaseCommandService");
const { MCP_TOOL_DEFINITIONS, McpToolService } = require("../server/services/mcpToolService");
const { McpStatusService } = require("../server/services/mcpStatusService");
const { AppStateStore } = require("../server/services/storage/appStateStore");

function createHttpFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-mcp-http-"));
  const databasePath = path.join(directory, "sample.db");
  const db = new Database(databasePath);

  db.exec(`
    CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO companies (name) VALUES ('Acme');
  `);
  db.close();

  const store = new AppStateStore(path.join(directory, "state.db"));
  const connection = {
    id: "db-sample",
    label: "Sample",
    path: databasePath,
    lastOpenedAt: "2026-06-28T10:00:00.000Z",
    lastModifiedAt: "2026-06-28T10:00:00.000Z",
    sizeBytes: fs.statSync(databasePath).size,
    readOnly: false,
    logoPath: null,
  };

  store.upsertRecentConnection(connection);

  const databaseService = new DatabaseCommandService({ appStateStore: store });
  const statusService = new McpStatusService({
    appStateStore: store,
    exposedTools: MCP_TOOL_DEFINITIONS,
    transport: "http",
  });
  const toolService = new McpToolService({
    databaseService,
    statusService,
  });
  const app = express();

  app.use(express.json());
  app.use("/mcp", createMcpHttpRouter({ services: { toolService, statusService } }));

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return {
    app,
    statusService,
  };
}

async function startTestServer(t, app) {
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  return `http://127.0.0.1:${server.address().port}`;
}

async function postMcp(baseUrl, body) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });

  return {
    response,
    payload: await response.json(),
  };
}

test("MCP HTTP endpoint handles initialize, tools/list, and tools/call", async (t) => {
  const { app, statusService } = createHttpFixture(t);
  const baseUrl = await startTestServer(t, app);

  const init = await postMcp(baseUrl, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {},
  });

  assert.equal(init.response.status, 200);
  assert.equal(init.payload.result.serverInfo.name, "sqlite-hub");
  assert.equal(statusService.getStatus().transport, "http");
  assert.equal(statusService.getStatus().connected, true);

  const list = await postMcp(baseUrl, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  });

  assert.equal(list.response.status, 200);
  assert.equal(list.payload.result.tools.some((tool) => tool.name === "list_connections"), true);

  const call = await postMcp(baseUrl, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "list_connections",
      arguments: {},
    },
  });

  assert.equal(call.response.status, 200);
  assert.equal(call.payload.result.structuredContent.items.length, 1);
  assert.match(call.payload.result.content[0].text, /Sample/);
  assert.equal(statusService.getStatus().lastToolName, "list_connections");
});

test("MCP HTTP endpoint documents POST-only transport", async (t) => {
  const { app } = createHttpFixture(t);
  const baseUrl = await startTestServer(t, app);
  const response = await fetch(`${baseUrl}/mcp`);
  const payload = await response.json();

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST, OPTIONS");
  assert.match(payload.error, /Streamable HTTP POST/);
});
