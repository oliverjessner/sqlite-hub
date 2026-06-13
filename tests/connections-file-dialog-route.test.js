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
