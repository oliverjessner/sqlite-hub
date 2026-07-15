const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");

const { BackupService } = require("../server/services/sqlite/backupService");
const { ConnectionManager } = require("../server/services/sqlite/connectionManager");
const { AppStateStore } = require("../server/services/storage/appStateStore");

function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-backups-"));
  const databasePath = path.join(directory, "source.sqlite");
  const db = new Database(databasePath);

  db.exec(`
    CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO companies (name) VALUES ('Acme'), ('Globex');
  `);
  db.close();

  const store = new AppStateStore(path.join(directory, "state.db"));
  const connectionManager = new ConnectionManager({ appStateStore: store });
  const connection = connectionManager.openConnection({
    filePath: databasePath,
    label: "Source",
    id: "conn_source",
    makeActive: true,
  });
  const backupService = new BackupService({
    appStateStore: store,
    connectionManager,
    backupRootDirectory: path.join(directory, "SQLite Hub", "backups"),
  });

  t.after(() => {
    connectionManager.closeCurrent();
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return {
    backupService,
    connection,
    connectionManager,
    directory,
    store,
  };
}

test("backups table is created with recent_connections foreign key and checks", (t) => {
  const { store } = createFixture(t);
  const tables = new Set(
    store.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map(row => row.name)
  );
  const foreignKeys = store.db.prepare("PRAGMA foreign_key_list(backups)").all();

  assert.equal(tables.has("backups"), true);
  assert.equal(foreignKeys[0].table, "recent_connections");
  assert.equal(foreignKeys[0].from, "connectionId");
  assert.equal(foreignKeys[0].on_delete, "SET NULL");

  assert.throws(
    () =>
      store.createBackupRecord({
        id: "invalid",
        connectionId: "conn_source",
        name: "Invalid",
        path: path.join(os.tmpdir(), "invalid.sqlite"),
        status: "unknown",
        type: "manual",
        sourcePath: path.join(os.tmpdir(), "source.sqlite"),
        createdAt: new Date().toISOString(),
      }),
    /CHECK constraint failed/
  );
});

test("manual backup creates file, metadata, manifest, and survives connection removal", async (t) => {
  const { backupService, connection, store } = createFixture(t);

  const backup = await backupService.createActiveBackup({
    name: "Before migration",
    notes: "Schema update",
  });
  const manifestPath = path.join(
    backupService.backupRootDirectory,
    connection.id,
    "manifest.json"
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const stored = store.getBackup(backup.id);

  assert.equal(backup.status, "verified");
  assert.equal(backup.connectionId, connection.id);
  assert.equal(backup.notes, "Schema update");
  assert.equal(fs.existsSync(backup.path), true);
  assert.equal(
    path.relative(backupService.backupRootDirectory, backup.path),
    path.join("conn_source", path.basename(backup.path)),
  );
  assert.equal(stored.checksumSha256.length, 64);
  assert.equal(stored.tableCount, 1);
  assert.equal(stored.rowCount, 2);
  assert.equal(manifest.databaseId, connection.id);
  assert.equal(manifest.backups[0].id, backup.id);
  assert.equal(manifest.backups[0].status, "verified");

  store.removeRecentConnection(connection.id);
  assert.equal(store.getBackup(backup.id).connectionId, null);
});

test("backup details can be updated after creation and manifest stays in sync", async (t) => {
  const { backupService, connection, store } = createFixture(t);

  const backup = await backupService.createActiveBackup({
    name: "Before migration",
    notes: "Initial note",
  });
  const updated = backupService.updateBackupDetails(backup.id, {
    name: "Reviewed migration",
    notes: "Reviewed after restore test",
  });
  const manifestPath = path.join(
    backupService.backupRootDirectory,
    connection.id,
    "manifest.json"
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.equal(updated.name, "Reviewed migration");
  assert.equal(updated.notes, "Reviewed after restore test");
  assert.equal(store.getBackup(backup.id).name, "Reviewed migration");
  assert.equal(store.getBackup(backup.id).notes, "Reviewed after restore test");
  assert.equal(manifest.backups[0].name, "Reviewed migration");
  assert.equal(manifest.backups[0].notes, "Reviewed after restore test");
});

test("backup diff compares a verified backup with the active database", async (t) => {
  const { backupService, connectionManager } = createFixture(t);
  const backup = await backupService.createActiveBackup({
    name: "Before migration",
  });
  const db = connectionManager.getActiveDatabase();

  db.exec(`
    ALTER TABLE companies ADD COLUMN status TEXT DEFAULT 'trial';
    UPDATE companies SET name = 'Acme Corp' WHERE id = 1;
    DELETE FROM companies WHERE id = 2;
    INSERT INTO companies (id, name, status) VALUES (3, 'Initech', 'active');
    CREATE INDEX idx_companies_name ON companies(name);
    CREATE VIEW company_names AS SELECT name FROM companies;
  `);

  const diff = backupService.diffBackupWithCurrent(backup.id, { sampleLimit: 1 });
  const companies = diff.data.tables.find((table) => table.name === "companies");
  const companiesSchema = diff.schema.changed.find((entry) => entry.name === "companies");

  assert.equal(diff.backup.id, backup.id);
  assert.equal(diff.backup.name, "Before migration");
  assert.equal(diff.summary.schemaChanges, 3);
  assert.equal(diff.summary.rowsAdded, 1);
  assert.equal(diff.summary.rowsChanged, 1);
  assert.equal(diff.summary.rowsRemoved, 1);
  assert.equal(diff.summary.skippedTables, 0);
  assert.equal(companies.status, "comparable");
  assert.deepEqual(companies.keyColumns, ["id"]);
  assert.equal(companies.samples.added.length, 1);
  assert.equal(companies.samples.changed.length, 1);
  assert.equal(companies.samples.removed.length, 1);
  assert.equal(companies.samples.changed[0].columns[0].name, "name");
  assert.equal(companies.samples.changed[0].columns[0].backup, "Acme");
  assert.equal(companies.samples.changed[0].columns[0].current, "Acme Corp");
  assert.ok(
    companiesSchema.changes.some(
      (change) => change.action === "added" && change.objectType === "column" && change.name === "status"
    )
  );
  assert.ok(
    companiesSchema.changes.some(
      (change) =>
        change.action === "added" && change.objectType === "index" && change.name === "idx_companies_name"
    )
  );
  assert.ok(diff.schema.added.some((entry) => entry.type === "view" && entry.name === "company_names"));
});

test("backup diff validates sample limit", async (t) => {
  const { backupService } = createFixture(t);
  const backup = await backupService.createActiveBackup({
    name: "Before migration",
  });

  assert.throws(
    () => backupService.diffBackupWithCurrent(backup.id, { sampleLimit: 0 }),
    /sampleLimit must be an integer/
  );
  assert.throws(
    () => backupService.diffBackupWithCurrent(backup.id, { sampleLimit: "many" }),
    /sampleLimit must be an integer/
  );
});

test("backup diff skips common tables without a stable key", async (t) => {
  const { backupService, connectionManager } = createFixture(t);
  const db = connectionManager.getActiveDatabase();

  db.exec(`
    CREATE TABLE logs (message TEXT);
    INSERT INTO logs (message) VALUES ('before');
  `);

  const backup = await backupService.createActiveBackup({
    name: "Before log import",
  });

  db.exec("INSERT INTO logs (message) VALUES ('after');");

  const diff = backupService.diffBackupWithCurrent(backup.id);
  const logs = diff.data.tables.find((table) => table.name === "logs");

  assert.equal(logs.status, "skipped");
  assert.equal(logs.statusLabel, "No stable key");
  assert.equal(diff.summary.skippedTables, 1);
});

test("backup diff can use non-null unique constraints as stable keys", async (t) => {
  const { backupService, connectionManager } = createFixture(t);
  const db = connectionManager.getActiveDatabase();

  db.exec(`
    CREATE TABLE tags (slug TEXT NOT NULL UNIQUE, label TEXT);
    INSERT INTO tags (slug, label) VALUES ('alpha', 'Alpha'), ('beta', 'Beta');
  `);

  const backup = await backupService.createActiveBackup({
    name: "Before tag update",
  });

  db.exec(`
    UPDATE tags SET label = 'Alpha stable' WHERE slug = 'alpha';
    DELETE FROM tags WHERE slug = 'beta';
    INSERT INTO tags (slug, label) VALUES ('gamma', 'Gamma');
  `);

  const diff = backupService.diffBackupWithCurrent(backup.id);
  const tags = diff.data.tables.find((table) => table.name === "tags");

  assert.equal(tags.status, "comparable");
  assert.deepEqual(tags.keyColumns, ["slug"]);
  assert.equal(tags.added, 1);
  assert.equal(tags.changed, 1);
  assert.equal(tags.removed, 1);
});

test("backup diff works when the active database is opened read-only", async (t) => {
  const { backupService, connection, connectionManager, directory } = createFixture(t);
  const backup = await backupService.createActiveBackup({
    name: "Before readonly check",
  });
  const db = connectionManager.getActiveDatabase();

  db.exec("UPDATE companies SET name = 'Acme Corp' WHERE id = 1;");
  connectionManager.openConnection({
    filePath: path.join(directory, "source.sqlite"),
    label: "Source",
    id: connection.id,
    makeActive: true,
    readOnly: true,
  });

  const diff = backupService.diffBackupWithCurrent(backup.id);

  assert.equal(connectionManager.getActiveConnection().readOnly, true);
  assert.equal(diff.summary.rowsChanged, 1);
});

test("delete backup removes file, record, and manifest entry", async (t) => {
  const { backupService, store } = createFixture(t);
  const backup = await backupService.createActiveBackup({ name: "Manual backup" });
  const backupPath = backup.path;

  backupService.deleteBackup(backup.id);

  assert.equal(fs.existsSync(backupPath), false);
  assert.equal(store.getBackup(backup.id), null);
});
