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

test("GET /api/settings/mcp returns MCP status and exposed tools", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-hub-settings-mcp-"));
  const store = new AppStateStore(path.join(directory, "state.db"));
  const tokenService = new ApiTokenService({ appStateStore: store });
  const connectionManager = {
    getActiveConnection: () => null,
  };

  store.patchMcpStatus({
    serverRunning: true,
    connected: true,
    activeClientCount: 1,
    lastConnectedAt: "2026-06-28T10:15:00.000Z",
    lastToolCallAt: "2026-06-28T10:16:12.000Z",
    lastToolName: "get_schema",
    transport: "http",
  });

  const app = express();

  app.use(express.json());
  app.use(
    "/api/settings",
    createSettingsRouter({
      appStateStore: store,
      connectionManager,
      tokenService,
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

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/settings/mcp`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.enabled, true);
  assert.equal(payload.data.serverRunning, true);
  assert.equal(payload.data.connected, true);
  assert.equal(payload.data.activeClientCount, 1);
  assert.equal(payload.data.lastToolName, "get_schema");
  assert.equal(payload.data.transport, "http");
  assert.ok(payload.data.exposedTools.includes("list_connections"));
  assert.ok(payload.data.exposedTools.includes("run_readonly_query"));
  assert.ok(payload.data.toolDetails.some((tool) => tool.name === "get_schema"));
  assert.match(payload.data.codexConfig, /\[mcp_servers\.sqlitehub\]/);
  assert.match(payload.data.codexConfig, /url = "http:\/\/127\.0\.0\.1:\d+\/mcp"/);
  assert.match(payload.data.command, /http:\/\/127\.0\.0\.1:\d+\/mcp/);
  assert.match(payload.data.stdioCommand, /sqlite-hub-mcp\.js/);
});
