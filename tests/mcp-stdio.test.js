const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const test = require("node:test");
const Database = require("better-sqlite3");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { LATEST_PROTOCOL_VERSION } = require("@modelcontextprotocol/sdk/types.js");
const { AppStateStore } = require("../server/services/storage/appStateStore");
const { MCP_TOOL_DEFINITIONS } = require("../server/services/mcpToolService");

const cliPath = path.resolve(__dirname, "../bin/sqlite-hub.js");
const isolationPath = path.resolve(__dirname, "fixtures/mcp-isolation.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-stdio-"));
  const stateDirectory = process.platform === "darwin"
    ? path.join(root, "Library", "Application Support", "sqlite-hub") : path.join(root, "sqlite-hub");
  const store = new AppStateStore(path.join(stateDirectory, "sqlite-hub-state.db"));
  const databasePath = path.join(root, "sample.sqlite");
  const db = new Database(databasePath);
  db.exec("CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO companies VALUES (1, 'Acme');");
  db.close();
  store.upsertRecentConnection({ id: "db-sample", label: "Sample", path: databasePath, readOnly: false, lastOpenedAt: "2026-09-09T10:00:00.000Z", lastModifiedAt: "2026-09-09T10:00:00.000Z", sizeBytes: fs.statSync(databasePath).size });
  t.after(() => { store.db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return {
    store,
    env: { ...process.env, SQLITE_HUB_TEST_STATE_ROOT: root, XDG_STATE_HOME: root, APPDATA: root },
    args: ["--require", isolationPath, cliPath, "mcp"],
  };
}

function startProcess(t, options) {
  const child = spawn(process.execPath, options.args, { env: options.env, stdio: ["pipe", "pipe", "pipe"] });
  const exit = once(child, "close");
  const waiting = new Map();
  const messages = [];
  const invalidLines = [];
  let stderr = "";
  let nextId = 0;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let message;
    try { message = JSON.parse(line); } catch { invalidLines.push(line); return; }
    messages.push(message);
    waiting.get(message.id)?.resolve(message);
    waiting.delete(message.id);
  });
  child.on("close", () => {
    for (const pending of waiting.values()) pending.reject(new Error(`MCP exited before responding: ${stderr}`));
  });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill(); await exit; });
  function request(method, params) {
    const id = nextId++;
    const promise = new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return promise;
  }
  async function initialize() {
    const response = await request("initialize", {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {}, clientInfo: { name: "stdio-test", version: "1.0.0" },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    return response;
  }
  return { child, exit, request, initialize, messages, invalidLines, stderr: () => stderr };
}

test("CLI STDIO handshake, tools, query, protocol-only stdout, stderr logs, and EOF shutdown", { timeout: 15000 }, async (t) => {
  const options = fixture(t);
  options.env.SQLITE_HUB_TEST_DIAGNOSTICS = "1";
  const proc = startProcess(t, options);
  const init = await proc.initialize();
  assert.equal(init.result.serverInfo.name, "sqlite-hub");
  assert.equal(init.result.protocolVersion, LATEST_PROTOCOL_VERSION);
  const list = await proc.request("tools/list");
  assert.deepEqual(list.result.tools, MCP_TOOL_DEFINITIONS);
  const connections = await proc.request("tools/call", { name: "list_connections", arguments: {} });
  assert.equal(connections.result.structuredContent.items[0].id, "db-sample");
  const query = await proc.request("tools/call", {
    name: "run_readonly_query", arguments: { databaseId: "db-sample", sql: "SELECT name FROM companies" },
  });
  assert.deepEqual(query.result.structuredContent.result.rows, [{ name: "Acme" }]);
  const analysis = await proc.request("tools/call", {
    name: "analyze_table", arguments: { databaseId: "db-sample", tableName: "companies" },
  });
  assert.equal(analysis.result.structuredContent.tableName, "companies");
  assert.equal(analysis.result.structuredContent.issueCount, analysis.result.structuredContent.issues.length);
  assert.equal(options.store.getMcpStatus().connected, true);
  proc.child.stdin.end();
  assert.deepEqual(await proc.exit, [0, null]);
  assert.deepEqual(proc.invalidLines, []);
  assert.ok(proc.messages.every((message) => message.jsonrpc === "2.0"));
  for (const kind of ["log", "info", "debug", "warning"]) assert.match(proc.stderr(), new RegExp(`MCP test ${kind}`));
  assert.equal(options.store.getMcpStatus().connected, false);
  assert.equal(options.store.getMcpStatus().serverRunning, false);
  assert.match(options.store.getMcpStatus().lastDisconnectedAt, /^\d{4}-/);
});

test("STDIO request errors are logged once with context and resource discovery remains compatible", { timeout: 15000 }, async (t) => {
  const options = fixture(t);
  const proc = startProcess(t, options);
  await proc.initialize();
  assert.deepEqual((await proc.request("resources/list")).result, { resources: [] });
  assert.deepEqual((await proc.request("resources/templates/list")).result, { resourceTemplates: [] });
  const unknown = await proc.request("unknown/method", { secret: "must-not-be-logged" });
  assert.equal(unknown.error.code, -32601);
  const failure = await proc.request("tools/call", { name: "run_readonly_query", arguments: { databaseId: "db-sample", sql: "DELETE FROM companies" } });
  assert.ok(failure.error);
  const invalid = await proc.request("tools/call", { name: 42 });
  assert.ok(invalid.error);
  await proc.request("tools/call", { name: "list_connections" });
  const logs = options.store.listActivityLogs({ actor: "mcp", status: "error", databaseKey: "db-sample" });
  assert.equal(logs.total, 3);
  const methodLog = logs.items.find((item) => item.metadata.method === "unknown/method");
  assert.equal(methodLog.databaseKey, null);
  assert.equal(methodLog.metadata.requestId, unknown.id);
  assert.equal(methodLog.metadata.transport, "stdio");
  assert.equal(methodLog.metadata.errorCode, "MCP_METHOD_NOT_FOUND");
  const toolLog = logs.items.find((item) => item.metadata.toolName === "run_readonly_query");
  assert.equal(toolLog.databaseKey, "db-sample");
  assert.doesNotMatch(JSON.stringify(logs), /must-not-be-logged|DELETE FROM companies/);
  proc.child.stdin.end();
  assert.deepEqual(await proc.exit, [0, null]);
  assert.match(proc.stderr(), /unknown\/method/);
  assert.deepEqual(proc.invalidLines, []);
  assert.equal(options.store.listAccessLogs({ source: "mcp" }).total, 3);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`STDIO exits cleanly on ${signal}`, { timeout: 15000, skip: process.platform === "win32" }, async (t) => {
    const options = fixture(t);
    const proc = startProcess(t, options);
    await proc.initialize();
    await proc.request("ping");
    proc.child.kill(signal);
    assert.deepEqual(await proc.exit, [0, null]);
    assert.equal(options.store.getMcpStatus().serverRunning, false);
    assert.deepEqual(proc.invalidLines, []);
  });
}

test("official SDK STDIO client connects to sqlite-hub mcp", { timeout: 15000 }, async (t) => {
  const options = fixture(t);
  const client = new Client({ name: "sdk-smoke-test", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: options.args, env: options.env, stderr: "pipe" });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal(client.getServerVersion().name, "sqlite-hub");
  assert.equal((await client.listTools()).tools.length, MCP_TOOL_DEFINITIONS.length);
  const call = await client.callTool({ name: "run_readonly_query", arguments: { databaseId: "db-sample", sql: "SELECT 1 AS value" } });
  assert.deepEqual(call.structuredContent.result.rows, [{ value: 1 }]);
  await client.close();
});

test("EOF drains an asynchronous tool call before closing the registry", { timeout: 15000 }, async (t) => {
  const { PassThrough } = require("node:stream");
  const { startMcpStdioServer } = require("../server/mcp/stdioServer");
  const { McpStatusService } = require("../server/services/mcpStatusService");
  const input = new PassThrough();
  const output = new PassThrough();
  const diagnostics = new PassThrough();
  let registryClosed = false;
  let release;
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  const barrier = new Promise((resolve) => { release = resolve; });
  const server = await startMcpStdioServer({ input, output, diagnostics, services: {
    statusService: new McpStatusService(),
    appStateStore: { db: { close() { registryClosed = true; } } },
    toolService: {
      async callTool() {
        started();
        await barrier;
        assert.equal(registryClosed, false);
        return { finished: true };
      },
    },
  } });
  t.after(() => { input.destroy(); output.destroy(); diagnostics.destroy(); });
  let stdout = "";
  output.on("data", (chunk) => { stdout += chunk; });
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "test" } })}\n`);
  await entered;
  const ended = once(input, "end");
  input.end();
  await ended;
  release();
  await server.closed;
  assert.equal(registryClosed, true);
  assert.equal(JSON.parse(stdout).result.structuredContent.finished, true);
});
