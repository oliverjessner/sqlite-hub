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

  app.use(express.json({ limit: "100kb" }));
  app.use("/mcp", createMcpHttpRouter({ services: { toolService, statusService } }));

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return {
    app,
    statusService,
    store,
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

test("MCP HTTP resource discovery succeeds without recording a server error", async (t) => {
  const { app, statusService } = createHttpFixture(t);
  const baseUrl = await startTestServer(t, app);

  await postMcp(baseUrl, { jsonrpc: "2.0", id: 1, method: "initialize" });

  for (const [method, result] of [
    ["resources/list", { resources: [] }],
    ["resources/templates/list", { resourceTemplates: [] }],
  ]) {
    const { response, payload } = await postMcp(baseUrl, { jsonrpc: "2.0", id: 2, method });

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { jsonrpc: "2.0", id: 2, result });
    assert.equal(statusService.getStatus().error, null);
    assert.equal(statusService.getStatus().connected, true);
  }
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

test("MCP HTTP errors persist request context once and survive reconnecting", async (t) => {
  const { app, store } = createHttpFixture(t);
  const baseUrl = await startTestServer(t, app);
  const unknown = await postMcp(baseUrl, {
    jsonrpc: "2.0", id: 0, method: "unknown/method",
    params: { secret: "must-not-be-logged" },
  });
  assert.equal(unknown.payload.error.code, -32601);

  const failure = await postMcp(baseUrl, {
    jsonrpc: "2.0", id: "failed-tool", method: "tools/call",
    params: { name: "run_readonly_query", arguments: { databaseId: "db-sample", sql: "DELETE FROM companies" } },
  });
  assert.ok(failure.payload.error);
  await postMcp(baseUrl, { jsonrpc: "2.0", id: 3, method: "initialize" });

  const logs = store.listActivityLogs({ actor: "mcp", status: "error", databaseKey: "db-sample" });
  assert.equal(logs.total, 2);
  const protocolError = logs.items.find((item) => item.metadata.requestId === 0);
  assert.equal(protocolError.source, "mcp");
  assert.equal(protocolError.action, "mcp.request.error");
  assert.equal(protocolError.databaseKey, null);
  assert.equal(protocolError.errorMessage, "Unsupported MCP method: unknown/method");
  assert.match(protocolError.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(protocolError.metadata, {
    transport: "http", method: "unknown/method", requestId: 0,
    toolName: null, errorCode: "MCP_METHOD_NOT_FOUND",
  });
  const toolError = logs.items.find((item) => item.metadata.requestId === "failed-tool");
  assert.equal(toolError.databaseKey, "db-sample");
  assert.equal(toolError.metadata.toolName, "run_readonly_query");
  assert.equal(JSON.stringify(logs).includes("must-not-be-logged"), false);
  assert.equal(JSON.stringify(logs).includes("DELETE FROM companies"), false);
  assert.equal(store.listActivityLogs({ actor: "mcp", databaseKey: "another-db" }).total, 1);
});
