const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");

const { DatabaseCommandService } = require("../server/services/databaseCommandService");
const { MCP_TOOL_DEFINITIONS, McpToolService } = require("../server/services/mcpToolService");
const { McpStatusService } = require("../server/services/mcpStatusService");
const { AppStateStore } = require("../server/services/storage/appStateStore");
const { handleMcpRequest } = require("../server/mcp/stdioServer");

function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-mcp-"));
  const databasePath = path.join(directory, "sample.db");
  const db = new Database(databasePath);

  db.exec(`
    CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE INDEX idx_companies_name ON companies(name);
    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      email TEXT NOT NULL
    );
    INSERT INTO companies (name) VALUES ('Acme'), ('Globex');
    INSERT INTO contacts (company_id, email) VALUES (1, 'team@acme.test');
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
  store.db
    .prepare(
      `
        INSERT INTO query_history (
          database_key,
          normalized_sql,
          raw_sql,
          title,
          notes,
          query_type,
          tables_detected,
          is_saved,
          first_executed_at,
          last_used_at
        )
        VALUES (?, ?, ?, ?, ?, 'select', '["companies"]', 1, ?, ?)
      `
    )
    .run(
      connection.id,
      "select id, name from companies order by id",
      "SELECT id, name FROM companies ORDER BY id",
      "Company List",
      "Used by MCP tests",
      "2026-06-28T10:05:00.000Z",
      "2026-06-28T10:05:00.000Z"
    );
  store.createDatabaseDocument(connection.id, {
    filename: "Notes.md",
    content: "# Notes\n",
  });

  const databaseService = new DatabaseCommandService({ appStateStore: store });
  const statusService = new McpStatusService({
    appStateStore: store,
    exposedTools: MCP_TOOL_DEFINITIONS,
    transport: "stdio",
  });
  const toolService = new McpToolService({
    databaseService,
    statusService,
  });

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return {
    connection,
    databaseService,
    statusService,
    store,
    toolService,
  };
}

test("MCP tool registration exposes the initial SQLite Hub tools", (t) => {
  const { toolService } = createFixture(t);
  const names = toolService.listTools().map((tool) => tool.name);

  assert.ok(names.includes("list_connections"));
  assert.ok(names.includes("get_schema"));
  assert.ok(names.includes("run_readonly_query"));
  assert.ok(names.includes("get_saved_queries"));
  assert.equal(names.includes("get_stored_queries"), false);
  assert.ok(names.includes("execute_stored_query"));
  assert.ok(names.includes("create_backup"));
  assert.ok(names.includes("generate_types"));
  const generateTypesTool = toolService.listTools().find((tool) => tool.name === "generate_types");
  assert.ok(generateTypesTool.inputSchema.properties.target.enum.includes("go"));
});

test("MCP list_connections returns imported databases without full paths", async (t) => {
  const { toolService, connection } = createFixture(t);
  const result = await toolService.callTool("list_connections", {});

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, connection.id);
  assert.equal(result.items[0].label, "Sample");
  assert.equal(result.items[0].path, undefined);
});

test("MCP generates Go structs through the shared type generation service", async (t) => {
  const { toolService, connection } = createFixture(t);
  const result = await toolService.callTool("generate_types", {
    databaseId: connection.id,
    tableName: "companies",
    target: "go",
  });

  assert.equal(result.target, "go");
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].fileName, "Company.go");
  assert.match(result.files[0].code, /^package models/);
  assert.match(result.files[0].code, /type Company struct \{/);
});

test("MCP get_schema returns database tables and indexes", async (t) => {
  const { toolService, connection } = createFixture(t);
  const schema = await toolService.callTool("get_schema", { databaseId: connection.id });

  assert.ok(schema.tables.some((table) => table.name === "companies"));
  assert.ok(schema.tables.some((table) => table.name === "contacts"));
  assert.ok(schema.indexes.some((index) => index.name === "idx_companies_name"));
});

test("MCP run_readonly_query allows SELECT and records mcp execution", async (t) => {
  const { toolService, connection, store, statusService } = createFixture(t);
  const payload = await toolService.callTool("run_readonly_query", {
    databaseId: connection.id,
    sql: "SELECT id, name FROM companies ORDER BY id",
  });

  assert.equal(payload.result.rows.length, 2);
  assert.equal(payload.result.rows[0].name, "Acme");

  const run = store.db
    .prepare("SELECT executed_by, status FROM query_runs ORDER BY id DESC LIMIT 1")
    .get();

  assert.deepEqual(run, { executed_by: "mcp", status: "success" });
  assert.equal(statusService.getStatus().lastToolName, "run_readonly_query");
  assert.match(statusService.getStatus().lastToolCallAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("MCP run_readonly_query blocks mutating SQL", async (t) => {
  const { toolService, connection } = createFixture(t);
  const blocked = [
    "INSERT INTO companies (name) VALUES ('Nope')",
    "UPDATE companies SET name = 'Nope'",
    "DELETE FROM companies",
    "DROP TABLE companies",
    "ALTER TABLE companies ADD COLUMN note TEXT",
  ];

  for (const sql of blocked) {
    await assert.rejects(
      () => toolService.callTool("run_readonly_query", { databaseId: connection.id, sql }),
      /Only SELECT, PRAGMA, and EXPLAIN statements are allowed|read-only query guard/
    );
  }
});

test("MCP saved query tools list and execute saved SQL Editor queries", async (t) => {
  const { toolService, connection, store, statusService } = createFixture(t);
  const queries = await toolService.callTool("get_saved_queries", {
    databaseId: connection.id,
  });

  assert.equal(queries.total, 1);
  assert.equal(queries.items[0].title, "Company List");
  assert.equal(queries.items[0].notes, "Used by MCP tests");

  const execution = await toolService.callTool("execute_stored_query", {
    databaseId: connection.id,
    queryName: "Company List",
  });

  assert.equal(execution.query.title, "Company List");
  assert.equal(execution.result.rows.length, 2);
  assert.equal(execution.result.rows[0].name, "Acme");

  const run = store.db
    .prepare("SELECT executed_by, status FROM query_runs ORDER BY id DESC LIMIT 1")
    .get();

  assert.deepEqual(run, { executed_by: "mcp", status: "success" });
  assert.equal(statusService.getStatus().lastToolName, "execute_stored_query");
});

test("MCP JSON-RPC lists tools and calls shared tool service", async (t) => {
  const { toolService, statusService } = createFixture(t);
  const listResponse = await handleMcpRequest(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    { toolService, statusService }
  );

  assert.equal(listResponse.result.tools.some((tool) => tool.name === "list_connections"), true);

  const callResponse = await handleMcpRequest(
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_connections" } },
    { toolService, statusService }
  );

  assert.equal(callResponse.result.content[0].type, "text");
  assert.match(callResponse.result.content[0].text, /Sample/);
  assert.equal(callResponse.result.structuredContent.items.length, 1);
});

test("MCP JSON-RPC lifecycle updates connection status", async (t) => {
  const { toolService, statusService } = createFixture(t);
  const services = { toolService, statusService };

  const initResponse = await handleMcpRequest(
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    services
  );

  assert.equal(initResponse.result.serverInfo.name, "sqlite-hub");
  assert.equal(statusService.getStatus().connected, true);
  assert.equal(statusService.getStatus().activeClientCount, 1);
  assert.match(statusService.getStatus().lastConnectedAt, /^\d{4}-\d{2}-\d{2}T/);

  await handleMcpRequest({ jsonrpc: "2.0", id: 2, method: "shutdown" }, services);

  assert.equal(statusService.getStatus().connected, false);
  assert.equal(statusService.getStatus().serverRunning, false);
  assert.equal(statusService.getStatus().activeClientCount, 0);
  assert.match(statusService.getStatus().lastDisconnectedAt, /^\d{4}-\d{2}-\d{2}T/);
});
