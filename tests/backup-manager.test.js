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
  assert.match(path.relative(backupService.backupRootDirectory, backup.path), /^conn_source\//);
  assert.equal(stored.checksumSha256.length, 64);
  assert.equal(stored.tableCount, 1);
  assert.equal(stored.rowCount, 2);
  assert.equal(manifest.databaseId, connection.id);
  assert.equal(manifest.backups[0].id, backup.id);
  assert.equal(manifest.backups[0].status, "verified");

  store.removeRecentConnection(connection.id);
  assert.equal(store.getBackup(backup.id).connectionId, null);
});

test("backup notes can be updated after creation and manifest stays in sync", async (t) => {
  const { backupService, connection, store } = createFixture(t);

  const backup = await backupService.createActiveBackup({
    name: "Before migration",
    notes: "Initial note",
  });
  const updated = backupService.updateBackupNotes(backup.id, "Reviewed after restore test");
  const manifestPath = path.join(
    backupService.backupRootDirectory,
    connection.id,
    "manifest.json"
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.equal(updated.notes, "Reviewed after restore test");
  assert.equal(store.getBackup(backup.id).notes, "Reviewed after restore test");
  assert.equal(manifest.backups[0].notes, "Reviewed after restore test");
});

test("delete backup removes file, record, and manifest entry", async (t) => {
  const { backupService, store } = createFixture(t);
  const backup = await backupService.createActiveBackup({ name: "Manual backup" });
  const backupPath = backup.path;

  backupService.deleteBackup(backup.id);

  assert.equal(fs.existsSync(backupPath), false);
  assert.equal(store.getBackup(backup.id), null);
});
