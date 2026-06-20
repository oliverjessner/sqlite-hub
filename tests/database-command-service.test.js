const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");

const { DatabaseCommandService } = require("../server/services/databaseCommandService");
const { AppStateStore } = require("../server/services/storage/appStateStore");

function createFixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-command-service-"));
  const databasePath = path.join(directory, "sample.db");
  const targetDb = new Database(databasePath);

  targetDb.exec(`
    CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO companies (name) VALUES ('Acme'), ('Globex');
  `);
  targetDb.close();

  const store = new AppStateStore(path.join(directory, "state.db"));
  const connection = {
    id: "db-sample",
    label: "Sample",
    path: databasePath,
    lastOpenedAt: new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
    sizeBytes: fs.statSync(databasePath).size,
    readOnly: Boolean(options.readOnly),
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
      "Used by CLI and API",
      new Date().toISOString(),
      new Date().toISOString()
    );
  store.createDatabaseDocument(connection.id, {
    filename: "Readme.md",
    content: "# Sample\n",
  });

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return {
    connection,
    service: new DatabaseCommandService({ appStateStore: store }),
    store,
  };
}

test("database command service provides shared CLI and API operations", (t) => {
  const { connection, service } = createFixture(t);

  assert.equal(service.getDatabase("sample").id, connection.id);
  assert.deepEqual(service.listTables(connection.id), [{ name: "companies" }]);
  assert.equal(service.getTable(connection.id, "companies").rowCount, 2);

  const row = service.getTableRow(connection.id, "companies", "1");
  assert.deepEqual(row.data, { id: 1, name: "Acme" });
  assert.equal(row.identity.kind, "primaryKey");

  const queries = service.listSavedQueries(connection.id);
  assert.equal(queries.total, 1);
  assert.equal(service.getSavedQuery(connection.id, "Company List").notes, "Used by CLI and API");

  const execution = service.executeSavedQuery(connection.id, "Company List");
  assert.equal(execution.result.statements[0].rowCount, 2);

  const exported = service.exportSavedQuery(connection.id, "Company List", "csv");
  assert.equal(exported.result.rowCount, 2);
  assert.match(exported.result.content, /Acme/);

  assert.equal(service.listDocuments(connection.id).length, 1);
  assert.equal(service.getDocument(connection.id, "Readme").content, "# Sample\n");
});

test("raw query execution writes SQL Editor query history", (t) => {
  const { connection, service, store } = createFixture(t);
  const beforeCount = Number(
    store.db.prepare("SELECT COUNT(*) AS count FROM query_history").get().count
  );
  const { result } = service.executeRawQuery(
    connection.id,
    "INSERT INTO companies (name) VALUES ('Initech')"
  );
  const afterCount = Number(
    store.db.prepare("SELECT COUNT(*) AS count FROM query_history").get().count
  );
  const historyRow = store.db
    .prepare("SELECT raw_sql, query_type FROM query_history WHERE id = ?")
    .get(result.historyId);

  assert.equal(result.affectedRowCount, 1);
  assert.equal(afterCount, beforeCount + 1);
  assert.equal(historyRow.raw_sql, "INSERT INTO companies (name) VALUES ('Initech')");
  assert.equal(historyRow.query_type, "insert");
});

test("raw query execution is blocked for read-only connections", (t) => {
  const { connection, service } = createFixture(t, { readOnly: true });

  assert.throws(
    () => service.executeRawQuery(connection.id, "SELECT 1"),
    /read-only database/
  );
});
