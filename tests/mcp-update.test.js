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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-mcp-update-"));
  const databasePath = path.join(root, "sample.sqlite");
  const db = new Database(databasePath);
  db.exec(`
    CREATE TABLE companies (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      note TEXT DEFAULT 'default', active INTEGER DEFAULT 1 CHECK(active IN (0, 1))
    );
    INSERT INTO companies (name) VALUES ('Acme'), ('Globex');
  `);
  const store = new AppStateStore(path.join(root, "state.db"));
  t.after(() => { db.close(); store.db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const connection = {
    id: "db-update", label: "Update fixture", path: databasePath, readOnly: false,
    lastOpenedAt: "2026-10-13T10:00:00.000Z", lastModifiedAt: "2026-10-13T10:00:00.000Z",
    sizeBytes: fs.statSync(databasePath).size,
  };
  store.upsertRecentConnection(connection);
  const databaseService = new DatabaseCommandService({ appStateStore: store });
  const statusService = new McpStatusService({ appStateStore: store, exposedTools: MCP_TOOL_DEFINITIONS });
  const toolService = new McpToolService({ databaseService, statusService });
  const update = (tableName, updates, extra = {}) => toolService.callTool("update_rows", {
    databaseId: connection.id, tableName, updates, ...extra,
  });
  const snapshot = () => db.prepare("SELECT * FROM companies ORDER BY id").all();
  return { db, store, connection, databaseService, statusService, toolService, update, snapshot };
}

test("MCP updates only selected rows with bound JSON values and logs counts without payloads", async (t) => {
  const { db, store, connection, statusService, update } = fixture(t);
  const activeId = store.getActiveConnectionId();
  const sqlText = "'; DELETE FROM companies; DROP TABLE companies; --";
  const updates = [
    { key: { id: 1 }, values: { name: sqlText, note: null, active: false } },
    { key: { id: 2 }, values: { note: "Changed" } },
  ];
  const result = await update("companies", updates);
  assert.deepEqual(result, { databaseId: connection.id, tableName: "companies", updatedRowCount: 2 });
  assert.deepEqual(db.prepare("SELECT * FROM companies ORDER BY id").all(), [
    { id: 1, name: sqlText, note: null, active: 0 },
    { id: 2, name: "Globex", note: "Changed", active: 1 },
  ]);
  assert.equal(store.getActiveConnectionId(), activeId);
  assert.equal(statusService.getStatus().lastToolName, "update_rows");
  const logs = store.listAccessLogs({ source: "mcp", databaseKey: connection.id });
  assert.equal(logs.total, 1);
  assert.equal(logs.items[0].action, "mcp.rows.update");
  assert.deepEqual(logs.items[0].metadata, { updatedRowCount: 2 });
  assert.doesNotMatch(JSON.stringify(logs), /DELETE FROM|Changed/);
  // Repeating assignments is supported and still counts the matched rows.
  assert.equal((await update("companies", updates)).updatedRowCount, 2);
});

test("MCP updates support composite primary keys, quoted identifiers, and exact large keys", async (t) => {
  const { db, update } = fixture(t);
  db.exec(`
    CREATE TABLE translations (slug TEXT, locale TEXT, body TEXT, PRIMARY KEY(slug, locale)) WITHOUT ROWID;
    INSERT INTO translations VALUES ('home', 'de', 'Alt'), ('home', 'en', 'Old');
    CREATE TABLE "odd"" table" ("key""" TEXT PRIMARY KEY, "column""; DROP TABLE companies; --" TEXT);
    INSERT INTO "odd"" table" VALUES ('key', 'old');
    INSERT INTO companies (id, name) VALUES (9007199254740993, 'Large');
  `);
  await update("translations", [{ key: { locale: "de", slug: "home" }, values: { body: "Neu" } }]);
  assert.deepEqual(db.prepare("SELECT body FROM translations ORDER BY locale").all(), [{ body: "Neu" }, { body: "Old" }]);
  await update('odd" table', [{ key: { 'key"': "key" }, values: { 'column"; DROP TABLE companies; --': "quoted" } }]);
  assert.equal(db.prepare('SELECT * FROM "odd"" table"').get()['column"; DROP TABLE companies; --'], "quoted");
  await update("companies", [{ key: { id: "9007199254740993" }, values: { note: "exact" } }]);
  assert.equal(db.prepare("SELECT note FROM companies WHERE id = 9007199254740993").get().note, "exact");
});

test("MCP update batches roll back earlier assignments on missing rows and invalid values", async (t) => {
  const { update, snapshot } = fixture(t);
  const original = snapshot();
  const failures = [
    { key: { id: 999 }, values: { note: "Missing" } },
    { key: { id: 2 }, values: { name: "Acme" } },
    { key: { id: 2 }, values: { name: null } },
    { key: { id: 2 }, values: { active: 2 } },
    { key: { id: 2 }, values: { nonexistent: "bad" } },
    { key: { id: 2 }, values: { id: 3 } },
  ];
  for (const failure of failures) {
    await assert.rejects(() => update("companies", [{ key: { id: 1 }, values: { note: "Temporary" } }, failure]));
    assert.deepEqual(snapshot(), original);
  }
});

test("MCP updates cannot delete conflicting rows through schema REPLACE or IGNORE policies", async (t) => {
  const { db, update } = fixture(t);
  for (const policy of ["REPLACE", "IGNORE"]) {
    db.exec(`CREATE TABLE conflict_${policy} (id INTEGER PRIMARY KEY, name TEXT UNIQUE ON CONFLICT ${policy});
      INSERT INTO conflict_${policy} VALUES (1, 'First'), (2, 'Second');`);
    await assert.rejects(() => update(`conflict_${policy}`, [{ key: { id: 1 }, values: { name: "Second" } }]), /UNIQUE/);
    assert.deepEqual(db.prepare(`SELECT * FROM conflict_${policy} ORDER BY id`).all(), [{ id: 1, name: "First" }, { id: 2, name: "Second" }]);
  }
});

test("MCP rejects update triggers before any direct or indirect writes", async (t) => {
  const { db, update, snapshot } = fixture(t);
  const original = snapshot();
  for (const body of ["DELETE FROM companies;", "INSERT INTO companies (name) VALUES ('Unexpected');", "UPDATE companies SET active = 0;"]) {
    db.exec(`CREATE TRIGGER side_effect AFTER UPDATE ON companies BEGIN ${body} END;`);
    await assert.rejects(() => update("companies", [{ key: { id: 1 }, values: { note: "Blocked" } }]), { code: "MCP_UPDATE_TRIGGER_BLOCKED" });
    assert.deepEqual(snapshot(), original);
    db.exec("DROP TRIGGER side_effect");
  }
});

test("MCP blocks referenced keys to prevent cascaded updates and child-trigger deletions", async (t) => {
  const { db, update, snapshot } = fixture(t);
  db.exec(`
    CREATE TABLE contacts (id INTEGER PRIMARY KEY, company_name TEXT REFERENCES COMPANIES(NAME) ON UPDATE CASCADE);
    INSERT INTO contacts VALUES (1, 'Acme');
    CREATE TRIGGER child_delete AFTER UPDATE ON contacts BEGIN DELETE FROM companies; END;
  `);
  const original = snapshot();
  await assert.rejects(() => update("companies", [{ key: { id: 1 }, values: { name: "Changed" } }]), { code: "MCP_UPDATE_KEY_COLUMN_BLOCKED" });
  assert.deepEqual(snapshot(), original);
  assert.equal(db.prepare("SELECT company_name FROM contacts").get().company_name, "Acme");
  await update("companies", [{ key: { id: 1 }, values: { note: "Allowed" } }]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM companies").get().count, 2);
  assert.equal(db.prepare("SELECT company_name FROM contacts").get().company_name, "Acme");
});

test("MCP blocks indirectly changing a generated foreign-key target", async (t) => {
  const { db, update } = fixture(t);
  db.exec(`
    CREATE TABLE parents (id INTEGER PRIMARY KEY, name TEXT, code TEXT GENERATED ALWAYS AS (lower(name)) STORED UNIQUE);
    CREATE TABLE children (id INTEGER PRIMARY KEY, parent_code TEXT REFERENCES parents(code) ON UPDATE CASCADE);
    INSERT INTO parents (id, name) VALUES (1, 'Original');
    INSERT INTO children VALUES (1, 'original');
    CREATE TRIGGER child_delete AFTER UPDATE ON children BEGIN DELETE FROM parents; END;
  `);
  await assert.rejects(() => update("parents", [{ key: { id: 1 }, values: { name: "Changed" } }]), { code: "MCP_UPDATE_KEY_COLUMN_BLOCKED" });
  assert.equal(db.prepare("SELECT name FROM parents").get().name, "Original");
  assert.equal(db.prepare("SELECT parent_code FROM children").get().parent_code, "original");
});

test("MCP allows outgoing foreign-key updates but enforces constraints for the complete batch", async (t) => {
  const { db, update } = fixture(t);
  db.exec("CREATE TABLE contacts (id INTEGER PRIMARY KEY, company_id INTEGER REFERENCES companies(id)); INSERT INTO contacts VALUES (1, 1), (2, 1)");
  await update("contacts", [{ key: { id: 1 }, values: { company_id: 2 } }]);
  assert.equal(db.prepare("SELECT company_id FROM contacts WHERE id = 1").get().company_id, 2);
  await assert.rejects(() => update("contacts", [
    { key: { id: 1 }, values: { company_id: 1 } }, { key: { id: 2 }, values: { company_id: 999 } },
  ]), /FOREIGN KEY/);
  assert.deepEqual(db.prepare("SELECT company_id FROM contacts ORDER BY id").all(), [{ company_id: 2 }, { company_id: 1 }]);
});

test("MCP rejects duplicate row identities including affinity and collation aliases", async (t) => {
  const { db, update, snapshot } = fixture(t);
  const original = snapshot();
  await assert.rejects(() => update("companies", [
    { key: { id: 1 }, values: { note: "First" } }, { key: { id: "1" }, values: { note: "Second" } },
  ]), { code: "MCP_UPDATE_DUPLICATE_KEY" });
  assert.deepEqual(snapshot(), original);
  db.exec("CREATE TABLE aliases (code TEXT COLLATE NOCASE PRIMARY KEY, note TEXT); INSERT INTO aliases VALUES ('Abc', 'original')");
  await assert.rejects(() => update("aliases", [
    { key: { code: "abc" }, values: { note: "First" } }, { key: { code: "ABC" }, values: { note: "Second" } },
  ]), { code: "MCP_UPDATE_DUPLICATE_KEY" });
  assert.equal(db.prepare("SELECT note FROM aliases").get().note, "original");
});

test("MCP requires complete non-null primary keys and protects rowid and generated columns", async (t) => {
  const { db, update, snapshot } = fixture(t);
  const original = snapshot();
  for (const key of [{}, { id: null }, { id: 1, name: "Acme" }, { name: "Acme" }]) {
    await assert.rejects(() => update("companies", [{ key, values: { note: "Blocked" } }]));
  }
  for (const values of [{ id: 3 }, { rowid: 3 }, { _rowid_: 3 }, { oid: 3 }]) {
    await assert.rejects(() => update("companies", [{ key: { id: 1 }, values }]), { code: "MCP_UPDATE_KEY_COLUMN_BLOCKED" });
  }
  db.exec(`
    CREATE TABLE no_key (name TEXT); INSERT INTO no_key VALUES ('original');
    CREATE TABLE nullable_key (a TEXT, b TEXT, note TEXT, PRIMARY KEY(a, b));
    INSERT INTO nullable_key VALUES (NULL, 'b', 'one'), (NULL, 'b', 'two');
    CREATE TABLE generated (id INTEGER PRIMARY KEY, value INTEGER, doubled INTEGER GENERATED ALWAYS AS (value * 2));
    INSERT INTO generated (id, value) VALUES (1, 2);
  `);
  await assert.rejects(() => update("no_key", [{ key: { name: "original" }, values: { name: "Changed" } }]), { code: "MCP_UPDATE_PRIMARY_KEY_REQUIRED" });
  await assert.rejects(() => update("nullable_key", [{ key: { a: null, b: "b" }, values: { note: "Changed" } }]), { code: "MCP_UPDATE_PRIMARY_KEY_REQUIRED" });
  await assert.rejects(() => update("nullable_key", [{ key: { b: "b" }, values: { note: "Changed" } }]), { code: "MCP_UPDATE_PRIMARY_KEY_REQUIRED" });
  await assert.rejects(() => update("generated", [{ key: { id: 1 }, values: { doubled: 6 } }]), { code: "MCP_UPDATE_KEY_COLUMN_BLOCKED" });
  await update("generated", [{ key: { id: 1 }, values: { value: 3 } }]);
  assert.equal(db.prepare("SELECT doubled FROM generated").get().doubled, 6);
  assert.deepEqual(db.prepare("SELECT note FROM nullable_key").all(), [{ note: "one" }, { note: "two" }]);
  assert.deepEqual(snapshot(), original);
});

test("MCP rejects raw SQL, arbitrary filters, malformed updates, and unknown identifiers", async (t) => {
  const { update, snapshot } = fixture(t);
  const original = snapshot();
  const valid = { key: { id: 1 }, values: { note: "Blocked" } };
  for (const extra of [{ sql: "DROP TABLE companies" }, { where: "1=1" }, { onConflict: "replace" }, { upsert: true }]) {
    await assert.rejects(() => update("companies", [valid], extra), /accepts only/);
  }
  for (const updates of [[], null, {}, [null], [[]], [valid, { ...valid, where: "1=1" }],
    [{ key: { id: 1 }, values: {} }], [{ key: { id: {} }, values: { note: "bad" } }],
    [{ key: { id: 1 }, values: { note: [] } }], [{ key: { id: 1 }, values: { note: undefined } }],
    [{ key: { id: Infinity }, values: { note: "bad" } }], Array(1001).fill(valid)]) {
    await assert.rejects(() => update("companies", updates));
  }
  await assert.rejects(() => update("companies; DROP TABLE companies", [valid]), /Table not found/);
  await assert.rejects(() => update("companies", [{ key: { id: 1 }, values: { 'name"; DELETE FROM companies; --': "bad" } }]));
  assert.deepEqual(snapshot(), original);
});

test("MCP rejects views, virtual/shadow/internal tables, and read-only connections", async (t) => {
  const { db, store, connection, databaseService, update, snapshot } = fixture(t);
  const original = snapshot();
  db.exec("CREATE VIEW company_view AS SELECT * FROM companies; CREATE VIRTUAL TABLE documents USING fts5(body)");
  for (const name of ["company_view", "documents", "documents_data", "sqlite_schema"]) {
    await assert.rejects(() => update(name, [{ key: { id: 1 }, values: { name: "Blocked" } }]), { code: "MCP_UPDATE_TABLE_REQUIRED" });
  }
  store.upsertRecentConnection({ ...connection, readOnly: true });
  databaseService.runtimeFactory = () => { assert.fail("must not open a writable runtime"); };
  await assert.rejects(() => update("companies", [{ key: { id: 1 }, values: { name: "Blocked" } }]), { code: "SQLITE_READONLY" });
  assert.deepEqual(snapshot(), original);
});

test("MCP update success survives unavailable access logging", async (t) => {
  const { db, store, update } = fixture(t);
  store.recordAccessLog = () => { throw new Error("logging unavailable"); };
  assert.equal((await update("companies", [{ key: { id: 1 }, values: { note: "Committed" } }])).updatedRowCount, 1);
  assert.equal(db.prepare("SELECT note FROM companies WHERE id = 1").get().note, "Committed");
});
