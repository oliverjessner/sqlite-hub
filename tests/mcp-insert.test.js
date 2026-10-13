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

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-mcp-insert-"));
  const databasePath = path.join(root, "sample.sqlite");
  const db = new Database(databasePath);
  db.exec(`
    CREATE TABLE companies (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      note TEXT DEFAULT 'default', active INTEGER DEFAULT 1 CHECK(active IN (0, 1))
    );
    INSERT INTO companies (name) VALUES ('Acme');
  `);
  const store = new AppStateStore(path.join(root, "state.db"));
  t.after(() => { db.close(); store.db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const connection = {
    id: "db-insert", label: "Insert fixture", path: databasePath, readOnly: false,
    lastOpenedAt: "2026-10-13T10:00:00.000Z", lastModifiedAt: "2026-10-13T10:00:00.000Z",
    sizeBytes: fs.statSync(databasePath).size,
  };
  store.upsertRecentConnection(connection);
  const databaseService = new DatabaseCommandService({ appStateStore: store });
  const statusService = new McpStatusService({ appStateStore: store, exposedTools: MCP_TOOL_DEFINITIONS });
  const toolService = new McpToolService({ databaseService, statusService });
  const insert = (tableName, rows, extra = {}) => toolService.callTool("insert_rows", {
    databaseId: connection.id, tableName, rows, ...extra,
  });
  return { db, store, connection, databaseService, statusService, toolService, insert };
}

test("MCP inserts bound JSON values atomically and records counts without row contents", async (t) => {
  const { db, store, connection, statusService, insert } = fixture(t);
  const maliciousText = "'); DELETE FROM companies; DROP TABLE companies; --";
  const activeId = store.getActiveConnectionId();
  const result = await insert("companies", [
    { name: maliciousText, note: null, active: false },
    { name: "Second", active: true },
  ]);
  assert.deepEqual(result, { databaseId: connection.id, tableName: "companies", insertedRowCount: 2, lastInsertRowids: [2, 3] });
  assert.deepEqual(db.prepare("SELECT * FROM companies ORDER BY id").all(), [
    { id: 1, name: "Acme", note: "default", active: 1 },
    { id: 2, name: maliciousText, note: null, active: 0 },
    { id: 3, name: "Second", note: "default", active: 1 },
  ]);
  assert.equal(store.getActiveConnectionId(), activeId);
  assert.equal(statusService.getStatus().lastToolName, "insert_rows");
  const logs = store.listAccessLogs({ source: "mcp", databaseKey: connection.id });
  assert.equal(logs.total, 1);
  assert.equal(logs.items[0].action, "mcp.rows.insert");
  assert.deepEqual(logs.items[0].metadata, { insertedRowCount: 2 });
  assert.doesNotMatch(JSON.stringify(logs), /DELETE FROM|Second/);
});

test("MCP inserts support defaults, quoted identifiers, WITHOUT ROWID, and exact large row ids", async (t) => {
  const { db, insert } = fixture(t);
  db.exec(`
    CREATE TABLE defaults (id INTEGER PRIMARY KEY, value TEXT DEFAULT 'generated');
    CREATE TABLE "odd"" table" ("column""; DROP TABLE companies; --" TEXT);
    CREATE TABLE natural_keys (name TEXT PRIMARY KEY) WITHOUT ROWID;
  `);
  assert.deepEqual((await insert("defaults", [{}])).lastInsertRowids, [1]);
  assert.equal(db.prepare("SELECT value FROM defaults").get().value, "generated");
  await insert('odd" table', [{ 'column"; DROP TABLE companies; --': "quoted" }]);
  assert.equal(db.prepare('SELECT * FROM "odd"" table"').get()['column"; DROP TABLE companies; --'], "quoted");
  assert.deepEqual((await insert("natural_keys", [{ name: "key" }])).lastInsertRowids, [null]);
  assert.deepEqual((await insert("companies", [{ id: "9007199254740993", name: "Large" }])).lastInsertRowids, ["9007199254740993"]);
  assert.equal(db.prepare("SELECT CAST(id AS TEXT) AS id FROM companies WHERE name = 'Large'").get().id, "9007199254740993");
});

test("MCP insert batches roll back earlier rows on constraint or column failures", async (t) => {
  const { db, insert } = fixture(t);
  for (const rows of [
    [{ name: "New" }, { name: "Acme" }],
    [{ name: "New" }, { name: null }],
    [{ name: "New" }, { name: "Invalid", active: 2 }],
    [{ name: "New" }, { nonexistent: "bad" }],
  ]) {
    await assert.rejects(() => insert("companies", rows));
    assert.deepEqual(db.prepare("SELECT name FROM companies").all(), [{ name: "Acme" }]);
  }
});

test("MCP inserts override schema REPLACE and IGNORE conflict policies with ABORT", async (t) => {
  const { db, insert } = fixture(t);
  db.exec(`
    CREATE TABLE replacing (id INTEGER PRIMARY KEY, value TEXT UNIQUE ON CONFLICT REPLACE);
    INSERT INTO replacing VALUES (1, 'original');
    CREATE TABLE ignoring (value TEXT UNIQUE ON CONFLICT IGNORE);
    INSERT INTO ignoring VALUES ('original');
  `);
  await assert.rejects(() => insert("replacing", [{ id: 2, value: "original" }]), /UNIQUE/);
  await assert.rejects(() => insert("ignoring", [{ value: "new" }, { value: "original" }]), /UNIQUE/);
  assert.deepEqual(db.prepare("SELECT * FROM replacing").all(), [{ id: 1, value: "original" }]);
  assert.deepEqual(db.prepare("SELECT * FROM ignoring").all(), [{ value: "original" }]);
});

test("MCP rejects trigger side effects before inserting any rows", async (t) => {
  const { db, insert } = fixture(t);
  for (const body of ["DELETE FROM companies;", "UPDATE companies SET name = 'Changed';", "INSERT OR REPLACE INTO companies VALUES (1, 'Changed', NULL, 1);"]) {
    db.exec(`CREATE TRIGGER side_effect AFTER INSERT ON companies BEGIN ${body} END;`);
    await assert.rejects(() => insert("companies", [{ name: "New" }]), { code: "MCP_INSERT_TRIGGER_BLOCKED" });
    assert.deepEqual(db.prepare("SELECT name FROM companies").all(), [{ name: "Acme" }]);
    db.exec("DROP TRIGGER side_effect");
  }
});

test("MCP enforces foreign keys and rolls back the whole batch", async (t) => {
  const { db, insert } = fixture(t);
  db.exec("CREATE TABLE contacts (id INTEGER PRIMARY KEY, company_id INTEGER REFERENCES companies(id))");
  await assert.rejects(() => insert("contacts", [{ company_id: 1 }, { company_id: 999 }]), /FOREIGN KEY/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM contacts").get().count, 0);
});

test("MCP rejects read-only connections before opening a writable runtime", async (t) => {
  const { db, store, connection, databaseService, insert } = fixture(t);
  store.upsertRecentConnection({ ...connection, readOnly: true });
  databaseService.runtimeFactory = () => { assert.fail("must not open a writable runtime"); };
  await assert.rejects(() => insert("companies", [{ name: "Blocked" }]), { code: "SQLITE_READONLY" });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM companies").get().count, 1);
});

test("MCP rejects raw SQL, conflict modes, malformed rows, and generated columns", async (t) => {
  const { db, insert } = fixture(t);
  db.exec("CREATE TABLE generated (value INTEGER, doubled INTEGER GENERATED ALWAYS AS (value * 2))");
  for (const extra of [{ sql: "DROP TABLE companies" }, { onConflict: "replace" }, { upsert: true }]) {
    await assert.rejects(() => insert("companies", [{ name: "Blocked" }], extra), /accepts only/);
  }
  for (const rows of [[], null, {}, [null], [[]], [{ name: {} }], [{ name: [] }], [{ name: undefined }], [{ name: Infinity }], Array(1001).fill({ name: "Too many" })]) {
    await assert.rejects(() => insert("companies", rows));
  }
  await assert.rejects(() => insert("generated", [{ value: 1, doubled: 2 }]), /not an insertable column/);
  await assert.rejects(() => insert("companies; DROP TABLE companies", [{ name: "Blocked" }]), /Table not found/);
  await assert.rejects(() => insert("companies", [{ 'name"; DELETE FROM companies; --': "Blocked" }]), /not an insertable column/);
  assert.deepEqual(db.prepare("SELECT name FROM companies").all(), [{ name: "Acme" }]);
});

test("MCP rejects views, virtual tables, shadow tables, and internal tables", async (t) => {
  const { db, insert } = fixture(t);
  db.exec("CREATE VIEW company_view AS SELECT * FROM companies; CREATE VIRTUAL TABLE documents USING fts5(body)");
  for (const tableName of ["company_view", "documents", "documents_data", "sqlite_schema"]) {
    await assert.rejects(() => insert(tableName, [{}]), { code: "MCP_INSERT_TABLE_REQUIRED" });
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM companies").get().count, 1);
});

test("MCP saved-query execution cannot bypass the insert-only write boundary", async (t) => {
  const { db, connection, toolService } = fixture(t);
  const blocked = [
    "DELETE FROM companies RETURNING *", "DROP TABLE companies", "UPDATE companies SET name = 'Changed' RETURNING *",
    "INSERT INTO companies (name) VALUES ('New')", "SELECT 1; DELETE FROM companies",
    "/* comment */ DELETE FROM companies", "WITH ids AS (SELECT id FROM companies) DELETE FROM companies RETURNING *",
  ];
  for (const [index, sql] of blocked.entries()) {
    const title = `Blocked ${index}`;
    await toolService.callTool("create_stored_query", { databaseId: connection.id, sql, title });
    await assert.rejects(() => toolService.callTool("execute_stored_query", { databaseId: connection.id, queryName: title }), { code: "MCP_READONLY_SQL_REQUIRED" }, sql);
    assert.deepEqual(db.prepare("SELECT name FROM companies").all(), [{ name: "Acme" }]);
  }
});

test("MCP insert success survives unavailable access logging", async (t) => {
  const { db, store, insert } = fixture(t);
  store.recordAccessLog = () => { throw new Error("logging unavailable"); };
  assert.equal((await insert("companies", [{ name: "Committed once" }])).insertedRowCount, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM companies WHERE name = 'Committed once'").get().count, 1);
});
