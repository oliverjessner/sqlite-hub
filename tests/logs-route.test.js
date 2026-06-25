const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createLogsRouter } = require("../server/routes/logs");
const { AppStateStore } = require("../server/services/storage/appStateStore");
const { errorMiddleware } = require("../server/utils/errors");

async function startLogsApi(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-logs-route-"));
  const store = new AppStateStore(path.join(directory, "state.db"));
  const connection = {
    id: "db-one",
    label: "Database One",
  };
  const app = express();

  store.recordQueryExecution({
    databaseKey: connection.id,
    rawSql: "SELECT * FROM companies",
    status: "success",
    durationMs: 5,
    rowCount: 2,
    executedAt: "2026-06-25T09:00:00.000Z",
    executedBy: "cli",
  });
  store.recordQueryExecution({
    databaseKey: connection.id,
    rawSql: "DROP TABLE stale_cache",
    status: "error",
    durationMs: 3,
    errorMessage: "no such table: stale_cache",
    executedAt: "2026-06-25T09:05:00.000Z",
    executedBy: "api",
  });
  store.recordAccessLog({
    source: "api",
    action: "api.table.types.generate",
    databaseKey: connection.id,
    targetType: "table",
    targetName: "companies",
    status: "success",
    startedAt: "2026-06-25T09:10:00.000Z",
    durationMs: 7,
  });
  store.recordAccessLog({
    source: "api",
    action: "api.database.info",
    databaseKey: "db-two",
    targetType: "database",
    targetName: "Other Database",
    status: "success",
    startedAt: "2026-06-25T09:15:00.000Z",
    durationMs: 4,
  });

  app.use(
    "/api/logs",
    createLogsRouter({
      appStateStore: store,
      connectionManager: {
        getActiveConnection() {
          return connection;
        },
      },
      now: () => new Date("2026-06-25T10:00:00.000Z"),
    })
  );
  app.use(errorMiddleware);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/api/logs`,
  };
}

test("logs route combines query history and access log with useful filters", async (t) => {
  const api = await startLogsApi(t);
  const defaultResponse = await fetch(api.baseUrl);
  const defaultPayload = await defaultResponse.json();

  assert.equal(defaultResponse.status, 200);
  assert.equal(defaultPayload.metadata.range, "all");
  assert.equal(defaultPayload.data.total, 3);

  const allResponse = await fetch(`${api.baseUrl}?range=all`);
  const allPayload = await allResponse.json();

  assert.equal(allResponse.status, 200);
  assert.equal(allPayload.data.total, 3);
  assert.deepEqual(
    allPayload.data.items.map((item) => item.kind),
    ["access", "query", "query"]
  );

  const ignoredScopeResponse = await fetch(`${api.baseUrl}?range=all&databaseScope=all`);
  const ignoredScopePayload = await ignoredScopeResponse.json();

  assert.equal(ignoredScopePayload.data.total, 3);
  assert.ok(ignoredScopePayload.data.items.every((item) => item.databaseKey === "db-one"));

  const cliResponse = await fetch(`${api.baseUrl}?range=all&actor=cli&kind=query`);
  const cliPayload = await cliResponse.json();

  assert.equal(cliPayload.data.total, 1);
  assert.equal(cliPayload.data.items[0].executedBy, "cli");
  assert.equal(cliPayload.data.items[0].queryType, "select");

  const destructiveResponse = await fetch(
    `${api.baseUrl}?range=all&destructive=yes&status=error`
  );
  const destructivePayload = await destructiveResponse.json();

  assert.equal(destructivePayload.data.total, 1);
  assert.equal(destructivePayload.data.items[0].destructive, true);
  assert.match(destructivePayload.data.items[0].rawSql, /DROP TABLE/);
});

test("logs route requires an active database", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-logs-route-missing-db-"));
  const store = new AppStateStore(path.join(directory, "state.db"));
  const app = express();

  store.recordAccessLog({
    source: "api",
    action: "api.database.info",
    databaseKey: "db-one",
    targetType: "database",
    targetName: "Database One",
    status: "success",
    startedAt: "2026-06-25T09:10:00.000Z",
    durationMs: 7,
  });

  app.use(
    "/api/logs",
    createLogsRouter({
      appStateStore: store,
      connectionManager: {
        getActiveConnection() {
          return null;
        },
      },
    })
  );
  app.use(errorMiddleware);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/logs?range=all`);
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "ACTIVE_DATABASE_REQUIRED");
});
