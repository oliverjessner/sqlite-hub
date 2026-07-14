const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");
const { AppStateStore } = require("../server/services/storage/appStateStore");
const { ConnectionManager } = require("../server/services/sqlite/connectionManager");
const {
  DatabaseDiscoveryService,
  normalizePathForComparison,
} = require("../server/services/sqlite/databaseDiscoveryService");

function createSqlite(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.exec("CREATE TABLE example (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO example (name) VALUES ('one');");
  db.close();
  return filePath;
}

function writeInvalidFile(filePath, { sqliteHeader = false } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const buffer = Buffer.alloc(256, 1);
  if (sqliteHeader) {
    Buffer.from("SQLite format 3\0").copy(buffer, 0);
  }
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function createManager(existing = []) {
  const connections = [...existing];
  return {
    listRecentConnections: () => connections.map((item) => ({ ...item })),
    rememberConnection(options) {
      const connection = {
        id: `conn_${connections.length + 1}`,
        label: options.label,
        path: options.filePath,
        readOnly: options.readOnly,
      };
      connections.push(connection);
      return connection;
    },
  };
}

async function waitForScan(service, sessionId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const session = service.getScan(sessionId);
    if (session.status !== "running") {
      return session;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for discovery scan.");
}

function createTestService(root, options = {}) {
  return new DatabaseDiscoveryService({
    connectionManager: options.connectionManager ?? createManager(),
    platform: options.platform ?? "linux",
    homeDirectory: root,
    scanLocations: options.scanLocations ?? {},
    previewTimeoutMs: 50,
  });
}

test("database discovery exposes platform-specific default scan locations", () => {
  const manager = createManager();
  const mac = new DatabaseDiscoveryService({
    connectionManager: manager,
    platform: "darwin",
    homeDirectory: "/Users/test",
  });
  const windows = new DatabaseDiscoveryService({
    connectionManager: manager,
    platform: "win32",
    homeDirectory: "C:\\Users\\test",
    environment: {
      APPDATA: "C:\\Users\\test\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
      PROGRAMDATA: "C:\\ProgramData",
    },
  });
  const linux = new DatabaseDiscoveryService({
    connectionManager: manager,
    platform: "linux",
    homeDirectory: "/home/test",
    environment: {
      XDG_CONFIG_HOME: "/home/test/custom-config",
      XDG_DATA_HOME: "/home/test/custom-data",
      XDG_CACHE_HOME: "/home/test/custom-cache",
    },
  });

  assert.deepEqual(mac.getScanLocations().filter((item) => !item.optional).map((item) => item.key), [
    "applicationSupport",
    "containers",
    "groupContainers",
  ]);
  assert.deepEqual(windows.getScanLocations().map((item) => [item.key, item.path, item.optional]), [
    ["roamingAppData", "C:\\Users\\test\\AppData\\Roaming", false],
    ["localAppData", "C:\\Users\\test\\AppData\\Local", false],
    ["programData", "C:\\ProgramData", true],
  ]);
  assert.deepEqual(linux.getScanLocations().map((item) => [item.key, item.path, item.optional]), [
    ["xdgConfig", "/home/test/custom-config", false],
    ["xdgData", "/home/test/custom-data", false],
    ["flatpakData", "/home/test/.var/app", false],
    ["xdgCache", "/home/test/custom-cache", true],
    ["snapData", "/home/test/snap", true],
    ["systemData", "/var/lib", true],
  ]);
});

test("database discovery detects SQLite files with and without extensions", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-discovery-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  createSqlite(path.join(root, "catalog.sqlite"));
  createSqlite(path.join(root, "History"));
  writeInvalidFile(path.join(root, "fake.db"));

  const service = createTestService(root);
  const started = service.startScan({ customDirectories: [root] });
  const completed = await waitForScan(service, started.id);

  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.results.map((item) => item.name).sort(), ["History", "catalog"]);
  assert.equal(completed.results.find((item) => item.name === "History").extension, null);
});

test("database discovery excludes sidecars, symlinks, unreadable files, and duplicate paths", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-discovery-exclusions-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const databasePath = createSqlite(path.join(root, "nested", "main.db"));
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    fs.copyFileSync(databasePath, `${databasePath}${suffix}`);
  }
  fs.symlinkSync(databasePath, path.join(root, "linked.db"));
  const unreadablePath = createSqlite(path.join(root, "private.db"));
  fs.chmodSync(unreadablePath, 0o000);
  t.after(() => {
    if (fs.existsSync(unreadablePath)) {
      fs.chmodSync(unreadablePath, 0o600);
    }
  });

  const service = createTestService(root);
  const completed = await waitForScan(
    service,
    service.startScan({ customDirectories: [root, path.join(root, "nested")] }).id
  );

  assert.deepEqual(completed.results.map((item) => item.path), [databasePath]);
  assert.ok(completed.progress.inaccessibleCount >= 1);
});

