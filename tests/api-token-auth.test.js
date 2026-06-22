const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createExternalApiRouter } = require("../server/routes/externalApi");
const { ApiTokenService } = require("../server/services/apiTokenService");
const { AppStateStore } = require("../server/services/storage/appStateStore");
const { ReadOnlyError } = require("../server/utils/errors");
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
    executeRawQuery(databaseId, sql, options = {}) {
      serviceCalls.push(
        `${databaseId}:query:${sql}:${options.storeName ?? ""}:${options.executedBy ?? ""}`
      );
      if (sql === "READONLY") {
        throw new ReadOnlyError("Cannot execute raw SQL against a read-only database.");
      }
      return {
        result: {
          sql,
          statementCount: 1,
          statements: [],
          rows: [],
          columns: [],
          affectedRowCount: 0,
          resultKind: "unknown",
          timingMs: 2,
          historyId: 42,
          storedQuery: options.storeName
            ? {
                id: 42,
                title: options.storeName,
                isSaved: true,
              }
            : null,
        },
      };
    },
    executeSavedQuery(databaseId, queryName, options = {}) {
      serviceCalls.push(`${databaseId}:saved:${queryName}:${options.executedBy ?? ""}`);
      return {
        query: {
          id: 7,
          title: queryName,
          rawSql: "SELECT 1",
        },
        result: {
          sql: "SELECT 1",
          statementCount: 1,
          statements: [],
          rows: [],
          columns: [],
          affectedRowCount: 0,
          resultKind: "resultSet",
          timingMs: 3,
          historyId: 7,
        },
      };
    },
    generateTableTypes(databaseId, tableName, target, options = {}) {
      serviceCalls.push(`${databaseId}:types:${tableName}:${target}:${options.propertyNaming ?? ""}`);
      return {
        target,
        language: target,
        tableName,
        typeName: "Company",
        fileName: "Company.ts",
        code: "export interface Company {}",
        warnings: ["SQLite uses dynamic typing."],
        metadata: {
          columnCount: 2,
          generatedColumnCount: 0,
          hiddenColumnCount: 0,
          checkConstraintsFound: 0,
          checkConstraintsApplied: 0,
          checkConstraintsIgnored: 0,
        },
      };
    },
  };
  const app = express();

  app.use(express.json());
  app.use(
    "/api/v1",
    createExternalApiRouter({
      databaseService,
      tokenService,
      appInfoService: async ({ port, url }) => ({
        packageName: "sqlite-hub",
        appVersion: "1.0.1",
        sqliteVersion: "3.50.0",
        port,
        url,
        versionCheck: {
          packageName: "sqlite-hub",
          currentVersion: "1.0.1",
          latestVersion: "1.0.1",
          updateAvailable: false,
          checkedAt: "2026-06-20T10:00:00.000Z",
          source: "npm",
          releaseUrl: "https://www.npmjs.com/package/sqlite-hub/v/1.0.1",
          status: "current",
        },
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

test("public API info returns app and version status without a token", async (t) => {
  const fixture = await startApi(t);
  const response = await fetch(`${fixture.baseUrl}/info`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.packageName, "sqlite-hub");
  assert.equal(payload.data.appVersion, "1.0.1");
  assert.equal(payload.data.sqliteVersion, "3.50.0");
  assert.equal(payload.data.versionCheck.status, "current");
  assert.equal(payload.data.versionCheck.updateAvailable, false);
  assert.match(payload.data.url, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test("query API executes raw SQL with a database token", async (t) => {
  const fixture = await startApi(t);
  const created = fixture.tokenService.createToken(fixture.databaseA.id, "Automation");
  const response = await fetch(`${fixture.baseUrl}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${created.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      databaseId: fixture.databaseA.id,
      sql: "SELECT 1",
      store: "Stored API Query",
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.sql, "SELECT 1");
  assert.equal(payload.data.historyId, 42);
  assert.equal(payload.data.storedQuery.title, "Stored API Query");
  assert.equal(payload.metadata.stored, true);
  assert.equal(payload.metadata.databaseId, fixture.databaseA.id);
  assert.deepEqual(fixture.serviceCalls, [
    `${fixture.databaseA.id}:query:SELECT 1:Stored API Query:api`,
  ]);
});

test("query API rejects read-only raw SQL execution", async (t) => {
  const fixture = await startApi(t);
  const created = fixture.tokenService.createToken(fixture.databaseA.id, "Automation");
  const response = await fetch(`${fixture.baseUrl}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${created.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      databaseId: fixture.databaseA.id,
      sql: "READONLY",
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.equal(payload.error.code, "SQLITE_READONLY");
});

test("type generation API uses database token auth and returns warnings at top level", async (t) => {
  const fixture = await startApi(t);
  const created = fixture.tokenService.createToken(fixture.databaseA.id, "Automation");
  const response = await fetch(
    `${fixture.baseUrl}/databases/${fixture.databaseA.id}/tables/companies/types`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${created.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target: "typescript",
        options: {
          propertyNaming: "camel",
        },
      }),
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.message, "Types generated.");
  assert.equal(payload.data.code, "export interface Company {}");
  assert.equal(payload.data.warnings, undefined);
  assert.deepEqual(payload.warnings, ["SQLite uses dynamic typing."]);
  assert.equal(payload.metadata.columnCount, 2);
  assert.deepEqual(fixture.serviceCalls, [
    `${fixture.databaseA.id}:types:companies:typescript:camel`,
  ]);
});

test("saved query API records executions as api", async (t) => {
  const fixture = await startApi(t);
  const created = fixture.tokenService.createToken(fixture.databaseA.id, "Automation");
  const response = await fetch(
    `${fixture.baseUrl}/databases/${fixture.databaseA.id}/queries/Hype-Reversal/execute`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${created.token}` },
    }
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.historyId, 7);
  assert.equal(payload.metadata.query.title, "Hype-Reversal");
  assert.deepEqual(fixture.serviceCalls, [
    `${fixture.databaseA.id}:saved:Hype-Reversal:api`,
  ]);
});
