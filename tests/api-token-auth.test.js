const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createExternalApiRouter } = require("../server/routes/externalApi");
const { ApiTokenService } = require("../server/services/apiTokenService");
const { AppStateStore } = require("../server/services/storage/appStateStore");
const { errorMiddleware } = require("../server/utils/errors");

function createConnection(id, label, databasePath) {
  return {
    id,
    label,
    path: databasePath,
    lastOpenedAt: new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
    sizeBytes: 0,
    readOnly: false,
    logoPath: null,
  };
}

async function startApi(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-api-token-"));
  const store = new AppStateStore(path.join(directory, "state.db"));
  const databaseA = createConnection("db-a", "Database A", path.join(directory, "a.db"));
  const databaseB = createConnection("db-b", "Database B", path.join(directory, "b.db"));

  store.upsertRecentConnection(databaseA);
  store.upsertRecentConnection(databaseB, { makeActive: false });

  const tokenService = new ApiTokenService({ appStateStore: store });
  const serviceCalls = [];
  const databaseService = {
    listTables(databaseId) {
      serviceCalls.push(databaseId);
      return [{ name: "companies" }];
    },
  };
  const app = express();

  app.use(express.json());
  app.use(
    "/api/v1",
    createExternalApiRouter({ databaseService, tokenService })
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
    baseUrl: `http://127.0.0.1:${server.address().port}/api/v1`,
    databaseA,
    databaseB,
    serviceCalls,
    store,
    tokenService,
  };
}

test("tokens are hashed, deletable, and isolated per database", async (t) => {
  const fixture = await startApi(t);
  const created = fixture.tokenService.createToken(fixture.databaseA.id, "Automation");

  assert.match(created.token, /^shub_[A-Za-z0-9_-]+$/);
  assert.equal(fixture.tokenService.listTokens(fixture.databaseA.id)[0].token, undefined);

  const stored = fixture.store.db
    .prepare("SELECT token_hash, token_prefix FROM api_tokens WHERE id = ?")
    .get(created.id);

  assert.notEqual(stored.token_hash, created.token);
  assert.equal(stored.token_prefix, created.tokenPrefix);
  assert.equal(fixture.tokenService.authenticate(fixture.databaseA.id, created.token).id, created.id);
  assert.throws(
    () => fixture.tokenService.authenticate(fixture.databaseB.id, created.token),
    /invalid for this database/
  );

  const validResponse = await fetch(
    `${fixture.baseUrl}/databases/${fixture.databaseA.id}/tables`,
    { headers: { Authorization: `Bearer ${created.token}` } }
  );
  const validPayload = await validResponse.json();

  assert.equal(validResponse.status, 200);
  assert.deepEqual(validPayload.data.items, [{ name: "companies" }]);
  assert.deepEqual(fixture.serviceCalls, [fixture.databaseA.id]);

  const invalidResponse = await fetch(
    `${fixture.baseUrl}/databases/${fixture.databaseA.id}/tables`,
    { headers: { Authorization: "Bearer invalid" } }
  );
  assert.equal(invalidResponse.status, 401);

  const missingResponse = await fetch(
    `${fixture.baseUrl}/databases/${fixture.databaseA.id}/tables`
  );
  assert.equal(missingResponse.status, 401);

  const wrongDatabaseResponse = await fetch(
    `${fixture.baseUrl}/databases/${fixture.databaseB.id}/tables`,
    { headers: { Authorization: `Bearer ${created.token}` } }
  );
  assert.equal(wrongDatabaseResponse.status, 401);
  assert.deepEqual(fixture.serviceCalls, [fixture.databaseA.id]);

  fixture.tokenService.deleteToken(fixture.databaseA.id, created.id);
  assert.equal(fixture.tokenService.listTokens(fixture.databaseA.id).length, 0);
  assert.throws(
    () => fixture.tokenService.authenticate(fixture.databaseA.id, created.token),
    /invalid for this database/
  );
});