test("database discovery normalizes paths and hides existing Connections by default", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-discovery-connected-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const databasePath = createSqlite(path.join(root, "Known.db"));
  const manager = createManager([{ id: "known", label: "Known", path: databasePath.toUpperCase() }]);
  const service = createTestService(root, { connectionManager: manager, platform: "darwin" });

  const hidden = await waitForScan(service, service.startScan({ customDirectories: [root] }).id);
  assert.equal(hidden.results.length, 0);
  assert.equal(hidden.progress.alreadyConnectedCount, 1);

  const shown = await waitForScan(
    service,
    service.startScan({ customDirectories: [root], showAlreadyConnected: true }).id
  );
  assert.equal(shown.results[0].isAlreadyConnected, true);
  assert.equal(shown.results[0].existingConnectionId, "known");
  assert.equal(
    normalizePathForComparison(databasePath, { platform: "darwin" }),
    normalizePathForComparison(databasePath.toUpperCase(), { platform: "darwin" })
  );
  assert.equal(
    normalizePathForComparison("C:\\Users\\Test\\AppData\\History", { platform: "win32" }),
    normalizePathForComparison("c:\\users\\test\\appdata\\history", { platform: "win32" })
  );
});

test("database discovery preview is read-only and tolerates damaged databases", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-discovery-preview-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  createSqlite(path.join(root, "healthy.db"));
  writeInvalidFile(path.join(root, "damaged.db"), { sqliteHeader: true });
  const service = createTestService(root);
  const completed = await waitForScan(service, service.startScan({ customDirectories: [root] }).id);
  const healthy = completed.results.find((item) => item.name === "healthy");
  const damaged = completed.results.find((item) => item.name === "damaged");

  const healthyPreview = await service.inspectDatabase(completed.id, healthy.id);
  const damagedPreview = await service.inspectDatabase(completed.id, damaged.id);

  assert.equal(healthyPreview.previewStatus, "loaded");
  assert.equal(healthyPreview.tableCount, 1);
  assert.deepEqual(healthyPreview.tableNames, ["example"]);
  assert.equal(damagedPreview.previewStatus, "failed");
  assert.match(damagedPreview.previewError, /could not be inspected/);
});

test("database discovery scans are cancellable", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-discovery-cancel-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (let index = 0; index < 20; index += 1) {
    createSqlite(path.join(root, `folder-${index}`, `${index}.db`));
  }

  const service = createTestService(root);
  const started = service.startScan({ customDirectories: [root] });
  const cancelled = service.cancelScan(started.id);

  assert.equal(cancelled.status, "cancelled");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(service.getScan(started.id).status, "cancelled");
});

test("database discovery imports selected databases with unique names and partial success", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-discovery-import-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const historyPath = createSqlite(path.join(root, "Arc", "History"));
  const cookiesPath = createSqlite(path.join(root, "Arc", "Cookies"));
  const manager = createManager([{ id: "old", label: "Arc – History", path: path.join(root, "old.db") }]);
  const service = createTestService(root, {
    connectionManager: manager,
    scanLocations: {
      applicationSupport: { label: "Application Support", absolutePath: root, optional: false },
    },
  });
  const completed = await waitForScan(service, service.startScan().id);
  const history = completed.results.find((item) => item.path === historyPath);
  const cookies = completed.results.find((item) => item.path === cookiesPath);
  fs.rmSync(cookiesPath);

  const imported = service.importDatabases(completed.id, [history.id, cookies.id]);

  assert.equal(imported.added.length, 1);
  assert.equal(imported.failed.length, 1);
  assert.equal(imported.added[0].label, "Arc – History (2)");
  assert.equal(imported.added[0].readOnly, true);
});

test("extensionless discovered databases can be remembered and opened read-only", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-discovery-extensionless-"));
  const databasePath = createSqlite(path.join(root, "History"));
  const store = new AppStateStore(path.join(root, "state.db"));
  const manager = new ConnectionManager({ appStateStore: store });
  t.after(() => {
    manager.closeCurrent();
    store.db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const remembered = manager.rememberConnection({
    filePath: databasePath,
    label: "History",
    readOnly: true,
  });
  const opened = manager.selectActiveConnection(remembered.id);

  assert.equal(opened.path, databasePath);
  assert.equal(opened.readOnly, true);
});
