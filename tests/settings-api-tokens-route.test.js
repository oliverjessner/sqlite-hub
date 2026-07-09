const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createSettingsRouter } = require("../server/routes/settings");
const { ApiTokenService } = require("../server/services/apiTokenService");
const { AppStateStore } = require("../server/services/storage/appStateStore");
const { errorMiddleware } = require("../server/utils/errors");

test("settings routes create and delete tokens for the active database", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-settings-token-"));
  const store = new AppStateStore(path.join(directory, "state.db"));
  const connection = {
    id: "db-active",
    label: "Active Database",
    path: path.join(directory, "active.db"),
    lastOpenedAt: new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
    sizeBytes: 0,
    readOnly: false,
    logoPath: null,
  };

  store.upsertRecentConnection(connection);

  const tokenService = new ApiTokenService({ appStateStore: store });
  const connectionManager = {
    getActiveConnection: () => connection,
  };
  const app = express();

  app.use(express.json());
  app.use(
    "/api/settings",
    createSettingsRouter({
      appStateStore: store,
      connectionManager,
      tokenService,
      versionCheckService: async () => ({
        packageName: "sqlite-hub",
        currentVersion: "1.0.1",
        latestVersion: "1.1.0",
        updateAvailable: true,
        checkedAt: "2026-06-19T20:00:00.000Z",
        source: "npm",
        releaseUrl: "https://www.npmjs.com/package/sqlite-hub/v/1.1.0",
      }),
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

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/settings`;
  const createResponse = await fetch(`${baseUrl}/api-tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Settings token" }),
  });
  const created = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(created.data.databaseKey, connection.id);
  assert.match(created.data.token, /^shub_/);
  assert.equal(created.metadata.apiTokens.length, 1);
  assert.equal(created.metadata.apiTokens[0].token, undefined);
  assert.equal(created.metadata.apiTokens[0].callCount, 0);
  assert.equal(created.metadata.apiTokens[0].lastCallAt, null);

  const createLog = store
    .listAccessLogs({ source: "user", databaseKey: connection.id })
    .items.find((entry) => entry.action === "settings.api-token.create");

  assert.equal(createLog.targetType, "api-token");
  assert.equal(createLog.targetName, "Settings token");
  assert.equal(createLog.metadata.apiTokenId, created.data.id);
  assert.equal(createLog.metadata.apiTokenName, "Settings token");
  assert.equal(createLog.metadata.tokenPrefix, created.data.tokenPrefix);
  assert.equal(createLog.metadata.token, undefined);

  store.recordAccessLog({
    source: "api",
    action: "api.databases.get",
    databaseKey: connection.id,
    targetType: "database",
    targetName: connection.id,
    status: "success",
    startedAt: "2026-06-25T10:00:00.000Z",
    metadata: {
      apiTokenId: created.data.id,
      apiTokenName: "Settings token",
    },
  });
  store.recordAccessLog({
    source: "api",
    action: "api.tables.list",
    databaseKey: connection.id,
    targetType: "tables",
    targetName: connection.id,
    status: "success",
    startedAt: "2026-06-25T11:00:00.000Z",
    metadata: {
      apiTokenId: created.data.id,
      apiTokenName: "Settings token",
    },
  });
  store.recordAccessLog({
    source: "cli",
    action: "cli.tables.list",
    databaseKey: connection.id,
    targetType: "tables",
    targetName: connection.id,
    status: "success",
    startedAt: "2026-06-25T12:00:00.000Z",
    metadata: {
      apiTokenId: created.data.id,
    },
  });

  const settingsResponse = await fetch(baseUrl);
  const settingsPayload = await settingsResponse.json();
  const tokenWithUsage = settingsPayload.metadata.apiTokens.find(
    (token) => token.id === created.data.id
  );

  assert.equal(settingsResponse.status, 200);
  assert.equal(tokenWithUsage.callCount, 2);
  assert.equal(tokenWithUsage.lastCallAt, "2026-06-25T11:00:00.000Z");

  const deleteResponse = await fetch(`${baseUrl}/api-tokens/${created.data.id}`, {
    method: "DELETE",
  });
  const deleted = await deleteResponse.json();

  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(deleted.data, { id: created.data.id, deleted: true });
  assert.equal(deleted.metadata.apiTokens.length, 0);

  const deleteLog = store
    .listAccessLogs({ source: "user", databaseKey: connection.id })
    .items.find((entry) => entry.action === "settings.api-token.delete");

  assert.equal(deleteLog.targetType, "api-token");
  assert.equal(deleteLog.targetName, "Settings token");
  assert.equal(deleteLog.metadata.apiTokenId, created.data.id);
  assert.equal(deleteLog.metadata.apiTokenName, "Settings token");
  assert.equal(deleteLog.metadata.tokenPrefix, created.data.tokenPrefix);
  assert.equal(deleteLog.metadata.token, undefined);

  const versionResponse = await fetch(`${baseUrl}/version-check`);
  const versionCheck = await versionResponse.json();

  assert.equal(versionResponse.status, 200);
  assert.equal(versionCheck.data.latestVersion, "1.1.0");
  assert.equal(versionCheck.data.updateAvailable, true);
  assert.equal(versionCheck.metadata.appVersion, require("../package.json").version);
});

test("settings token usage falls back to API query runs when access log is missing", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-settings-token-fallback-"));
  const store = new AppStateStore(path.join(directory, "state.db"));
  const connection = {
    id: "db-active",
    label: "Active Database",
    path: path.join(directory, "active.db"),
    lastOpenedAt: new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
    sizeBytes: 0,
    readOnly: false,
    logoPath: null,
  };

  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  store.upsertRecentConnection(connection);

  const tokenService = new ApiTokenService({ appStateStore: store });
  const created = tokenService.createToken(connection.id, "Settings token");

  store.db
    .prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
    .run("2026-06-21T08:50:29.064Z", created.id);
  store.recordQueryExecution({
    databaseKey: connection.id,
    rawSql: "SELECT 1",
    status: "success",
    executedBy: "api",
    executedAt: "2026-06-21T08:50:29.191Z",
    durationMs: 3,
    rowCount: 1,
  });

  const tokenWithUsage = tokenService
    .listTokens(connection.id)
    .find((token) => token.id === created.id);

  assert.equal(tokenWithUsage.callCount, 1);
  assert.equal(tokenWithUsage.lastCallAt, "2026-06-21T08:50:29.191Z");
});
