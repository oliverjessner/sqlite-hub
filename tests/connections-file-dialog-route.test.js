const assert = require("node:assert/strict");
const express = require("express");
const test = require("node:test");
const { createConnectionsRouter } = require("../server/routes/connections");
const { errorMiddleware } = require("../server/utils/errors");

test("connections route returns the path selected by the native dialog", async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/connections",
    createConnectionsRouter({
      connectionManager: {},
      importService: {},
      backupService: {},
      nativeFileDialogService: {
        chooseCreateDatabasePath: async () => "/tmp/new-database.sqlite",
        chooseOpenDatabasePath: async () => "/tmp/existing-database.db",
      },
    })
  );
  app.use(errorMiddleware);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/connections/choose-create-path`,
      { method: "POST" }
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.deepEqual(payload.data, {
      cancelled: false,
      path: "/tmp/new-database.sqlite",
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("connections route returns the existing database selected by the native dialog", async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/connections",
    createConnectionsRouter({
      connectionManager: {},
      importService: {},
      backupService: {},
      nativeFileDialogService: {
        chooseCreateDatabasePath: async () => null,
        chooseOpenDatabasePath: async () => "/tmp/existing-database.db",
      },
    })
  );
  app.use(errorMiddleware);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/connections/choose-open-path`,
      { method: "POST" }
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.deepEqual(payload.data, {
      cancelled: false,
      path: "/tmp/existing-database.db",
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("connections routes expose discovery scan, preview, cancellation, and partial import", async () => {
  const app = express();
  app.use(express.json());
  const session = {
    id: "scan-1",
    status: "running",
    progress: { scannedFiles: 1 },
    results: [],
  };
  const databaseDiscoveryService = {
    getScanLocations: () => [{ key: "applicationSupport", optional: false }],
    startScan: () => session,
    getScan: () => ({ ...session, status: "completed" }),
    cancelScan: () => ({ ...session, status: "cancelled" }),
    inspectDatabase: async () => ({ id: "db-1", previewStatus: "loaded", tableCount: 2 }),
    importDatabases: () => ({ added: [{ id: "conn-1" }], failed: [{ id: "db-2", reason: "missing" }] }),
  };
  app.use(
    "/api/connections",
    createConnectionsRouter({
      connectionManager: {},
      importService: {},
      backupService: {},
      databaseDiscoveryService,
      nativeFileDialogService: { chooseDirectoryPath: async () => "/tmp/databases" },
    })
  );
  app.use(errorMiddleware);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api/connections/discovery`;
    const started = await fetch(`${base}/scan`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const preview = await fetch(`${base}/scan/scan-1/preview/db-1`);
    const imported = await fetch(`${base}/scan/scan-1/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resultIds: ["db-1", "db-2"] }),
    });
    const importedPayload = await imported.json();

    assert.equal(started.status, 202);
    assert.equal((await preview.json()).data.previewStatus, "loaded");
    assert.equal(importedPayload.data.added.length, 1);
    assert.equal(importedPayload.data.failed.length, 1);
    assert.match(importedPayload.message, /1 databases were added/);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
