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
    createSettingsRouter({ appStateStore: store, connectionManager, tokenService })
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

  const deleteResponse = await fetch(`${baseUrl}/api-tokens/${created.data.id}`, {
    method: "DELETE",
  });
  const deleted = await deleteResponse.json();

  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(deleted.data, { id: created.data.id, deleted: true });
  assert.equal(deleted.metadata.apiTokens.length, 0);
});
